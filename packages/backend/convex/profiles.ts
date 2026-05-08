import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { query } from "./functions";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";

export const getForClerk = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    if (!user?.phone) return { hasEmail: false, hasPhone: false } as const;
    return {
      hasEmail: false,
      hasPhone: true,
      emailObfuscated: undefined,
      phoneObfuscated: obfuscatePhoneNumber(user.phone),
    } as const;
  },
});

/**
 * Deprecated profile lookup retained for plaintext phone backfill cleanup.
 */
export const getByClerkUserIdInternal = internalQuery({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("clerkUserId", clerkUserId))
      .unique();
    return profile;
  },
});
