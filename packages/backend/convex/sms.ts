/**
 * SMS mutations and queries (non-Node.js runtime)
 * Actions that require Node.js are in smsActions.ts
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { ensureEventInSiteScope, eventMatchesSiteScope } from "./lib/siteScope";
import { updateSmsConversationProviderStatus } from "./lib/smsConversationRecords";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

/**
 * Internal mutation to create SMS notification record
 */
export const createNotification = internalMutation({
  args: {
    eventId: v.id("events"),
    recipientClerkUserId: v.string(),
    recipientPhoneObfuscated: v.string(),
    recipientPhoneHash: v.optional(v.string()),
    type: v.string(),
    message: v.string(),
    textBlastId: v.optional(v.id("textBlasts")),
    textBlastRecipientId: v.optional(v.id("textBlastRecipients")),
  },
  async handler(ctx, args) {
    const notification = await ctx.db.insert("smsNotifications", {
      ...args,
      status: "pending",
      createdAt: Date.now(),
      messageId: undefined,
      errorMessage: undefined,
      errorCode: undefined,
      errorDetails: undefined,
      errorStack: undefined,
      sentAt: undefined,
    });
    return notification;
  },
});

/**
 * Internal mutation to update notification status
 */
export const updateNotificationStatus = internalMutation({
  args: {
    notificationId: v.id("smsNotifications"),
    status: v.string(),
    messageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorDetails: v.optional(v.string()),
    errorStack: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) {
      throw new Error(`Notification ${String(args.notificationId)} not found`);
    }

    const updateData: Partial<Doc<"smsNotifications">> = {
      status: args.status,
      messageId: args.messageId ?? notification.messageId,
      errorMessage:
        args.errorMessage ?? (args.status === "sent" ? undefined : notification.errorMessage),
      errorCode: args.errorCode ?? (args.status === "sent" ? undefined : notification.errorCode),
      errorDetails:
        args.errorDetails ?? (args.status === "sent" ? undefined : notification.errorDetails),
      errorStack: args.errorStack ?? (args.status === "sent" ? undefined : notification.errorStack),
      sentAt: args.sentAt ?? notification.sentAt,
    };

    await ctx.db.patch(args.notificationId, updateData);

    const providerMessageId = args.messageId ?? notification.messageId;
    if (providerMessageId) {
      await updateSmsConversationProviderStatus(ctx, {
        providerMessageId,
        providerStatus: args.status,
        smsNotificationId: args.notificationId,
        errorMessage: args.errorMessage,
        errorCode: args.errorCode,
        errorDetails: args.errorDetails,
        errorStack: args.errorStack,
      });
    }

    if (notification.textBlastRecipientId) {
      await ctx.db.patch(notification.textBlastRecipientId, {
        status: args.status,
        messageId: args.messageId ?? notification.messageId,
        errorMessage:
          args.errorMessage ?? (args.status === "sent" ? undefined : notification.errorMessage),
        errorCode: args.errorCode ?? (args.status === "sent" ? undefined : notification.errorCode),
        errorDetails:
          args.errorDetails ?? (args.status === "sent" ? undefined : notification.errorDetails),
        errorStack:
          args.errorStack ?? (args.status === "sent" ? undefined : notification.errorStack),
        sentAt: args.sentAt ?? notification.sentAt,
        updatedAt: Date.now(),
      });
    }
  },
});

/**
 * Query to get SMS notifications for an event
 * Used for analytics and debugging
 */
export const getNotificationsByEvent = internalQuery({
  args: {
    eventId: v.id("events"),
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const baseQuery = ctx.db
      .query("smsNotifications")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId));

    const filtered = args.type
      ? baseQuery.filter((q) => q.eq(q.field("type"), args.type))
      : baseQuery;

    return filtered.order("desc").take(args.limit ?? 50);
  },
});

/**
 * Query to get SMS statistics for an event
 */
export const getSmsStatsByEvent = internalQuery({
  args: {
    eventId: v.id("events"),
  },
  async handler(ctx, args) {
    const notifications = await ctx.db
      .query("smsNotifications")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();

    const stats = {
      total: notifications.length,
      sent: notifications.filter((n) => n.status === "sent").length,
      failed: notifications.filter((n) => n.status === "failed").length,
      pending: notifications.filter((n) => n.status === "pending").length,
      byType: {} as Record<string, number>,
    };

    // Count by message type
    notifications.forEach((notification) => {
      stats.byType[notification.type] = (stats.byType[notification.type] || 0) + 1;
    });

    return stats;
  },
});

