import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./functions";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";
import { requireCoucouPlatformMember } from "./lib/platformAuth";

function resolveBatchSize(batchSize: number | undefined): number {
  return Math.max(1, Math.min(batchSize ?? 50, 200));
}

export const listEventPasswordBackfillCandidates = query({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize }) => {
    await requireCoucouPlatformMember(ctx);

    const limit = resolveBatchSize(batchSize);
    const credentials = await ctx.db.query("listCredentials").collect();
    const candidates: Array<{
      credentialId: Id<"listCredentials">;
      encryptedPassword: {
        ivB64: string;
        ctB64: string;
        tagB64: string;
      };
    }> = [];
    let unrecoverableCount = 0;

    for (const credential of credentials) {
      if (credential.password && credential.passwordNormalized) {
        continue;
      }
      if (!credential.encryptedPassword) {
        unrecoverableCount++;
        continue;
      }
      if (candidates.length < limit) {
        candidates.push({
          credentialId: credential._id,
          encryptedPassword: credential.encryptedPassword,
        });
      }
    }

    return {
      candidates,
      unrecoverableCount,
    };
  },
});

export const applyEventPasswordBackfill = mutation({
  args: {
    updates: v.array(
      v.object({
        credentialId: v.id("listCredentials"),
        password: v.string(),
      }),
    ),
  },
  handler: async (ctx, { updates }) => {
    await requireCoucouPlatformMember(ctx);

    for (const update of updates) {
      await ctx.db.patch(update.credentialId, {
        password: update.password,
        passwordNormalized: normalizeCredentialPassword(update.password),
      });
    }

    return { updated: updates.length };
  },
});

export const listProfilePhoneBackfillCandidates = query({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize }) => {
    await requireCoucouPlatformMember(ctx);

    const limit = resolveBatchSize(batchSize);
    const profiles = await ctx.db.query("profiles").collect();
    const candidates: Array<{
      profileId: Id<"profiles">;
      clerkUserId: string;
      phoneEnc: {
        ivB64: string;
        ctB64: string;
        tagB64: string;
      };
    }> = [];

    for (const profile of profiles) {
      if (!profile.phoneEnc) {
        continue;
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (queryBuilder) =>
          queryBuilder.eq("clerkUserId", profile.clerkUserId),
        )
        .unique();
      if (user?.phone) {
        continue;
      }
      if (candidates.length < limit) {
        candidates.push({
          profileId: profile._id,
          clerkUserId: profile.clerkUserId,
          phoneEnc: profile.phoneEnc,
        });
      }
    }

    return { candidates };
  },
});

export const applyProfilePhoneBackfill = mutation({
  args: {
    updates: v.array(
      v.object({
        clerkUserId: v.string(),
        phone: v.string(),
      }),
    ),
  },
  handler: async (ctx, { updates }) => {
    await requireCoucouPlatformMember(ctx);

    const now = Date.now();
    for (const update of updates) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (queryBuilder) =>
          queryBuilder.eq("clerkUserId", update.clerkUserId),
        )
        .unique();

      if (!user) {
        await ctx.db.insert("users", {
          clerkUserId: update.clerkUserId,
          phone: update.phone,
          createdAt: now,
          updatedAt: now,
        });
        continue;
      }

      if (!user.phone) {
        await ctx.db.patch(user._id, {
          phone: update.phone,
          updatedAt: now,
        });
      }
    }

    return { updated: updates.length };
  },
});

export const cleanupDeprecatedCredentialSecretFields = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize }) => {
    await requireCoucouPlatformMember(ctx);

    const limit = resolveBatchSize(batchSize);
    const credentials = await ctx.db.query("listCredentials").collect();
    let cleaned = 0;

    for (const credential of credentials) {
      if (cleaned >= limit) break;
      if (
        credential.passwordHash === undefined &&
        credential.passwordSalt === undefined &&
        credential.passwordIterations === undefined &&
        credential.passwordFingerprint === undefined &&
        credential.encryptedPassword === undefined
      ) {
        continue;
      }

      await ctx.db.patch(credential._id, {
        passwordHash: undefined,
        passwordSalt: undefined,
        passwordIterations: undefined,
        passwordFingerprint: undefined,
        encryptedPassword: undefined,
      });
      cleaned++;
    }

    return { cleaned };
  },
});

export const cleanupDeprecatedProfilePhoneFields = mutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { batchSize }) => {
    await requireCoucouPlatformMember(ctx);

    const limit = resolveBatchSize(batchSize);
    const profiles = await ctx.db.query("profiles").collect();
    let cleaned = 0;

    for (const profile of profiles) {
      if (cleaned >= limit) break;
      if (profile.phoneEnc === undefined && profile.phoneObfuscated === undefined) {
        continue;
      }

      await ctx.db.patch(profile._id, {
        phoneEnc: undefined,
        phoneObfuscated: undefined,
        updatedAt: Date.now(),
      });
      cleaned++;
    }

    return { cleaned };
  },
});
