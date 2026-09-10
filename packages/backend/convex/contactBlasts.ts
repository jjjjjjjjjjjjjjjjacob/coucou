import {
  applyMessageTemplateVariables,
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  messageContainsMultiEventRestrictedVariables,
  messageContainsQrCodeUrlVariable,
} from "@coucou/sdk/shared/message-template";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { resolveContactEligibility } from "./contactAudiences";
import { internalAction, internalMutation, internalQuery, mutation } from "./functions";
import { validateContactFilters } from "./lib/contactQueries";
import { resolveContact } from "./lib/contactRecords";
import { contactAudienceValidator, contactReplyActionValidator } from "./lib/contactValidators";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import { buildEventStatusUrl, resolveEventMessageBaseUrl } from "./lib/publicBaseUrl";
import { ensureEventInSiteScope, ensureTextBlastInSiteScope } from "./lib/siteScope";
import { getSmsErrorDetails } from "./lib/smsErrorDetails";
import { formatSmsMessageForSite } from "./lib/smsProgramCopy";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { replaceReplyActionsForBlast } from "./textBlasts";

export const save = mutation({
  args: {
    workspaceSlug: v.string(),
    siteKey: v.optional(v.string()),
    blastId: v.optional(v.id("textBlasts")),
    name: v.string(),
    message: v.string(),
    audience: contactAudienceValidator,
    previewId: v.optional(v.id("contactAudiencePreviews")),
    messageEventId: v.optional(v.id("events")),
    includeQrCodes: v.boolean(),
    replyActions: v.optional(v.array(contactReplyActionValidator)),
  },
  handler: async (ctx, args): Promise<Id<"textBlasts">> => {
    const scope = await requireWorkspaceHost(ctx, args);
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    if (!args.name.trim()) throw new Error("Enter a blast name");
    if ((args.replyActions?.length ?? 0) > 10) throw new Error("Use at most 10 reply actions");
    if (args.audience.type === "contacts") {
      if (!args.audience.contactIds.length)
        throw new Error("Select contacts before saving a draft");
      if (args.audience.contactIds.length > 5000)
        throw new Error("Use Select all matching for more than 5,000 contacts");
    } else {
      await validateContactFilters(
        ctx,
        scope,
        args.audience.type === "legacy_events"
          ? {
              eventIds: args.audience.eventIds,
              recipientFilter: args.audience.recipientFilter,
              recipientHistoryFilter: args.audience.recipientHistoryFilter,
            }
          : args.audience.filters,
      );
    }
    if (args.messageEventId)
      await ensureEventInSiteScope(ctx, args.messageEventId, {
        workspaceSlug: scope.workspaceSlug,
      });
    const includeQrCodes = args.includeQrCodes || messageContainsQrCodeUrlVariable(args.message);
    if (
      !args.messageEventId &&
      (includeQrCodes || messageContainsMultiEventRestrictedVariables(args.message))
    )
      throw new Error("Choose a message event for event details or QR codes");
    const preview = args.previewId ? await ctx.db.get(args.previewId) : null;
    if (
      args.previewId &&
      (!preview ||
        preview.workspaceId !== scope.workspaceId ||
        preview.status !== "ready" ||
        JSON.stringify(preview.audience) !== JSON.stringify(args.audience) ||
        preview.messageEventId !== args.messageEventId ||
        preview.includeQrCodes !== includeQrCodes ||
        JSON.stringify(preview.replyActions ?? []) !== JSON.stringify(args.replyActions ?? []))
    )
      throw new Error("Prepare a new audience preview for these settings");
    const storedBlast = args.blastId
      ? (await ensureTextBlastInSiteScope(ctx, args.blastId, args)).blast
      : null;
    if (storedBlast && storedBlast.status !== "draft")
      throw new Error("Only contact drafts can be edited here");
    const now = Date.now();
    const fields = {
      workspaceId: scope.workspaceId,
      eventId: args.messageEventId,
      targetEventIds: args.messageEventId ? [args.messageEventId] : [],
      audience: args.audience,
      audiencePreviewId: args.previewId,
      name: args.name.trim(),
      message: args.message,
      includeQrCodes,
      targetLists: [],
      recipientCount: preview?.eligibleCount ?? 0,
      updatedAt: now,
    };
    const blastId =
      storedBlast?._id ??
      (await ctx.db.insert("textBlasts", {
        ...fields,
        status: "draft",
        sentBy: identity.subject,
        sentCount: 0,
        failedCount: 0,
        createdAt: now,
        deliveryTrackingEnabled: true,
      }));
    if (storedBlast) await ctx.db.patch(blastId, fields);
    await replaceReplyActionsForBlast(ctx, {
      textBlastId: blastId,
      replyActions: args.replyActions,
      scope: args,
    });
    return blastId;
  },
});

