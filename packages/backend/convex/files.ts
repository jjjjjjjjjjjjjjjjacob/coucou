import { mutation, query } from "./functions";
import { v } from "convex/values";

export const generateUploadUrl = mutation({
  args: { contentType: v.optional(v.string()) },
  handler: async (ctx) => {
    const url = await ctx.storage.generateUploadUrl();
    return { url };
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const url = await ctx.storage.getUrl(storageId);
    return { url };
  },
});

