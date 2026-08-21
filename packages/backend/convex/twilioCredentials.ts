import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { writeAuditEntry } from "./audit";
import { internalQuery, mutation, query } from "./functions";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";
import { ensureEventInSiteScope } from "./lib/siteScope";
import {
  findTwilioCredentialForScope,
  resolveStoredTwilioCredentialForEvent,
} from "./lib/twilioCredentialResolution";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

const TWILIO_ACCOUNT_SID_PATTERN = /^AC[0-9a-f]{32}$/i;
const TWILIO_AUTH_TOKEN_PATTERN = /^[0-9a-f]{32}$/i;

export type StoredTwilioCredentialResolution = {
  accountSid: string;
  authToken: string;
  fromPhoneNumber: string;
  source: "event" | "workspace";
};

function validateAccountSid(accountSid: string): string {
  const trimmedAccountSid = accountSid.trim();
  if (!TWILIO_ACCOUNT_SID_PATTERN.test(trimmedAccountSid)) {
    throw new Error("Twilio Account SID must start with AC and contain 34 characters");
  }
  return trimmedAccountSid;
}

function validateAuthToken(authToken: string): string {
  const trimmedAuthToken = authToken.trim();
  if (!TWILIO_AUTH_TOKEN_PATTERN.test(trimmedAuthToken)) {
    throw new Error("Twilio Auth Token must contain 32 hexadecimal characters");
  }
  return trimmedAuthToken;
}

function buildCredentialSummary(
  credential: Pick<
    Doc<"twilioCredentials">,
    "eventId" | "accountSid" | "authToken" | "fromPhoneNumber" | "updatedAt"
  >,
) {
  return {
    eventId: credential.eventId ?? null,
    maskedAccountSid: `AC••••••••••••••••••••••••••••${credential.accountSid.slice(-4)}`,
    fromPhoneNumber: credential.fromPhoneNumber,
    hasAuthToken: credential.authToken.length > 0,
    updatedAt: credential.updatedAt,
  };
}

export const listForWorkspace = query({
  args: { workspaceSlug: v.string() },
  handler: async (ctx, { workspaceSlug }) => {
    const workspaceScope = await requireWorkspaceHost(ctx, { workspaceSlug });
    const credentials = await ctx.db
      .query("twilioCredentials")
      .withIndex("by_workspace", (queryBuilder) =>
        queryBuilder.eq("workspaceId", workspaceScope.workspaceId),
      )
      .collect();
    const workspaceCredential = credentials.find((credential) => credential.eventId === undefined);

    return {
      workspace: workspaceCredential ? buildCredentialSummary(workspaceCredential) : null,
      events: credentials
        .filter(
          (credential): credential is Doc<"twilioCredentials"> & { eventId: Id<"events"> } =>
            credential.eventId !== undefined,
        )
        .map(buildCredentialSummary),
    };
  },
});