export const send = mutation({
  args: { workspaceSlug: v.string(), siteKey: v.optional(v.string()), blastId: v.id("textBlasts") },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, args);
    const { blast } = await ensureTextBlastInSiteScope(ctx, args.blastId, args);
    if (!blast.audience || !blast.workspaceId || !blast.audiencePreviewId)
      throw new Error("Review the contact audience before sending");
    if (blast.status !== "draft" && blast.status !== "failed")
      throw new Error("This blast is already sending or sent");
    if (!blast.message.trim()) throw new Error("Enter a message");
    const preview = await ctx.db.get(blast.audiencePreviewId);
    if (
      !preview ||
      preview.status !== "ready" ||
      preview.workspaceId !== blast.workspaceId ||
      preview.eligibleCount === 0
    )
      throw new Error("No eligible recipients in the reviewed audience");
    const sendAttempt = (blast.sendAttempt ?? 0) + 1;
    await ctx.db.patch(blast._id, {
      status: "sending",
      sentAt: Date.now(),
      sendAttempt,
      sendCursor: undefined,
      sendLeaseToken: undefined,
      sendLeaseExpiresAt: undefined,
      sentCount: 0,
      failedCount: 0,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.contactBlasts.sendBatch, {
      blastId: blast._id,
      sendAttempt,
    });
    return {
      blastId: blast._id,
      status: "sending" as const,
      totalRecipients: preview.eligibleCount,
    };
  },
});

export const claimSendBatch = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    sendAttempt: v.number(),
    cursor: v.optional(v.string()),
    leaseToken: v.string(),
  },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    if (
      !blast ||
      blast.status !== "sending" ||
      blast.sendAttempt !== args.sendAttempt ||
      blast.sendCursor !== args.cursor ||
      blast.sendLeaseToken
    )
      return false;
    await ctx.db.patch(blast._id, {
      sendLeaseToken: args.leaseToken,
      sendLeaseExpiresAt: Date.now() + 720000,
    });
    await ctx.scheduler.runAfter(720000, internal.contactBlasts.expireSendLease, {
      blastId: blast._id,
      sendAttempt: args.sendAttempt,
      leaseToken: args.leaseToken,
    });
    return true;
  },
});

export const expireSendLease = internalMutation({
  args: { blastId: v.id("textBlasts"), sendAttempt: v.number(), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    if (
      blast?.status === "sending" &&
      blast.sendAttempt === args.sendAttempt &&
      blast.sendLeaseToken === args.leaseToken &&
      (blast.sendLeaseExpiresAt ?? 0) <= Date.now()
    )
      await ctx.db.patch(blast._id, {
        status: "failed",
        sendLeaseToken: undefined,
        sendLeaseExpiresAt: undefined,
        updatedAt: Date.now(),
      });
  },
});

export const readSendBatch = internalQuery({
  args: { blastId: v.id("textBlasts"), sendAttempt: v.number(), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    if (
      !blast?.workspaceId ||
      !blast.audiencePreviewId ||
      blast.status !== "sending" ||
      blast.sendAttempt !== args.sendAttempt ||
      blast.sendCursor !== args.cursor
    )
      return null;
    const event = blast.eventId ? await ctx.db.get(blast.eventId) : null;
    const site = await ctx.db
      .query("workspaceSites")
      .withIndex("by_workspace", (builder) =>
        builder.eq("workspaceId", blast.workspaceId as Id<"workspaces">),
      )
      .first();
    const members = await ctx.db
      .query("contactAudienceMembers")
      .withIndex("by_preview", (builder) =>
        builder.eq("previewId", blast.audiencePreviewId as Id<"contactAudiencePreviews">),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 20 });
    return {
      blast,
      event,
      siteKey: event?.siteKey ?? site?.siteKey,
      members: members.page,
      nextCursor: members.isDone ? null : members.continueCursor,
    };
  },
});