/**
 * Update notification status by message ID (for webhook handlers)
 */
export const updateNotificationByMessageId = internalMutation({
  args: {
    messageId: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorDetails: v.optional(v.string()),
    errorStack: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const notification = await ctx.db
      .query("smsNotifications")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (!notification) {
      return;
    }

    const updateData: Partial<Doc<"smsNotifications">> = {
      status: args.status,
      errorMessage:
        args.errorMessage ?? (args.status === "sent" ? undefined : notification.errorMessage),
      errorCode: args.errorCode ?? (args.status === "sent" ? undefined : notification.errorCode),
      errorDetails:
        args.errorDetails ?? (args.status === "sent" ? undefined : notification.errorDetails),
      errorStack: args.errorStack ?? (args.status === "sent" ? undefined : notification.errorStack),
    };

    await ctx.db.patch(notification._id, updateData);
    if (notification.textBlastRecipientId) {
      const textBlastRecipient = await ctx.db.get(notification.textBlastRecipientId);
      if (textBlastRecipient) {
        const recipientStatus =
          args.status === "pending" && textBlastRecipient.status === "sent" ? "sent" : args.status;
        await ctx.db.patch(textBlastRecipient._id, {
          status: recipientStatus,
          messageId: args.messageId,
          errorMessage:
            args.errorMessage ??
            (args.status === "sent" ? undefined : textBlastRecipient.errorMessage),
          errorCode:
            args.errorCode ?? (args.status === "sent" ? undefined : textBlastRecipient.errorCode),
          errorDetails:
            args.errorDetails ??
            (args.status === "sent" ? undefined : textBlastRecipient.errorDetails),
          errorStack:
            args.errorStack ?? (args.status === "sent" ? undefined : textBlastRecipient.errorStack),
          updatedAt: Date.now(),
        });
      }
    }
    if (notification.textBlastId) {
      const blast = await ctx.db.get(notification.textBlastId);
      if (blast) {
        const deliveries = await ctx.db
          .query("textBlastRecipients")
          .withIndex("by_text_blast", (queryBuilder) =>
            queryBuilder.eq("textBlastId", notification.textBlastId as Id<"textBlasts">),
          )
          .collect();
        const sentCount = deliveries.filter((delivery) => delivery.status === "sent").length;
        const failedCount = deliveries.filter((delivery) => delivery.status === "failed").length;
        const pendingCount = deliveries.length - sentCount - failedCount;
        await ctx.db.patch(blast._id, {
          sentCount,
          failedCount,
          status: pendingCount > 0 ? blast.status : sentCount > 0 ? "sent" : "failed",
          updatedAt: Date.now(),
        });
      }
    }
    await updateSmsConversationProviderStatus(ctx, {
      providerMessageId: args.messageId,
      providerStatus: args.status,
      smsNotificationId: notification._id,
      errorMessage: args.errorMessage,
      errorCode: args.errorCode,
      errorDetails: args.errorDetails,
      errorStack: args.errorStack,
    });
  },
});

type PaginatedSmsNotificationResult = {
  page: Array<Doc<"smsNotifications"> & { recipientName?: string; eventName?: string }>;
  nextCursor: string | null;
  isDone: boolean;
};

/**
 * Query to get paginated SMS notifications for an event
 */
