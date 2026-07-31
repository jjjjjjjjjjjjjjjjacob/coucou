import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { requireCoucouPlatformMember } from "./lib/platformAuth";
import { isSmsExecutableEvent, normalizeSmsCode } from "./lib/smsCodeRouting";

type AuditRoute = {
  kind: "event_list" | "blast_action";
  ownerId: string;
  eventId: Id<"events">;
  phoneHash?: string;
};

type AuditConflict = {
  normalizedCode: string;
  type: "event_event" | "event_action" | "action_recipient_overlap";
  ownerIds: string[];
  phoneHash?: string;
};

async function collectExecutableRoutes(
  ctx: QueryCtx | MutationCtx,
  now: number,
): Promise<Map<string, AuditRoute[]>> {
  const routesByCode = new Map<string, AuditRoute[]>();
  const addRoute = (normalizedCode: string, route: AuditRoute) => {
    const existingRoutes = routesByCode.get(normalizedCode) ?? [];
    existingRoutes.push(route);
    routesByCode.set(normalizedCode, existingRoutes);
  };

  const credentials = await ctx.db.query("listCredentials").collect();
  for (const credential of credentials) {
    const normalizedCode = normalizeSmsCode(
      credential.passwordNormalized ?? credential.password ?? "",
    );
    if (!normalizedCode) continue;
    const event = await ctx.db.get(credential.eventId);
    if (!event || !isSmsExecutableEvent(event, now)) continue;
    addRoute(normalizedCode, {
      kind: "event_list",
      ownerId: credential._id,
      eventId: event._id,
    });
  }

  const replyActions = await ctx.db.query("textBlastReplyActions").collect();
  for (const replyAction of replyActions) {
    if (!replyAction.isEnabled) continue;
    const targetEvent = await ctx.db.get(replyAction.targetEventId);
    if (!targetEvent || !isSmsExecutableEvent(targetEvent, now)) continue;
    const targetList = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (queryBuilder) =>
        queryBuilder.eq("eventId", targetEvent._id).eq("listKey", replyAction.targetListKey),
      )
      .unique();
    if (!targetList) continue;
    const deliveries = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_status", (queryBuilder) =>
        queryBuilder.eq("textBlastId", replyAction.textBlastId).eq("status", "sent"),
      )
      .collect();
    for (const delivery of deliveries) {
      addRoute(replyAction.replyCodeNormalized, {
        kind: "blast_action",
        ownerId: replyAction._id,
        eventId: targetEvent._id,
        phoneHash: delivery.phoneHash,
      });
    }
  }
  return routesByCode;
}

function findRouteConflicts(routesByCode: Map<string, AuditRoute[]>): AuditConflict[] {
  const conflicts: AuditConflict[] = [];
  for (const [normalizedCode, routes] of routesByCode) {
    const eventRoutes = routes.filter((route) => route.kind === "event_list");
    const actionRoutes = routes.filter((route) => route.kind === "blast_action");
    if (eventRoutes.length > 1) {
      conflicts.push({
        normalizedCode,
        type: "event_event",
        ownerIds: Array.from(new Set(eventRoutes.map((route) => route.ownerId))),
      });
    }
    if (eventRoutes.length > 0 && actionRoutes.length > 0) {
      conflicts.push({
        normalizedCode,
        type: "event_action",
        ownerIds: Array.from(new Set(routes.map((route) => route.ownerId))),
      });
    }
    const actionRoutesByPhone = new Map<string, AuditRoute[]>();
    for (const actionRoute of actionRoutes) {
      if (!actionRoute.phoneHash) continue;
      const matchingRoutes = actionRoutesByPhone.get(actionRoute.phoneHash) ?? [];
      matchingRoutes.push(actionRoute);
      actionRoutesByPhone.set(actionRoute.phoneHash, matchingRoutes);
    }
    for (const [phoneHash, matchingRoutes] of actionRoutesByPhone) {
      const ownerIds = Array.from(new Set(matchingRoutes.map((route) => route.ownerId)));
      if (ownerIds.length > 1) {
        conflicts.push({
          normalizedCode,
          type: "action_recipient_overlap",
          ownerIds,
          phoneHash,
        });
      }
    }
  }
  return conflicts;
}

export const auditExecutableCodeCollisions = query({
  args: {},
  handler: async (ctx) => {
    await requireCoucouPlatformMember(ctx);
    const routesByCode = await collectExecutableRoutes(ctx, Date.now());
    const conflicts = findRouteConflicts(routesByCode);
    return {
      executableCodeCount: routesByCode.size,
      unresolvedConflictCount: conflicts.length,
      conflicts,
    };
  },
});

export const backfillExecutableCodeClaims = mutation({
  args: {
    expectedUnresolvedConflictCount: v.literal(0),
  },
  handler: async (ctx, _args) => {
    await requireCoucouPlatformMember(ctx);
    const now = Date.now();
    const routesByCode = await collectExecutableRoutes(ctx, now);
    const conflicts = findRouteConflicts(routesByCode);
    if (conflicts.length > 0) {
      throw new Error(
        `SMS code claim backfill blocked by ${conflicts.length} unresolved conflict(s)`,
      );
    }

    let insertedClaimCount = 0;
    for (const [normalizedCode, routes] of routesByCode) {
      for (const route of routes) {
        const phoneHash = route.kind === "blast_action" ? route.phoneHash : undefined;
        const existingClaims = await ctx.db
          .query("smsCodeClaims")
          .withIndex("by_code_phone", (queryBuilder) =>
            queryBuilder.eq("normalizedCode", normalizedCode).eq("phoneHash", phoneHash),
          )
          .collect();
        if (
          existingClaims.some((claim) =>
            route.kind === "event_list"
              ? claim.listCredentialId === route.ownerId
              : claim.replyActionId === route.ownerId,
          )
        ) {
          continue;
        }

        const eventRouteOwner =
          route.kind === "event_list"
            ? await ctx.db.get(route.ownerId as Id<"listCredentials">)
            : null;
        const actionRouteOwner =
          route.kind === "blast_action"
            ? await ctx.db.get(route.ownerId as Id<"textBlastReplyActions">)
            : null;
        await ctx.db.insert("smsCodeClaims", {
          normalizedCode,
          kind: route.kind,
          eventId: route.eventId,
          listCredentialId: eventRouteOwner?._id,
          replyActionId: actionRouteOwner?._id,
          textBlastId: actionRouteOwner?.textBlastId,
          phoneHash,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        insertedClaimCount += 1;
      }
    }
    return {
      insertedClaimCount,
      executableCodeCount: routesByCode.size,
      unresolvedConflictCount: 0 as const,
    };
  },
});