export const prepareDelivery = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    memberId: v.id("contactAudienceMembers"),
    sendAttempt: v.number(),
  },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    const member = await ctx.db.get(args.memberId);
    if (
      !blast?.workspaceId ||
      blast.status !== "sending" ||
      blast.sendAttempt !== args.sendAttempt ||
      !member ||
      member.previewId !== blast.audiencePreviewId
    )
      throw new Error("Invalid delivery snapshot");
    const contact = await resolveContact(ctx, member.contactId);
    if (!contact || contact.workspaceId !== blast.workspaceId)
      throw new Error("Contact no longer exists in this workspace");
    const prior = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_phone", (builder) =>
        builder.eq("textBlastId", blast._id).eq("phoneHash", member.phoneHash),
      )
      .first();
    if (prior?.status === "sent") return { type: "sent" as const };
    // A pending request may already have reached the provider. Never send it twice after interruption.
    if (prior?.status === "pending") return { type: "uncertain" as const };
    const eligibility = await resolveContactEligibility(
      ctx,
      contact,
      blast.eventId,
      blast.includeQrCodes,
    );
    const exclusion = !eligibility.eligible
      ? "Contact no longer has SMS consent or an eligible ticket"
      : contact.phoneHash !== member.phoneHash
        ? "Contact phone changed since the audience was reviewed"
        : undefined;
    const history = await ctx.db
      .query("contactEvents")
      .withIndex("by_contact_date", (builder) => builder.eq("contactId", contact._id))
      .order("desc")
      .first();
    const now = Date.now();
    const deliveryFields = {
      workspaceId: blast.workspaceId,
      contactId: contact._id,
      textBlastId: blast._id,
      phoneHash: member.phoneHash,
      status: "pending",
      sourceEventIds: history ? [history.eventId] : [],
      sourceRsvpIds: history ? [history.rsvpId] : [],
      sourceListKeys: history?.listKey ? [history.listKey] : [],
      recipientClerkUserIds: contact.clerkUserIds,
      updatedAt: now,
    };
    const deliveryId =
      prior?._id ??
      (await ctx.db.insert("textBlastRecipients", { ...deliveryFields, createdAt: now }));
    if (prior)
      await ctx.db.patch(deliveryId, {
        ...deliveryFields,
        errorMessage: undefined,
        errorCode: undefined,
      });
    const notificationId = await ctx.db.insert("smsNotifications", {
      workspaceId: blast.workspaceId,
      eventId: blast.eventId,
      recipientClerkUserId:
        contact.primaryClerkUserId ?? contact.clerkUserIds[0] ?? `guest:${member.phoneHash}`,
      recipientPhoneHash: member.phoneHash,
      recipientPhoneObfuscated: contact.phoneNumber
        ? obfuscatePhoneNumber(contact.phoneNumber)
        : "Phone unavailable",
      type: "blast",
      message: blast.message,
      textBlastId: blast._id,
      textBlastRecipientId: deliveryId,
      status: "pending",
      createdAt: now,
    });
    await ctx.db.patch(deliveryId, { smsNotificationId: notificationId });
    return {
      type: "prepared" as const,
      contact,
      notificationId,
      deliveryId,
      redemptionCode: eligibility.redemptionCode,
      redemptionClerkUserId: eligibility.redemptionClerkUserId,
      exclusion,
    };
  },
});

export const recheckDelivery = internalQuery({
  args: {
    contactId: v.id("workspaceContacts"),
    phoneHash: v.string(),
    messageEventId: v.optional(v.id("events")),
    includeQrCodes: v.optional(v.boolean()),
    redemptionCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const contact = await resolveContact(ctx, args.contactId);
    if (!contact || contact.phoneHash !== args.phoneHash) return false;
    const eligibility = await resolveContactEligibility(
      ctx,
      contact,
      args.messageEventId,
      args.includeQrCodes,
    );
    return (
      eligibility.eligible &&
      (!args.includeQrCodes || eligibility.redemptionCode === args.redemptionCode)
    );
  },
});

