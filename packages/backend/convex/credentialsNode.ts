"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

export const resolveListByPassword = action({
  args: {
    eventId: v.id("events"),
    password: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { eventId, password, siteKey, workspaceSlug },
  ): Promise<{ ok: true; listKey: string } | { ok: false }> => {
    return await ctx.runQuery(api.credentials.resolveListByPassword, {
      eventId,
      password,
      siteKey,
      workspaceSlug,
    });
  },
});

export const resolveEventByPassword = action({
  args: {
    password: v.string(),
    siteKey: v.optional(v.string()),
  },
  handler: async (ctx, { password, siteKey }): Promise<{ ok: true; eventId: string; listKey: string } | { ok: false }> => {
    const credentials = await ctx.runQuery(api.credentials.getByPassword, {
      password,
    });
    if (credentials.length === 0) return { ok: false as const };

    const now = Date.now();

    // First, try to find featured event with valid password
    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
        siteKey,
      });
      if (event && event.isFeatured) {
        return {
          ok: true as const,
          eventId: credential.eventId,
          listKey: credential.listKey,
        };
      }
    }

    // If no featured event, try upcoming events
    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
        siteKey,
      });
      if (event && event.eventDate > now) {
        return {
          ok: true as const,
          eventId: credential.eventId,
          listKey: credential.listKey,
        };
      }
    }
    const firstCredential = credentials[0];
    const fallbackEvent = await ctx.runQuery(api.events.get, {
      eventId: firstCredential.eventId,
      siteKey,
    });

    if (fallbackEvent) {
      return {
        ok: true as const,
        eventId: firstCredential.eventId,
        listKey: firstCredential.listKey,
      };
    }
    return { ok: false as const };
  },
});

/**
 * Return host-visible passwords for all credentials of an event.
 */
export const getPasswordsForEvent = action({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, siteKey, workspaceSlug }): Promise<
    { listKey: string; password: string | null; credentialId: string }[]
  > => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const credentials = await ctx.runQuery(api.credentials.getHostCredsForEvent, {
      eventId,
      siteKey,
      workspaceSlug,
    });

    return credentials.map((credential) => ({
      listKey: credential.listKey,
      password: credential.password ?? null,
      credentialId: credential._id,
    }));
  },
});
