import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { resolveCanonicalRsvpId } from "./lib/canonicalUserIdentity";
import { contactToPerson, readContactPage, validateContactFilters } from "./lib/contactQueries";
import { contactConsent, resolveContact, resolveContactPhone } from "./lib/contactRecords";
import {
  CONTACT_BATCH_SIZE,
  contactAudienceValidator,
  contactReplyActionValidator,
} from "./lib/contactValidators";
import { ensureEventInSiteScope, ensureTextBlastInSiteScope } from "./lib/siteScope";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { hasActiveReplyActionCollision, normalizeReplyActionsForStorage } from "./textBlasts";

export async function resolveContactEligibility(
  ctx: Pick<QueryCtx, "db">,
  contact: Doc<"workspaceContacts">,
  messageEventId?: Id<"events">,
  includeQrCodes = false,
): Promise<{
  eligible: boolean;
  redemptionCode?: string;
  redemptionClerkUserId?: string;
  reason?: string;
}> {
  const consent = await contactConsent(ctx, contact);
  if (!contact.phoneNumber || !contact.phoneHash || !/^\+[1-9]\d{6,14}$/.test(contact.phoneNumber))
    return { eligible: false, redemptionCode: undefined, reason: "missing_phone" };
  if (!consent.smsConsent)
    return {
      eligible: false,
      redemptionCode: undefined,
      reason: consent.hasOptedOut ? "opted_out" : "no_consent",
    };
  if (contact.primaryClerkUserId) {
    const currentPhone = await resolveContactPhone(ctx, contact.primaryClerkUserId);
    if (
      currentPhone.phoneHash !== contact.phoneHash ||
      currentPhone.phoneNumber !== contact.phoneNumber
    )
      return { eligible: false, reason: "phone_changed" };
  }
  let redemptionClerkUserId: string | undefined;
  let redemptionCode: string | undefined;
  if (includeQrCodes) {
    if (!messageEventId) return { eligible: false, redemptionCode, reason: "missing_ticket" };
    for (const clerkUserId of contact.clerkUserIds) {
      const redemption = await ctx.db
        .query("redemptions")
        .withIndex("by_event_user", (builder) =>
          builder.eq("eventId", messageEventId).eq("clerkUserId", clerkUserId),
        )
        .first();
      const rsvp = await ctx.db
        .query("rsvps")
        .withIndex("by_event_user", (builder) =>
          builder.eq("eventId", messageEventId).eq("clerkUserId", clerkUserId),
        )
        .first();
      if (
        redemption &&
        redemption.disabledAt === undefined &&
        rsvp &&
        (rsvp.approvalStatus ?? rsvp.status) === "approved"
      ) {
        redemptionCode = redemption.code;
        redemptionClerkUserId = clerkUserId;
        break;
      }
    }
    if (!redemptionCode) return { eligible: false, redemptionCode, reason: "missing_ticket" };
  }
  return { eligible: true, redemptionCode, redemptionClerkUserId };
}