export const storeMessage = internalMutation({
  args: { notificationId: v.id("smsNotifications"), message: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, { message: args.message });
  },
});

export const advanceSend = internalMutation({
  args: {
    blastId: v.id("textBlasts"),
    sendAttempt: v.number(),
    leaseToken: v.string(),
    cursor: v.optional(v.string()),
    nextCursor: v.union(v.string(), v.null()),
    sentCount: v.number(),
    failedCount: v.number(),
  },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    if (
      !blast ||
      blast.status !== "sending" ||
      blast.sendAttempt !== args.sendAttempt ||
      blast.sendCursor !== args.cursor ||
      blast.sendLeaseToken !== args.leaseToken
    )
      return;
    const sentCount = blast.sentCount + args.sentCount;
    const failedCount = blast.failedCount + args.failedCount;
    await ctx.db.patch(blast._id, {
      sendLeaseToken: undefined,
      sendLeaseExpiresAt: undefined,
      sentCount,
      failedCount,
      sendCursor: args.nextCursor ?? undefined,
      status: args.nextCursor ? "sending" : failedCount > 0 ? "failed" : "sent",
      updatedAt: Date.now(),
    });
    if (args.nextCursor)
      await ctx.scheduler.runAfter(0, internal.contactBlasts.sendBatch, {
        blastId: blast._id,
        sendAttempt: args.sendAttempt,
        cursor: args.nextCursor,
      });
  },
});

export const failSend = internalMutation({
  args: { blastId: v.id("textBlasts"), sendAttempt: v.number(), leaseToken: v.string() },
  handler: async (ctx, args) => {
    const blast = await ctx.db.get(args.blastId);
    if (
      blast?.status === "sending" &&
      blast.sendAttempt === args.sendAttempt &&
      blast.sendLeaseToken === args.leaseToken
    )
      await ctx.db.patch(blast._id, {
        status: "failed",
        sendLeaseToken: undefined,
        sendLeaseExpiresAt: undefined,
        updatedAt: Date.now(),
      });
  },
});

type DeliveryResult = {
  notificationId: Id<"smsNotifications">;
  textBlastRecipientId: Id<"textBlastRecipients">;
  clerkUserId: string;
  phoneHash: string;
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  sentAt?: number;
  messageLength?: number;
  messageType?: string;
  estimatedCost?: number;
  mediaIncluded?: boolean;
};

