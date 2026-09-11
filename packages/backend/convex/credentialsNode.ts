"use node";
import { isEventOpenForRsvp } from "@coucou/sdk/shared/event-availability";
import { getEventRouteId } from "@coucou/sdk/shared/event-routes";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import type { ListAccessResult } from "./lib/listAccess";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

export const resolveListByPassword = action({
  args: {
    eventId: v.id("events"),
    password: v.string(),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    accessToken: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { eventId, password, siteKey, workspaceSlug, accessToken },
  ): Promise<ListAccessResult> => {
    return await ctx.runMutation(api.credentials.authorizeListAccess, {
      eventId,
      password,
      siteKey,
      workspaceSlug,
      accessToken,
    });
  },
});

export const resolveEventByPassword = action({
  args: {
    password: v.string(),
    siteKey: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { password, siteKey },
  ): Promise<
    | {
        ok: true;
        eventId: string;
        eventRouteId: string;
        listKey: string;
        accessToken: string;
        expiresAt: number;
      }
    | { ok: false }
  > => {
    const credentials = await ctx.runQuery(api.credentials.getByPassword, {
      password,
    });
    if (credentials.length === 0) return { ok: false as const };

    // First, try to find a featured active event with this password.
    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
        siteKey,
      });
      if (event && isEventOpenForRsvp(event) && event.isFeatured) {
        const access = await ctx.runMutation(api.credentials.authorizeListAccess, {
          eventId: credential.eventId,
          password,
          siteKey,
        });
        if (!access.ok) continue;
        return {
          ...access,
          ok: true as const,
          eventId: credential.eventId,
          eventRouteId: getEventRouteId(event),
          listKey: credential.listKey,
        };
      }
    }

    // Otherwise, use the first active event. Passwords are validated to be
    // unique across active events when hosts activate or edit credentials.
    for (const credential of credentials) {
      const event = await ctx.runQuery(api.events.get, {
        eventId: credential.eventId,
        siteKey,
      });
      if (event && isEventOpenForRsvp(event)) {
        const access = await ctx.runMutation(api.credentials.authorizeListAccess, {
          eventId: credential.eventId,
          password,
          siteKey,
        });
        if (!access.ok) continue;
        return {
          ...access,
          ok: true as const,
          eventId: credential.eventId,
          eventRouteId: getEventRouteId(event),
          listKey: credential.listKey,
        };
      }
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
  handler: async (
    ctx,
    { eventId, siteKey, workspaceSlug },
  ): Promise<
    {
      listKey: string;
      displayName: string;
      archivedAt?: number;
      password: string | null;
      credentialId: string;
    }[]
  > => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const credentials = await ctx.runQuery(api.credentials.getHostCredsForEvent, {
      eventId,
      siteKey,
      workspaceSlug,
    });

    return credentials
      .filter((credential) => credential.archivedAt === undefined)
      .map((credential) => ({
        listKey: credential.listKey,
        displayName: credential.displayName,
        archivedAt: credential.archivedAt,
        password: credential.password ?? null,
        credentialId: credential._id,
      }));
  },
});