export const prepare = mutation({
  args: {
    workspaceSlug: v.string(),
    siteKey: v.optional(v.string()),
    audience: contactAudienceValidator,
    blastId: v.optional(v.id("textBlasts")),
    replyActions: v.optional(v.array(contactReplyActionValidator)),
    messageEventId: v.optional(v.id("events")),
    includeQrCodes: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"contactAudiencePreviews">> => {
    const scope = await requireWorkspaceHost(ctx, args);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const state = await ctx.db
      .query("contactDirectoryState")
      .withIndex("by_workspace", (builder) => builder.eq("workspaceId", scope.workspaceId))
      .first();
    if (state?.status !== "ready") throw new Error("The contact directory is still preparing");
    if (args.audience.type === "contacts") {
      if (!args.audience.contactIds.length)
        throw new Error("Select contacts before preparing an audience");
      if (args.audience.contactIds.length > 5000)
        throw new Error("Use Select all matching for more than 5,000 contacts");
    } else
      await validateContactFilters(
        ctx,
        scope,
        args.audience.type === "legacy_events"
          ? {
              eventIds: args.audience.eventIds,
              recipientFilter: args.audience.recipientFilter ?? "all",
              recipientHistoryFilter: args.audience.recipientHistoryFilter,
            }
          : args.audience.filters,
      );
    if (args.messageEventId)
      await ensureEventInSiteScope(ctx, args.messageEventId, {
        workspaceSlug: scope.workspaceSlug,
      });
    if (args.includeQrCodes && !args.messageEventId)
      throw new Error("Choose a message event for QR codes");
    if ((args.replyActions?.length ?? 0) > 10) throw new Error("Use at most 10 reply actions");
    if (args.blastId) await ensureTextBlastInSiteScope(ctx, args.blastId, args);
    await normalizeReplyActionsForStorage(ctx, args.replyActions, args);
    return await beginContactPreview(ctx, {
      workspaceId: scope.workspaceId,
      createdBy: identity.subject,
      blastId: args.blastId,
      replyActions: args.replyActions,
      audience: args.audience,
      messageEventId: args.messageEventId,
      includeQrCodes: args.includeQrCodes ?? false,
    });
  },
});

export async function beginContactPreview(
  ctx: MutationCtx,
  settings: Pick<
    Doc<"contactAudiencePreviews">,
    | "workspaceId"
    | "createdBy"
    | "blastId"
    | "replyActions"
    | "audience"
    | "messageEventId"
    | "includeQrCodes"
  >,
): Promise<Id<"contactAudiencePreviews">> {
  const now = Date.now();
  const previewId = await ctx.db.insert("contactAudiencePreviews", {
    ...settings,
    exclusionCounts: {},
    status: "building",
    selectedOffset: 0,
    eligibleCount: 0,
    excludedCount: 0,
    processedCount: 0,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.contactAudiences.prepareBatch, { previewId });
  return previewId;
}

export const prepareBatch = internalMutation({
  args: { previewId: v.id("contactAudiencePreviews") },
  handler: async (ctx, args) => {
    const preview = await ctx.db.get(args.previewId);
    if (!preview || preview.status !== "building") return;
    const workspace = await ctx.db.get(preview.workspaceId);
    if (!workspace) throw new Error("Workspace not found");
    try {
      if (
        preview.audience.type === "legacy_events" &&
        preview.audience.selectedRsvpIds &&
        preview.selectedOffset < preview.audience.selectedRsvpIds.length
      ) {
        const selected = preview.audience.selectedRsvpIds.slice(
          preview.selectedOffset,
          preview.selectedOffset + CONTACT_BATCH_SIZE,
        );
        for (const identifier of selected) {
          const rsvpId = await resolveCanonicalRsvpId(ctx, identifier);
          const existing = await ctx.db
            .query("contactAudienceSelections")
            .withIndex("by_preview_rsvp", (builder) =>
              builder.eq("previewId", preview._id).eq("rsvpId", rsvpId),
            )
            .first();
          if (!existing)
            await ctx.db.insert("contactAudienceSelections", { previewId: preview._id, rsvpId });
        }
        await ctx.db.patch(preview._id, {
          selectedOffset: preview.selectedOffset + selected.length,
          updatedAt: Date.now(),
        });
        await ctx.scheduler.runAfter(0, internal.contactAudiences.prepareBatch, args);
        return;
      }
      const contacts: Doc<"workspaceContacts">[] = [];
      let cursor: string | undefined;
      let selectedOffset = preview.selectedOffset;
      let isDone = false;
      let excludedCount = preview.excludedCount;
      const exclusionCounts = { ...preview.exclusionCounts };
      const replyActions = await normalizeReplyActionsForStorage(ctx, preview.replyActions, {
        workspaceSlug: workspace.slug,
      });
      if (preview.audience.type === "contacts") {
        const identifiers = preview.audience.contactIds.slice(
          selectedOffset,
          selectedOffset + (replyActions.length ? 1 : CONTACT_BATCH_SIZE),
        );
        selectedOffset += identifiers.length;
        for (const contactId of identifiers) {
          const contact = await resolveContact(ctx, contactId);
          if (!contact || contact.workspaceId !== preview.workspaceId)
            throw new Error("Contact not found in this workspace");
          contacts.push(contact);
        }
        isDone = selectedOffset >= preview.audience.contactIds.length;
      } else {
        const result = await readContactPage(ctx, {
          workspaceId: workspace._id,
          workspaceSlug: workspace.slug,
          filters:
            preview.audience.type === "legacy_events"
              ? {
                  eventIds: preview.audience.eventIds,
                  listKeys: preview.audience.targetLists,
                  recipientFilter: preview.audience.recipientFilter ?? "all",
                  recipientHistoryFilter: preview.audience.recipientHistoryFilter,
                }
              : preview.audience.filters,
          cursor: preview.cursor,
          pageSize: replyActions.length ? 1 : CONTACT_BATCH_SIZE,
          legacyAudience: preview.audience.type === "legacy_events" ? preview.audience : undefined,
          legacySelectionPreviewId: preview._id,
        });
        contacts.push(...result.contacts);
        cursor = result.nextCursor ?? undefined;
        isDone = result.isDone;
      }
      let eligibleCount = preview.eligibleCount;
      for (const contact of contacts) {
        const evaluated = await ctx.db
          .query("contactAudienceEvaluations")
          .withIndex("by_preview_contact", (builder) =>
            builder.eq("previewId", preview._id).eq("contactId", contact._id),
          )
          .first();
        if (evaluated) continue;
        await ctx.db.insert("contactAudienceEvaluations", {
          previewId: preview._id,
          contactId: contact._id,
        });
        const eligibility = await resolveContactEligibility(
          ctx,
          contact,
          preview.messageEventId,
          preview.includeQrCodes,
        );
        if (!eligibility.eligible || !contact.phoneHash) {
          excludedCount += 1;
          const reason = eligibility.reason ?? "missing_phone";
          exclusionCounts[reason] = (exclusionCounts[reason] ?? 0) + 1;
          continue;
        }
        for (const action of replyActions) {
          if (
            action.isEnabled &&
            (await hasActiveReplyActionCollision(ctx, {
              normalizedCode: action.replyCodeNormalized,
              recipientPhoneHashes: new Set([contact.phoneHash]),
              excludedTextBlastId: preview.blastId,
              now: Date.now(),
            }))
          )
            throw new Error(
              `Reply code "${action.replyCode}" is already active for a selected contact. Choose another code.`,
            );
        }
        const existing = await ctx.db
          .query("contactAudienceMembers")
          .withIndex("by_preview_phone", (builder) =>
            builder.eq("previewId", preview._id).eq("phoneHash", contact.phoneHash as string),
          )
          .first();
        if (existing) continue;
        await ctx.db.insert("contactAudienceMembers", {
          previewId: preview._id,
          contactId: contact._id,
          phoneHash: contact.phoneHash,
        });
        eligibleCount += 1;
      }
      await ctx.db.patch(preview._id, {
        status: isDone ? "ready" : "building",
        cursor,
        selectedOffset,
        eligibleCount,
        excludedCount,
        exclusionCounts,
        processedCount: preview.processedCount + contacts.length,
        updatedAt: Date.now(),
      });
      if (!isDone) await ctx.scheduler.runAfter(0, internal.contactAudiences.prepareBatch, args);
    } catch (error) {
      await ctx.db.patch(preview._id, {
        status: "failed",
        error: error instanceof Error ? error.message : "Audience preparation failed",
        updatedAt: Date.now(),
      });
    }
  },
});

export const get = query({
  args: {
    workspaceSlug: v.string(),
    siteKey: v.optional(v.string()),
    previewId: v.id("contactAudiencePreviews"),
  },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const preview = await ctx.db.get(args.previewId);
    if (!preview || preview.workspaceId !== scope.workspaceId)
      throw new Error("Audience not found");
    return preview;
  },
});

export const members = query({
  args: {
    workspaceSlug: v.string(),
    siteKey: v.optional(v.string()),
    previewId: v.id("contactAudiencePreviews"),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await requireWorkspaceHost(ctx, args);
    const preview = await ctx.db.get(args.previewId);
    if (!preview || preview.workspaceId !== scope.workspaceId)
      throw new Error("Audience not found");
    const batch = await ctx.db
      .query("contactAudienceMembers")
      .withIndex("by_preview", (builder) => builder.eq("previewId", preview._id))
      .paginate({ cursor: args.cursor ?? null, numItems: 20 });
    const people = [];
    for (const member of batch.page) {
      const contact = await resolveContact(ctx, member.contactId);
      if (contact && contact.workspaceId === scope.workspaceId)
        people.push(await contactToPerson(ctx, contact, scope));
    }
    return { people, nextCursor: batch.isDone ? null : batch.continueCursor, isDone: batch.isDone };
  },
});