export const upsert = mutation({
  args: {
    workspaceSlug: v.string(),
    eventId: v.optional(v.id("events")),
    accountSid: v.string(),
    authToken: v.string(),
    fromPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const workspaceScope = await requireWorkspaceHost(ctx, {
      workspaceSlug: args.workspaceSlug,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    if (args.eventId) {
      await ensureEventInSiteScope(ctx, args.eventId, {
        siteKey: workspaceScope.siteKey ?? undefined,
        workspaceSlug: workspaceScope.workspaceSlug,
      });
    }

    const accountSid = validateAccountSid(args.accountSid);
    const authToken = validateAuthToken(args.authToken);
    const fromPhoneNumber = formatPhoneNumberForSms(args.fromPhoneNumber);
    const now = Date.now();
    const existingCredential = await findTwilioCredentialForScope(
      ctx,
      workspaceScope.workspaceId,
      args.eventId,
    );
    const credentialsUsingPhoneNumber = await ctx.db
      .query("twilioCredentials")
      .withIndex("by_fromPhoneNumber", (queryBuilder) =>
        queryBuilder.eq("fromPhoneNumber", fromPhoneNumber),
      )
      .collect();
    if (
      credentialsUsingPhoneNumber.some(
        (credential) =>
          credential._id !== existingCredential?._id &&
          credential.workspaceId !== workspaceScope.workspaceId,
      )
    ) {
      throw new Error("This Twilio sender phone number is already assigned to another organizer");
    }

    let credentialId: Id<"twilioCredentials">;
    if (existingCredential) {
      await ctx.db.patch(existingCredential._id, {
        accountSid,
        authToken,
        fromPhoneNumber,
        updatedByClerkUserId: identity.subject,
        updatedAt: now,
      });
      credentialId = existingCredential._id;
    } else {
      credentialId = await ctx.db.insert("twilioCredentials", {
        workspaceId: workspaceScope.workspaceId,
        eventId: args.eventId,
        accountSid,
        authToken,
        fromPhoneNumber,
        updatedByClerkUserId: identity.subject,
        createdAt: now,
        updatedAt: now,
      });
    }

    await writeAuditEntry(ctx, {
      action: existingCredential ? "twilioCredential.update" : "twilioCredential.create",
      actorClerkUserId: identity.subject,
      targetKind: args.eventId ? "eventTwilioCredential" : "workspaceTwilioCredential",
      targetId: credentialId,
      workspaceId: workspaceScope.workspaceId,
      summary: `${args.eventId ? "Event override" : "Organizer default"} · ${obfuscatePhoneNumber(fromPhoneNumber)}`,
      metadata: args.eventId ? { eventId: args.eventId } : undefined,
    });

    return buildCredentialSummary({
      eventId: args.eventId,
      accountSid,
      authToken,
      fromPhoneNumber,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: {
    workspaceSlug: v.string(),
    eventId: v.optional(v.id("events")),
  },
  handler: async (ctx, args) => {
    const workspaceScope = await requireWorkspaceHost(ctx, {
      workspaceSlug: args.workspaceSlug,
    });
    if (args.eventId) {
      await ensureEventInSiteScope(ctx, args.eventId, {
        siteKey: workspaceScope.siteKey ?? undefined,
        workspaceSlug: workspaceScope.workspaceSlug,
      });
    }

    const existingCredential = await findTwilioCredentialForScope(
      ctx,
      workspaceScope.workspaceId,
      args.eventId,
    );
    if (!existingCredential) {
      return { removed: false };
    }

    await ctx.db.delete(existingCredential._id);
    await writeAuditEntry(ctx, {
      action: "twilioCredential.delete",
      targetKind: args.eventId ? "eventTwilioCredential" : "workspaceTwilioCredential",
      targetId: existingCredential._id,
      workspaceId: workspaceScope.workspaceId,
      summary: `${args.eventId ? "Event override" : "Organizer default"} removed`,
      metadata: args.eventId ? { eventId: args.eventId } : undefined,
    });
    return { removed: true };
  },
});

export const resolveForEvent = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }): Promise<StoredTwilioCredentialResolution | null> => {
    const storedCredentialMatch = await resolveStoredTwilioCredentialForEvent(ctx, eventId);
    if (!storedCredentialMatch) {
      return null;
    }
    return {
      accountSid: storedCredentialMatch.credential.accountSid,
      authToken: storedCredentialMatch.credential.authToken,
      fromPhoneNumber: storedCredentialMatch.credential.fromPhoneNumber,
      source: storedCredentialMatch.source,
    };
  },
});

export const listWebhookAuthTokensForPhoneNumber = internalQuery({
  args: { phoneNumber: v.string() },
  handler: async (ctx, { phoneNumber }): Promise<string[]> => {
    let normalizedPhoneNumber: string;
    try {
      normalizedPhoneNumber = formatPhoneNumberForSms(phoneNumber);
    } catch {
      return [];
    }
    const credentials = await ctx.db
      .query("twilioCredentials")
      .withIndex("by_fromPhoneNumber", (queryBuilder) =>
        queryBuilder.eq("fromPhoneNumber", normalizedPhoneNumber),
      )
      .collect();
    return Array.from(new Set(credentials.map((credential) => credential.authToken)));
  },
});