export const sendBatch = internalAction({
  args: { blastId: v.id("textBlasts"), sendAttempt: v.number(), cursor: v.optional(v.string()) },
  handler: async (ctx, args): Promise<void> => {
    const leaseToken = crypto.randomUUID();
    try {
      if (!(await ctx.runMutation(internal.contactBlasts.claimSendBatch, { ...args, leaseToken })))
        return;
      const batch = await ctx.runQuery(internal.contactBlasts.readSendBatch, args);
      if (!batch) return;
      const messageBaseUrl = batch.event
        ? await resolveEventMessageBaseUrl(ctx, batch.event)
        : null;
      const results: DeliveryResult[] = [];
      let alreadySent = 0;
      let uncertain = 0;
      for (const member of batch.members) {
        const prepared = await ctx.runMutation(internal.contactBlasts.prepareDelivery, {
          blastId: args.blastId,
          memberId: member._id,
          sendAttempt: args.sendAttempt,
        });
        if (prepared.type === "sent") {
          alreadySent += 1;
          continue;
        }
        if (prepared.type === "uncertain") {
          uncertain += 1;
          continue;
        }
        const contact = prepared.contact;
        const resultBase = {
          notificationId: prepared.notificationId,
          textBlastRecipientId: prepared.deliveryId,
          clerkUserId:
            prepared.redemptionClerkUserId ??
            contact.primaryClerkUserId ??
            contact.clerkUserIds[0] ??
            `guest:${member.phoneHash}`,
          phoneHash: member.phoneHash,
        };
        if (prepared.exclusion) {
          const exclusionResult = {
            ...resultBase,
            success: false,
            error: prepared.exclusion,
            errorCode: "AUDIENCE_NO_LONGER_ELIGIBLE",
          };
          await ctx.runMutation(internal.textBlasts.finalizeQueuedBlastResultBatch, {
            blastId: args.blastId,
            results: [exclusionResult],
          });
          results.push(exclusionResult);
          continue;
        }
        let deliveryResults: DeliveryResult[];
        try {
          let mediaUrl: string | undefined;
          let qrCodeUrl: string | undefined;
          if (batch.blast.includeQrCodes && batch.event && prepared.redemptionCode) {
            const baseUrl = messageBaseUrl;
            if (!baseUrl) throw new Error("Public event URL is unavailable");
            qrCodeUrl = `${baseUrl}/redeem/${prepared.redemptionCode}`;
            const storageId = await ctx.runAction(
              internal.lib.qrCodeGenerator.generateAndUploadQrCode,
              {
                value: qrCodeUrl,
                foregroundColor: batch.event.themeTextColor,
                backgroundColor: batch.event.themeBackgroundColor,
              },
            );
            mediaUrl =
              (await ctx.runAction(internal.lib.qrCodeGenerator.getQrCodeUrl, { storageId })) ??
              undefined;
            if (!mediaUrl) throw new Error("QR image could not be prepared");
          }
          const message = formatSmsMessageForSite(
            batch.siteKey,
            applyMessageTemplateVariables(batch.blast.message, {
              firstName: contact.firstName || contact.name.split(/\s+/)[0] || "there",
              eventName: batch.event ? formatEventTitleForMessageTemplate(batch.event) : "",
              eventDate: batch.event
                ? formatEventDateForMessageTemplate(
                    batch.event.eventDate,
                    batch.event.eventTimezone,
                  )
                : "",
              eventLocation: batch.event?.location ?? "",
              eventStatusUrl: batch.event ? buildEventStatusUrl(batch.event, messageBaseUrl) : "",
              qrCodeUrl: qrCodeUrl ?? "",
            }),
          );
          await ctx.runMutation(internal.contactBlasts.storeMessage, {
            notificationId: prepared.notificationId,
            message,
          });
          await ctx.runMutation(internal.textBlasts.reserveQueuedReplyActionClaims, {
            blastId: args.blastId,
            phoneHashes: [member.phoneHash],
          });
          const stillEligible = await ctx.runQuery(internal.contactBlasts.recheckDelivery, {
            contactId: contact._id,
            phoneHash: member.phoneHash,
            messageEventId: batch.blast.eventId,
            includeQrCodes: batch.blast.includeQrCodes,
            redemptionCode: prepared.redemptionCode,
          });
          if (!stillEligible) throw new Error("Contact is no longer eligible for this message");
          const result = await ctx.runAction(internal.smsActions.sendBulkSmsInternal, {
            eventId: batch.blast.eventId,
            workspaceId: batch.blast.workspaceId,
            message,
            recipients: [
              {
                ...resultBase,
                phoneNumber: contact.phoneNumber as string,
                personalizedMessage: message,
                mediaUrl,
              },
            ],
            messageType: "Promotional",
          });
          deliveryResults = result.results;
        } catch (error) {
          const details = getSmsErrorDetails(error);
          deliveryResults = [
            {
              ...resultBase,
              success: false,
              error: details.errorMessage,
              errorCode: details.errorCode,
            },
          ];
        }
        await ctx.runMutation(internal.textBlasts.finalizeQueuedBlastResultBatch, {
          blastId: args.blastId,
          results: deliveryResults,
        });
        results.push(...deliveryResults);
      }
      await ctx.runMutation(internal.contactBlasts.advanceSend, {
        ...args,
        leaseToken,
        nextCursor: batch.nextCursor,
        sentCount: alreadySent + results.filter((result) => result.success).length,
        failedCount: uncertain + results.filter((result) => !result.success).length,
      });
    } catch (error) {
      console.error(
        "Contact blast batch failed",
        args.blastId,
        getSmsErrorDetails(error).errorMessage,
      );
      await ctx.runMutation(internal.contactBlasts.failSend, {
        blastId: args.blastId,
        sendAttempt: args.sendAttempt,
        leaseToken,
      });
    }
  },
});