export const listForEventPaginated = query({
  args: {
    eventId: v.optional(v.id("events")),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
    statusFilter: v.optional(v.string()),
    typeFilter: v.optional(v.string()),
    phoneSearch: v.optional(v.string()),
  },
  async handler(
    ctx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      cursor,
      pageSize = 20,
      statusFilter = "all",
      typeFilter = "all",
      phoneSearch = "",
    },
  ): Promise<PaginatedSmsNotificationResult> {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    if (eventId) {
      await ensureEventInSiteScope(ctx, eventId, { siteKey, workspaceSlug });
    }

    const scopedEventIds =
      siteKey || workspaceSlug
        ? new Set(
            (await ctx.db.query("events").collect())
              .filter((event) => eventMatchesSiteScope(event, { siteKey, workspaceSlug }))
              .map((event) => event._id),
          )
        : null;

    if (!eventId && scopedEventIds && scopedEventIds.size === 0) {
      return {
        page: [],
        nextCursor: null,
        isDone: true,
      };
    }

    const loadNotifications = async (): Promise<Doc<"smsNotifications">[]> => {
      if (eventId) {
        return await ctx.db
          .query("smsNotifications")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect();
      }

      const allNotifications = await ctx.db.query("smsNotifications").collect();
      if (!scopedEventIds) {
        return allNotifications;
      }

      return allNotifications.filter((notification) => scopedEventIds.has(notification.eventId));
    };

    let filteredNotifications = await loadNotifications();

    if (statusFilter !== "all") {
      filteredNotifications = filteredNotifications.filter(
        (notification) => notification.status === statusFilter,
      );
    }

    if (typeFilter !== "all") {
      filteredNotifications = filteredNotifications.filter(
        (notification) => notification.type === typeFilter,
      );
    }

    if (phoneSearch.trim()) {
      const trimmedPhoneSearch = phoneSearch.trim();
      filteredNotifications = filteredNotifications.filter(
        (notification) => notification.recipientPhoneObfuscated === trimmedPhoneSearch,
      );
    }

    filteredNotifications.sort(
      (firstNotification, secondNotification) =>
        secondNotification.createdAt - firstNotification.createdAt,
    );

    const cursorIndex = cursor ? parseInt(cursor, 10) : 0;
    const paginatedPage = filteredNotifications.slice(cursorIndex, cursorIndex + pageSize);
    const nextCursor =
      cursorIndex + pageSize < filteredNotifications.length ? String(cursorIndex + pageSize) : null;
    const isDone = cursorIndex + pageSize >= filteredNotifications.length;

    // Batch fetch related data
    const eventIds = new Set<string>();
    const userIds = new Set<string>();

    paginatedPage.forEach((notification) => {
      eventIds.add(notification.eventId);
      userIds.add(notification.recipientClerkUserId);
    });

    // Fetch events
    const eventsMap = new Map();
    for (const eventIdValue of eventIds) {
      const event = await ctx.db.get(eventIdValue as Id<"events">);
      if (event) {
        eventsMap.set(eventIdValue, event);
      }
    }

    // Fetch users
    const usersMap = new Map();
    for (const userId of userIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
        .unique();
      if (user) {
        usersMap.set(userId, user);
      }
    }

    // Enrich notifications with related data
    const enrichedPage = paginatedPage.map((notification) => {
      const event = eventsMap.get(notification.eventId);
      const user = usersMap.get(notification.recipientClerkUserId);

      let recipientName = "Unknown";
      if (user) {
        const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        recipientName = displayName || user.name || "Unknown";
      }

      return {
        ...notification,
        recipientName,
        eventName: event?.name || "Unknown Event",
      };
    });

    return {
      page: enrichedPage,
      nextCursor,
      isDone,
    };
  },
});

/**
 * Count SMS notifications for an event with filters
 */
export const countForEventFiltered = query({
  args: {
    eventId: v.optional(v.id("events")),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    statusFilter: v.optional(v.string()),
    typeFilter: v.optional(v.string()),
    phoneSearch: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    if (args.eventId) {
      await ensureEventInSiteScope(ctx, args.eventId, {
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      });
    }

    const scopedEventIds =
      args.siteKey || args.workspaceSlug
        ? new Set(
            (await ctx.db.query("events").collect())
              .filter((event) =>
                eventMatchesSiteScope(event, {
                  siteKey: args.siteKey,
                  workspaceSlug: args.workspaceSlug,
                }),
              )
              .map((event) => event._id),
          )
        : null;

    const scopedEventId = args.eventId;

    let notifications = scopedEventId
      ? await ctx.db
          .query("smsNotifications")
          .withIndex("by_event", (q) => q.eq("eventId", scopedEventId))
          .collect()
      : await ctx.db.query("smsNotifications").collect();

    if (!scopedEventId && scopedEventIds) {
      notifications = notifications.filter((notification) =>
        scopedEventIds.has(notification.eventId),
      );
    }

    if (args.statusFilter && args.statusFilter !== "all") {
      notifications = notifications.filter(
        (notification) => notification.status === args.statusFilter,
      );
    }

    if (args.typeFilter && args.typeFilter !== "all") {
      notifications = notifications.filter((notification) => notification.type === args.typeFilter);
    }

    if (args.phoneSearch && args.phoneSearch.trim()) {
      const trimmedPhoneSearch = args.phoneSearch.trim();
      notifications = notifications.filter(
        (notification) => notification.recipientPhoneObfuscated === trimmedPhoneSearch,
      );
    }

    return notifications.length;
  },
});
