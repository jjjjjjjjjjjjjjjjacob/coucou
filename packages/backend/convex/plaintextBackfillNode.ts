"use node";

import { v } from "convex/values";
import crypto from "crypto";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./functions";
import { requireCoucouPlatformMember } from "./lib/platformAuth";

type EncryptedValue = {
  ivB64: string;
  ctB64: string;
  tagB64: string;
};

type BackfillResult = {
  updated: number;
};

type EventPasswordBackfillCandidate = {
  credentialId: Id<"listCredentials">;
  encryptedPassword: EncryptedValue;
};

type EventPasswordBackfillCandidateResult = {
  candidates: EventPasswordBackfillCandidate[];
  unrecoverableCount: number;
};

type EventPasswordBackfillUpdate = {
  credentialId: Id<"listCredentials">;
  password: string;
};

type ProfilePhoneBackfillCandidate = {
  profileId: Id<"profiles">;
  clerkUserId: string;
  phoneEnc: EncryptedValue;
};

type ProfilePhoneBackfillCandidateResult = {
  candidates: ProfilePhoneBackfillCandidate[];
};

type ProfilePhoneBackfillUpdate = {
  clerkUserId: string;
  phone: string;
};

function decryptAes256Gcm(encryptedValue: EncryptedValue, key: Buffer): string {
  const iv = Buffer.from(encryptedValue.ivB64, "base64");
  const ciphertext = Buffer.from(encryptedValue.ctB64, "base64");
  const authTag = Buffer.from(encryptedValue.tagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

function decodeHexKey(hexKey: string, label: string): Buffer {
  const key = Buffer.from(hexKey.trim(), "hex");
  if (key.length !== 32) {
    throw new Error(`${label} must be a 64-character hex-encoded 32-byte key`);
  }
  return key;
}

function decodeBase64Key(base64Key: string, label: string): Buffer {
  const key = Buffer.from(base64Key.trim(), "base64");
  if (key.length !== 32) {
    throw new Error(`${label} must be a base64-encoded 32-byte key`);
  }
  return key;
}

export const backfillEventPasswordsFromEncrypted = action({
  args: {
    credentialEncryptionKey: v.string(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { credentialEncryptionKey, batchSize }): Promise<BackfillResult> => {
    await requireCoucouPlatformMember(ctx);

    const { candidates, unrecoverableCount } = (await ctx.runQuery(
      api.plaintextBackfill.listEventPasswordBackfillCandidates,
      { batchSize },
    )) as EventPasswordBackfillCandidateResult;
    if (unrecoverableCount > 0) {
      throw new Error(
        `${unrecoverableCount} list credentials are missing both plaintext and encrypted passwords`,
      );
    }

    const key = decodeHexKey(credentialEncryptionKey, "credentialEncryptionKey");
    const updates: EventPasswordBackfillUpdate[] = candidates.map((candidate) => ({
      credentialId: candidate.credentialId,
      password: decryptAes256Gcm(candidate.encryptedPassword, key),
    }));

    if (updates.length === 0) {
      return { updated: 0 };
    }

    return await ctx.runMutation(api.plaintextBackfill.applyEventPasswordBackfill, { updates });
  },
});

export const backfillProfilePhonesFromEncrypted = action({
  args: {
    phoneEncryptionKey: v.string(),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, { phoneEncryptionKey, batchSize }): Promise<BackfillResult> => {
    await requireCoucouPlatformMember(ctx);

    const { candidates } = (await ctx.runQuery(
      api.plaintextBackfill.listProfilePhoneBackfillCandidates,
      { batchSize },
    )) as ProfilePhoneBackfillCandidateResult;
    const key = decodeBase64Key(phoneEncryptionKey, "phoneEncryptionKey");
    const updates: ProfilePhoneBackfillUpdate[] = candidates.map((candidate) => ({
      clerkUserId: candidate.clerkUserId,
      phone: decryptAes256Gcm(candidate.phoneEnc, key),
    }));

    if (updates.length === 0) {
      return { updated: 0 };
    }

    return await ctx.runMutation(api.plaintextBackfill.applyProfilePhoneBackfill, { updates });
  },
});
