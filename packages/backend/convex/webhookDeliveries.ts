import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./functions";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

const MAX_DELIVERY_ATTEMPTS = 6;
const CONSECUTIVE_FAILURES_BEFORE_AUTO_DISABLE = 10;
const MAX_STORED_ERROR_MESSAGE_LENGTH = 512;

// Delay before retry attempt N (first attempt is immediate).
const RETRY_BACKOFF_MS = [
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
] as const;

export const getDeliveryForDispatch = internalQuery({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) {
      return null;
    }
    const endpoint = await ctx.db.get(delivery.endpointId);
    if (!endpoint) {
      return null;
    }
    return { delivery, endpoint };
  },
});

export const markDeliverySkippedInactive = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") {
      return;
    }
    await ctx.db.patch(args.deliveryId, {
      status: "skipped_inactive",
      lastAttemptAt: Date.now(),
    });
  },
});

export const recordDeliveryAttempt = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    responseStatus: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "pending") {
      return;
    }
    const endpoint = await ctx.db.get(delivery.endpointId);

    const now = Date.now();
    const attemptCount = delivery.attemptCount + 1;
    const wasSuccessful =
      args.responseStatus !== undefined && args.responseStatus >= 200 && args.responseStatus < 300;

    if (wasSuccessful) {
      await ctx.db.patch(args.deliveryId, {
        status: "success",
        attemptCount,
        lastAttemptAt: now,
        nextAttemptAt: undefined,
        lastResponseStatus: args.responseStatus,
        lastErrorMessage: undefined,
      });
      if (endpoint && endpoint.consecutiveFailureCount !== 0) {
        await ctx.db.patch(endpoint._id, { consecutiveFailureCount: 0 });
      }
      return;
    }

    const truncatedErrorMessage = args.errorMessage?.slice(0, MAX_STORED_ERROR_MESSAGE_LENGTH);

    if (attemptCount < MAX_DELIVERY_ATTEMPTS) {
      const retryDelayMs = RETRY_BACKOFF_MS[attemptCount - 1] ?? RETRY_BACKOFF_MS.at(-1) ?? 0;
      await ctx.db.patch(args.deliveryId, {
        attemptCount,
        lastAttemptAt: now,
        nextAttemptAt: now + retryDelayMs,
        lastResponseStatus: args.responseStatus,
        lastErrorMessage: truncatedErrorMessage,
      });
      await ctx.scheduler.runAfter(retryDelayMs, internal.webhookDispatch.attemptDelivery, {
        deliveryId: args.deliveryId,
      });
      return;
    }

    await ctx.db.patch(args.deliveryId, {
      status: "exhausted",
      attemptCount,
      lastAttemptAt: now,
      nextAttemptAt: undefined,
      lastResponseStatus: args.responseStatus,
      lastErrorMessage: truncatedErrorMessage,
    });

    if (endpoint) {
      const consecutiveFailureCount = endpoint.consecutiveFailureCount + 1;
      if (
        consecutiveFailureCount >= CONSECUTIVE_FAILURES_BEFORE_AUTO_DISABLE &&
        endpoint.isActive
      ) {
        await ctx.db.patch(endpoint._id, {
          consecutiveFailureCount,
          isActive: false,
          disabledReason: "auto_failure",
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(endpoint._id, { consecutiveFailureCount });
      }
    }
  },
});

export const listRecentForEndpoint = query({
  args: {
    workspaceSlug: v.string(),
    endpointId: v.id("webhookEndpoints"),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });
    const endpoint = await ctx.db.get(args.endpointId);
    if (!endpoint || endpoint.workspaceId !== resolvedScope.workspaceId) {
      throw new Error("Webhook endpoint not found");
    }

    const paginationResult = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_endpoint", (queryBuilder) => queryBuilder.eq("endpointId", args.endpointId))
      .order("desc")
      .paginate({
        numItems: Math.min(args.limit ?? 25, 100),
        cursor: args.cursor ?? null,
      });

    return {
      deliveries: paginationResult.page.map((delivery) => ({
        deliveryId: delivery._id,
        eventType: delivery.eventType,
        status: delivery.status,
        attemptCount: delivery.attemptCount,
        nextAttemptAt: delivery.nextAttemptAt ?? null,
        lastAttemptAt: delivery.lastAttemptAt ?? null,
        lastResponseStatus: delivery.lastResponseStatus ?? null,
        lastErrorMessage: delivery.lastErrorMessage ?? null,
        occurredAt: delivery.occurredAt,
      })),
      nextCursor: paginationResult.isDone ? null : paginationResult.continueCursor,
    };
  },
});

export const retryDelivery = mutation({
  args: {
    workspaceSlug: v.string(),
    deliveryId: v.id("webhookDeliveries"),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.workspaceId !== resolvedScope.workspaceId) {
      throw new Error("Delivery not found");
    }
    if (delivery.status === "pending") {
      return { ok: true, alreadyPending: true };
    }

    await ctx.db.patch(args.deliveryId, {
      status: "pending",
      attemptCount: 0,
      nextAttemptAt: Date.now(),
      lastErrorMessage: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.webhookDispatch.attemptDelivery, {
      deliveryId: args.deliveryId,
    });
    return { ok: true, alreadyPending: false };
  },
});
