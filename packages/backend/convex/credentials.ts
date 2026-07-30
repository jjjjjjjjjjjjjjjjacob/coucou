import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";
import { ensureEventInSiteScope } from "./lib/siteScope";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

function toPublicCredential(credential: {
  _id: string;
  eventId: string;
  listKey: string;
  passwordNormalized?: string;
  generateQR?: boolean;
  defersQrDelivery?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApprovedCount?: number;
  createdAt: number;
}) {
  return {
    _id: credential._id,
    eventId: credential.eventId,
    listKey: credential.listKey,
    hasPassword: Boolean(credential.passwordNormalized?.trim()),
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
  password?: string;
  generateQR?: boolean;
  defersQrDelivery?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApprovedCount?: number;
  createdAt: number;
}) {
  return {
    ...toPublicCredential(credential),
    password: credential.password,
    autoApproveLimit: credential.autoApproveLimit,
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
    await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });

    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    return credentials.map(toHostCredential);
  },
});

export const resolveListByPassword = query({
  args: {
    eventId: v.id("events"),
    password: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, password, siteKey, workspaceSlug }) => {
    const event = await ensureEventInSiteScope(ctx, eventId, {
      siteKey,
      workspaceSlug,
    });
    if (!isEventOpenForRsvp(event, Date.now())) {
      return { ok: false as const };
    }

    const trimmedPassword = password.trim();
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();

    if (trimmedPassword.length > 0) {
      const passwordNormalized = normalizeCredentialPassword(trimmedPassword);
      const matchingCredential = credentials.find((credential) => {
        const storedNormalized =
          credential.passwordNormalized?.trim() ||
          (credential.password ? normalizeCredentialPassword(credential.password) : "");
        return storedNormalized.length > 0 && storedNormalized === passwordNormalized;
      });
      if (matchingCredential) {
        return {
          ok: true as const,
          listKey: matchingCredential.listKey,
          matched: "password" as const,
        };
      }
    }

    const noPasswordCredential = credentials.find((credential) => {
      const hasNormalized = (credential.passwordNormalized?.trim() ?? "").length > 0;
      const hasPassword = (credential.password?.trim() ?? "").length > 0;
      return !hasNormalized && !hasPassword;
    });
    return noPasswordCredential
      ? {
          ok: true as const,
          listKey: noPasswordCredential.listKey,
          matched: "no-password" as const,
        }
      : { ok: false as const };
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
    return credentials.map((credential) => ({
      _id: credential._id,
      eventId: credential.eventId,
      listKey: credential.listKey,
    }));
  },
});
