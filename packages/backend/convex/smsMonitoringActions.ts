/**
 * SMS monitoring actions that require Node.js runtime for crypto
 */

"use node";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Hash phone number using Node.js crypto
 */
export const hashPhoneNumber = internalAction({
  args: {
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(args.phoneNumber).digest("hex");
  },
});

/**
 * Record SMS opt-out with phone number hashing
 */
export const recordOptOutAction = internalAction({
  args: {
    phoneNumber: v.string(),
    clerkUserId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Hash phone number for privacy
    const hashedPhone = await ctx.runAction(internal.smsMonitoringActions.hashPhoneNumber, {
      phoneNumber: args.phoneNumber,
    });

    // Record the opt-out using the mutation
    await ctx.runMutation(internal.smsMonitoring.recordOptOutMutation, {
      hashedPhone,
      clerkUserId: args.clerkUserId,
      reason: args.reason,
    });
  },
});

/**
 * Remove opt-out with phone number hashing
 */
export const removeOptOutAction = internalAction({
  args: {
    phoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    // Hash phone number for privacy
    const hashedPhone = await ctx.runAction(internal.smsMonitoringActions.hashPhoneNumber, {
      phoneNumber: args.phoneNumber,
    });

    // Remove the opt-out using the mutation
    await ctx.runMutation(internal.smsMonitoring.removeOptOutMutation, {
      hashedPhone,
    });
  },
});

/**
 * Check if a phone number has opted out (accepts unhashed phone)
 */
export const checkOptOutAction = internalAction({
  args: {
    phoneNumber: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    // Hash phone number for privacy
    const hashedPhone: string = await ctx.runAction(internal.smsMonitoringActions.hashPhoneNumber, {
      phoneNumber: args.phoneNumber,
    });

    // Check if opted out
    return await ctx.runQuery(internal.smsMonitoring.checkOptOut, {
      phoneNumber: hashedPhone,
    });
  },
});

/**
 * Log SMS usage with phone number hashing
 */
export const logSmsUsageAction = internalAction({
  args: {
    messageId: v.string(),
    phoneNumber: v.string(),
    messageLength: v.number(),
    messageType: v.string(),
    estimatedCost: v.number(),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // Hash phone number for privacy
    const hashedPhone = await ctx.runAction(internal.smsMonitoringActions.hashPhoneNumber, {
      phoneNumber: args.phoneNumber,
    });

    // Log the usage using the mutation
    await ctx.runMutation(internal.smsMonitoring.logSmsUsage, {
      messageId: args.messageId,
      hashedPhoneNumber: hashedPhone,
      messageLength: args.messageLength,
      messageType: args.messageType,
      estimatedCost: args.estimatedCost,
      timestamp: args.timestamp,
    });
  },
});