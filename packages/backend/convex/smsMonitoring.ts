/**
 * SMS monitoring and cost tracking
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

const DEFAULT_LIMIT = 1000;

type SmsUsageLog = Doc<"smsUsageLogs">;

type SmsUsageLogSummary = {
  totalMessages: number;
  totalCost: number;
  averageCostPerMessage: number;
  messagesByType: Record<string, number>;
  costByType: Record<string, number>;
};

function buildLogSummary(logs: SmsUsageLog[]): SmsUsageLogSummary {
  const messagesByType: Record<string, number> = {};
  const costByType: Record<string, number> = {};

  let totalCost = 0;

  for (const log of logs) {
    totalCost += log.estimatedCost;
    messagesByType[log.messageType] = (messagesByType[log.messageType] ?? 0) + 1;
    costByType[log.messageType] = (costByType[log.messageType] ?? 0) + log.estimatedCost;
  }

  const totalMessages = logs.length;
  const averageCostPerMessage = totalMessages === 0 ? 0 : totalCost / totalMessages;

  return {
    totalMessages,
    totalCost,
    averageCostPerMessage,
    messagesByType,
    costByType,
  };
}

/**
 * Log SMS usage for cost tracking with Twilio (accepts pre-hashed phone)
 */
export const logSmsUsage = internalMutation({
  args: {
    messageId: v.string(),
    hashedPhoneNumber: v.string(),
    messageLength: v.number(),
    messageType: v.string(),
    estimatedCost: v.number(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("smsUsageLogs", {
      messageId: args.messageId,
      phoneNumber: args.hashedPhoneNumber,
      messageLength: args.messageLength,
      messageType: args.messageType,
      estimatedCost: args.estimatedCost,
      timestamp: args.timestamp,
    });
  },
});

/**
 * Get SMS usage logs for analytics
 */
export const getSmsUsageLogs = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? DEFAULT_LIMIT;

    const logs = await ctx.db
      .query("smsUsageLogs")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", args.startDate).lte("timestamp", args.endDate)
      )
      .take(limit);

    return logs satisfies SmsUsageLog[];
  },
});

/**
 * Get SMS cost summary
 */
export const getSmsCostSummary = internalQuery({
  args: {
    startDate: v.number(),
    endDate: v.number(),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("smsUsageLogs")
      .withIndex("by_timestamp", (q) =>
        q.gte("timestamp", args.startDate).lte("timestamp", args.endDate)
      )
      .collect();

    return buildLogSummary(logs satisfies SmsUsageLog[]);
  },
});

/**
 * Handle SMS opt-outs (internal mutation that accepts hashed phone)
 */
export const recordOptOutMutation = internalMutation({
  args: {
    hashedPhone: v.string(),
    clerkUserId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("smsOptOuts", {
      phoneNumber: args.hashedPhone,
      clerkUserId: args.clerkUserId,
      optedOutAt: Date.now(),
      reason: args.reason || "user_request",
    });
  },
});

/**
 * Check if a phone number has opted out
 */
export const checkOptOut = internalQuery({
  args: {
    phoneNumber: v.string(), // Should be hashed
  },
  handler: async (ctx, args) => {
    const optOut = await ctx.db
      .query("smsOptOuts")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.phoneNumber))
      .first();

    return optOut !== null;
  },
});

/**
 * Remove a phone number from opt-out list (internal mutation that accepts hashed phone)
 */
export const removeOptOutMutation = internalMutation({
  args: {
    hashedPhone: v.string(),
  },
  handler: async (ctx, args) => {
    const optOut = await ctx.db
      .query("smsOptOuts")
      .withIndex("by_phone", (q) => q.eq("phoneNumber", args.hashedPhone))
      .first();

    if (optOut) {
      await ctx.db.delete(optOut._id);
    }
  },
});

/**
 * Update delivery status for SMS usage logs
 */
export const updateDeliveryStatus = internalMutation({
  args: {
    messageId: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db
      .query("smsUsageLogs")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (log) {
      await ctx.db.patch(log._id, {
        status: args.status,
      });
    }
  },
});