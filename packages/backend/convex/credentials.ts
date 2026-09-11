import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { resolveCanonicalClerkUserId } from "./lib/canonicalUserIdentity";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";
import { issueListAccess, type ListAccessResult, readListAccess } from "./lib/listAccess";
import { effectiveCodeList, listDisplayName, listPassword } from "./lib/listIdentity";
import { hashOpaqueValue } from "./lib/phoneHash";
import { ensureEventInSiteScope } from "./lib/siteScope";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

function toPublicCredential(credential: {
  _id: string;
  eventId: string;
  listKey: string;
  displayName?: string;
  archivedAt?: number;
  passwordNormalized?: string;
  password?: string;
  generateQR?: boolean;
  defersQrDelivery?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApproveDelayMinutes?: number;
  autoApprovedCount?: number;
  createdAt: number;
}) {
  return {
    _id: credential._id,
    eventId: credential.eventId,
    listKey: credential.listKey,
    displayName: listDisplayName(credential),
    archivedAt: credential.archivedAt,
    hasPassword: Boolean(listPassword(credential)),
    generateQR: credential.generateQR,
    defersQrDelivery: credential.defersQrDelivery,
    sendQrOnApproval: credential.sendQrOnApproval,
    includeTicketLinkOnApproval: credential.includeTicketLinkOnApproval,
    approvalMessage: credential.approvalMessage,
    createdAt: credential.createdAt,
  };
}

function toHostCredential(credential: {
  _id: string;
  eventId: string;
  listKey: string;
  displayName?: string;
  archivedAt?: number;
  password?: string;
  generateQR?: boolean;
  defersQrDelivery?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApproveDelayMinutes?: number;
  autoApprovedCount?: number;
  createdAt: number;
}) {
  return {
    ...toPublicCredential(credential),
    password: credential.password,
    autoApproveLimit: credential.autoApproveLimit,
    autoApproveDelayMinutes: credential.autoApproveDelayMinutes,
    autoApprovedCount: credential.autoApprovedCount,
  };
}

export const getCredsForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return credentials.map(toPublicCredential);
  },
});

export const getHostCredsForEvent = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }) => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });
    const event = await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return credentials.map((credential) => ({
      ...toHostCredential(credential),
      listsRevision: event.listsRevision ?? 0,
    }));
  },
});

const resolveArgs = {
  eventId: v.id("events"),
  password: v.string(),
  siteKey: v.optional(v.string()),
  workspaceSlug: v.optional(v.string()),
};
async function resolveCurrentList(
  ctx: Pick<import("./_generated/server").QueryCtx, "db">,
  eventId: import("./_generated/dataModel").Id<"events">,
  password: string,
) {
  const credentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (builder) => builder.eq("eventId", eventId))
    .collect();
  const normalized = normalizeCredentialPassword(password);
  for (const credential of credentials) {
    if (
      credential.archivedAt !== undefined ||
      !normalized ||
      normalizeCredentialPassword(credential.passwordNormalized ?? credential.password ?? "") !==
        normalized
    )
      continue;
    const owner = await effectiveCodeList(ctx, credential, normalized);
    if (owner?._id === credential._id) return { list: credential, matched: "password" as const };
  }
  const list = credentials.find(
    (credential) =>
      credential.archivedAt === undefined &&
      !(credential.passwordNormalized ?? credential.password ?? "").trim(),
  );
  return list ? { list, matched: "no-password" as const } : null;
}
export const resolveListByPassword = query({
  args: resolveArgs,
  handler: async (ctx, args) => {
    const event = await ensureEventInSiteScope(ctx, args.eventId, args);
    if (!isEventOpenForRsvp(event)) return { ok: false as const };
    const result = await resolveCurrentList(ctx, args.eventId, args.password);
    return result
      ? {
          ok: true as const,
          listKey: result.list.listKey,
          displayName: listDisplayName(result.list),
          matched: result.matched,
        }
      : { ok: false as const };
  },
});
export const authorizeListAccess = mutation({
  args: { ...resolveArgs, accessToken: v.optional(v.string()) },
  handler: async (ctx, args): Promise<ListAccessResult> => {
    const event = await ensureEventInSiteScope(ctx, args.eventId, args);
    if (!isEventOpenForRsvp(event)) return { ok: false };
    if (args.accessToken) {
      const access = await readListAccess(
        ctx,
        args.eventId,
        await hashOpaqueValue(args.accessToken),
      );
      const identity = await ctx.auth.getUserIdentity();
      const clerkUserId = identity
        ? await resolveCanonicalClerkUserId(ctx, identity.subject)
        : undefined;
      if (
        access &&
        (!access.grant.claimedClerkUserId || access.grant.claimedClerkUserId === clerkUserId)
      ) {
        if (clerkUserId) await ctx.db.patch(access.grant._id, { claimedClerkUserId: clerkUserId });
        return {
          ok: true,
          listKey: access.list.listKey,
          displayName: listDisplayName(access.list),
          matched: "password",
          accessToken: args.accessToken,
          expiresAt: access.grant.expiresAt,
        };
      }
    }
    const result = await resolveCurrentList(ctx, args.eventId, args.password);
    return result ? issueListAccess(ctx, result.list, result.matched) : { ok: false };
  },
});

export const getByPassword = query({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const passwordNormalized = normalizeCredentialPassword(password);
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_passwordNormalized", (q) => q.eq("passwordNormalized", passwordNormalized))
      .collect();
    const activeCredentials = [];
    for (const credential of credentials) {
      if (
        credential.archivedAt === undefined &&
        (await effectiveCodeList(ctx, credential, passwordNormalized))?._id === credential._id
      )
        activeCredentials.push(credential);
    }
    return activeCredentials.map((credential) => ({
      _id: credential._id,
      eventId: credential.eventId,
      listKey: credential.listKey,
    }));
  },
});
