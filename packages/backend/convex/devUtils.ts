import { mutation } from "./functions";
import { v } from "convex/values";

/**
 * DEV UTILITY: Clear userName fields from all RSVPs
 *
 * This mutation removes all userName values from the RSVPs table to test
 * that the system properly falls back to users table data for enrichment
 * and search functionality.
 *
 * WARNING: Only use in development environment!
 */
export const clearUserNameFieldsFromRsvps = mutation({
  args: {
    confirmEnvironment: v.string(), // Must pass "development" to confirm
  },
  handler: async (ctx, args) => {
    // Require authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Safety check: Only allow in development
    if (args.confirmEnvironment !== "development") {
      throw new Error("This operation is only allowed in development environment");
    }

    // Additional safety: Check if this is a production deployment
    // Note: In actual production, you might want to check environment variables
    // or deployment context, but for now we rely on the confirmation string

    // Get all RSVPs that have userName
    const allRsvps = await ctx.db
      .query("rsvps")
      .filter((q) => q.neq(q.field("userName"), undefined))
      .collect();

    let clearedCount = 0;

    // Clear userName field from each RSVP
    for (const rsvp of allRsvps) {
      if (rsvp.userName) {
        await ctx.db.patch(rsvp._id, {
          userName: undefined,
          updatedAt: Date.now(),
        });
        clearedCount++;
      }
    }

    return {
      message: `Cleared userName field from ${clearedCount} RSVPs`,
      clearedCount,
      totalRsvps: allRsvps.length,
      timestamp: Date.now(),
    };
  },
});

/**
 * DEV UTILITY: Get summary of userName field population
 *
 * Returns statistics about how many RSVPs have userName populated
 * vs empty to help understand the current state.
 */
export const getRsvpUserNameStats = mutation({
  args: {},
  handler: async (ctx) => {
    // Require authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const allRsvps = await ctx.db.query("rsvps").collect();

    let withUserName = 0;
    let withoutUserName = 0;
    let withEmptyUserName = 0;

    for (const rsvp of allRsvps) {
      if (rsvp.userName) {
        if (rsvp.userName.trim() === "") {
          withEmptyUserName++;
        } else {
          withUserName++;
        }
      } else {
        withoutUserName++;
      }
    }

    return {
      total: allRsvps.length,
      withUserName,
      withoutUserName,
      withEmptyUserName,
      percentagePopulated: allRsvps.length > 0 ?
        Math.round((withUserName / allRsvps.length) * 100) : 0,
    };
  },
});