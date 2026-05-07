import { query } from "./_generated/server";
import { v } from "convex/values";
import { ensureEventInSiteScope } from "./lib/siteScope";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";

function toPublicCredential(credential: {
  _id: string;
  eventId: string;
  listKey: string;
  generateQR?: boolean;
  approvalMessage?: string;
  createdAt: number;
}) {
  return {
    _id: credential._id,
    eventId: credential.eventId,
    listKey: credential.listKey,
    generateQR: credential.generateQR,
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
  approvalMessage?: string;
  createdAt: number;
}) {
  return {
    ...toPublicCredential(credential),
    password: credential.password,
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
    if (event.status !== "active") {
      return { ok: false as const };
    }

    const passwordNormalized = normalizeCredentialPassword(password);
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", eventId))
      .collect();
    const matchingCredential = credentials.find(
      (credential) => credential.passwordNormalized === passwordNormalized,
    );
    return matchingCredential
      ? { ok: true as const, listKey: matchingCredential.listKey }
      : { ok: false as const };
  },
});

export const getByPassword = query({
  args: { password: v.string() },
  handler: async (ctx, { password }) => {
    const passwordNormalized = normalizeCredentialPassword(password);
    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_passwordNormalized", (q) =>
        q.eq("passwordNormalized", passwordNormalized),
      )
      .collect();
    return credentials.map((credential) => ({
      _id: credential._id,
      eventId: credential.eventId,
      listKey: credential.listKey,
    }));
  },
});
