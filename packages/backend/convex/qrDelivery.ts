import { resolveQrDeliveryMessage } from "@coucou/sdk/shared/automated-event-messages";
import {
  applyMessageTemplateVariables,
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  resolveMessageTemplateFirstName,
} from "@coucou/sdk/shared/message-template";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import { action, internalMutation, query } from "./_generated/server";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import { resolvePublicBaseUrlForEvent } from "./lib/publicBaseUrl";
import { ensureEventInSiteScope } from "./lib/siteScope";
import { getSmsErrorDetails, type SmsErrorDetails } from "./lib/smsErrorDetails";
import { formatSmsMessageForSite } from "./lib/smsProgramCopy";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

type QrBatchResult = {
  sent: number;
  failed: number;
  skipped: number;
  failures: Array<{
    rsvpId: Id<"rsvps">;
    clerkUserId: string;
    message: string;
    errorCode?: string;
  }>;
};

type QrDeliveryEvent = Pick<
  Doc<"events">,
  | "name"
  | "secondaryTitle"
  | "siteKey"
  | "location"
  | "eventDate"
  | "eventTimezone"
  | "qrDeliveryMessage"
>;

type QrDeliveryMessageRecipient = {
  firstName?: string | null;
  lastName?: string | null;
};

type QrDeliveryRecipient = QrDeliveryMessageRecipient & {
  rsvpId: Id<"rsvps">;
  clerkUserId: string;
  listKey: string;
  code: string;
  phone: string;
  phoneHash: string;
  phoneObfuscated: string;
};

type SendSmsInternalResult = {
  success?: boolean;
  messageId?: string;
  error?: string;
  skipped?: string;
  errorCode?: string;
  errorDetails?: string;
  errorStack?: string;
};

export function formatQrDeliveryMessage(
  event: QrDeliveryEvent,
  recipient: QrDeliveryMessageRecipient,
  ticketUrl: string,
): string {
  const recipientFullName = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ");
  const message = applyMessageTemplateVariables(resolveQrDeliveryMessage(event), {
    firstName: resolveMessageTemplateFirstName({
      firstName: recipient.firstName,
      fullName: recipientFullName,
    }),
    eventName: formatEventTitleForMessageTemplate(event),
    eventDate: formatEventDateForMessageTemplate(event.eventDate, event.eventTimezone),
    eventLocation: event.location?.trim() ?? "",
    qrCodeUrl: ticketUrl,
  });
  return formatSmsMessageForSite(event.siteKey, message);
}

async function listEligibleQrDeliveryRecipients(
  ctx: Pick<QueryCtx, "db">,
  args: {
    eventId: Id<"events">;
    listKey?: string;
    rsvpId?: Id<"rsvps">;
    includePreviouslyDelivered?: boolean;
  },
): Promise<QrDeliveryRecipient[]> {
  const credentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
    .collect();
  const qrEnabledListKeys = new Set(
    credentials
      .filter((credential) => credential.generateQR === true)
      .map((credential) => credential.listKey),
  );
  const redemptions = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) => queryBuilder.eq("eventId", args.eventId))
    .collect();
  const recipients: QrDeliveryRecipient[] = [];

  for (const redemption of redemptions) {
    if (redemption.qrDeliveredAt && !args.includePreviouslyDelivered) continue;
    if (redemption.disabledAt) continue;
    if (!qrEnabledListKeys.has(redemption.listKey)) continue;
    if (args.listKey && redemption.listKey !== args.listKey) continue;

    const rsvp = await ctx.db
      .query("rsvps")
      .withIndex("by_event_user", (queryBuilder) =>
        queryBuilder.eq("eventId", args.eventId).eq("clerkUserId", redemption.clerkUserId),
      )
      .first();
    if (!rsvp || rsvp.smsConsent !== true) continue;
    if (args.rsvpId && rsvp._id !== args.rsvpId) continue;

    const userRecord = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) =>
        queryBuilder.eq("clerkUserId", redemption.clerkUserId),
      )
      .unique();
    if (!userRecord?.phone) continue;

    try {
      const phoneResolution = await normalizeAndHashPhoneNumber(userRecord.phone);
      const activeOptOut = await ctx.db
        .query("smsOptOuts")
        .withIndex("by_phone", (queryBuilder) =>
          queryBuilder.eq("phoneNumber", phoneResolution.phoneHash),
        )
        .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("reOptInAt"), undefined))
        .first();
      if (activeOptOut) continue;

      recipients.push({
        rsvpId: rsvp._id,
        clerkUserId: redemption.clerkUserId,
        listKey: redemption.listKey,
        code: redemption.code,
        phone: phoneResolution.normalizedPhoneNumber,
        phoneHash: phoneResolution.phoneHash,
        phoneObfuscated: obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber),
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
      });
    } catch (error) {
      console.warn(
        `[qrDelivery] Skipping invalid phone for ${redemption.clerkUserId}:`,
        getSmsErrorDetails(error).errorMessage,
      );
    }
  }

  return recipients;
}

export const listPendingDeferredRecipients = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKey: v.optional(v.string()),
    rsvpId: v.optional(v.id("rsvps")),
    includePreviouslyDelivered: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    return await listEligibleQrDeliveryRecipients(ctx, args);
  },
});

export const countPendingDeferredRecipients = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    await ensureEventInSiteScope(ctx, args.eventId, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    return (await listEligibleQrDeliveryRecipients(ctx, { eventId: args.eventId })).length;
  },
});

export const markRedemptionDelivered = internalMutation({
  args: {
    eventId: v.id("events"),
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const redemption = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) =>
        q.eq("eventId", args.eventId).eq("clerkUserId", args.clerkUserId),
      )
      .first();
    if (!redemption) return null;
    await ctx.db.patch(redemption._id, { qrDeliveredAt: Date.now() });
    return redemption._id;
  },
});

async function recordQrPreparationFailure(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    eventId: Id<"events">;
    recipient: QrDeliveryRecipient;
    notificationId: Id<"smsNotifications">;
    message: string;
    error: SmsErrorDetails;
  },
): Promise<void> {
  await ctx.runMutation(internal.sms.updateNotificationStatus, {
    notificationId: args.notificationId,
    status: "failed",
    ...args.error,
  });
  await ctx.runMutation(internal.smsConversations.recordMessage, {
    eventId: args.eventId,
    phoneHash: args.recipient.phoneHash,
    phoneObfuscated: args.recipient.phoneObfuscated,
    participantClerkUserIds: [args.recipient.clerkUserId],
    direction: "outbound",
    kind: "approval",
    body: args.message,
    providerStatus: "failed",
    smsNotificationId: args.notificationId,
    ...args.error,
  });
}

async function deliverQrToRecipient(
  ctx: Pick<ActionCtx, "runAction" | "runMutation">,
  args: {
    event: Doc<"events">;
    recipient: QrDeliveryRecipient;
    validatedBaseUrl: string;
  },
): Promise<{ sent: true } | { sent: false; error: SmsErrorDetails }> {
  const ticketUrl = `${args.validatedBaseUrl}/redeem/${args.recipient.code}`;
  const message = formatQrDeliveryMessage(args.event, args.recipient, ticketUrl);
  const notificationId = (await ctx.runMutation(internal.sms.createNotification, {
    eventId: args.event._id,
    recipientClerkUserId: args.recipient.clerkUserId,
    recipientPhoneObfuscated: args.recipient.phoneObfuscated,
    recipientPhoneHash: args.recipient.phoneHash,
    type: "approval",
    message,
  })) as Id<"smsNotifications">;

  try {
    const qrCodeStorageId = await ctx.runAction(
      internal.lib.qrCodeGenerator.generateAndUploadQrCode,
      {
        value: ticketUrl,
        foregroundColor: args.event.themeTextColor,
        backgroundColor: args.event.themeBackgroundColor,
      },
    );
    const qrCodeUrl = await ctx.runAction(internal.lib.qrCodeGenerator.getQrCodeUrl, {
      storageId: qrCodeStorageId,
    });
    if (!qrCodeUrl) {
      throw new Error("Generated QR image URL was unavailable");
    }

    const sendResult = (await ctx.runAction(internal.smsActions.sendSmsInternal, {
      eventId: args.event._id,
      phoneNumber: args.recipient.phone,
      message,
      notificationId,
      mediaUrl: qrCodeUrl,
      messageType: "Transactional",
    })) as SendSmsInternalResult;
    if (sendResult.success !== true) {
      return {
        sent: false,
        error: {
          errorMessage: sendResult.error ?? sendResult.skipped ?? "QR message was not sent",
          errorCode: sendResult.errorCode,
          errorDetails: sendResult.errorDetails,
          errorStack: sendResult.errorStack,
        },
      };
    }

    await ctx.runMutation(internal.qrDelivery.markRedemptionDelivered, {
      eventId: args.event._id,
      clerkUserId: args.recipient.clerkUserId,
    });
    return { sent: true };
  } catch (error) {
    const errorDetails = getSmsErrorDetails(error);
    await recordQrPreparationFailure(ctx, {
      eventId: args.event._id,
      recipient: args.recipient,
      notificationId,
      message,
      error: errorDetails,
    });
    return { sent: false, error: errorDetails };
  }
}

export const sendQrToRsvp = action({
  args: {
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sent: boolean;
    failureReason?: string;
    errorCode?: string;
  }> => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });
    const event = (await ctx.runQuery(api.events.get, {
      eventId: args.eventId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    })) as Doc<"events"> | null;
    if (!event) throw new Error("Event not found");
    const validatedBaseUrl = resolvePublicBaseUrlForEvent(event);
    if (!validatedBaseUrl) throw new Error("Missing public base URL for event site");

    const recipients = (await ctx.runQuery(api.qrDelivery.listPendingDeferredRecipients, {
      eventId: args.eventId,
      rsvpId: args.rsvpId,
      includePreviouslyDelivered: true,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    })) as QrDeliveryRecipient[];
    const recipient = recipients[0];
    if (!recipient) {
      return {
        sent: false,
        failureReason:
          "This guest is not eligible for QR delivery. Check SMS consent, opt-out, phone, ticket, and prior-delivery status.",
        errorCode: "QR_RECIPIENT_NOT_ELIGIBLE",
      };
    }

    const result = await deliverQrToRecipient(ctx, { event, recipient, validatedBaseUrl });
    return result.sent
      ? { sent: true }
      : {
          sent: false,
          failureReason: result.error.errorMessage,
          errorCode: result.error.errorCode,
        };
  },
});

export const sendDeferredQrBatch = action({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<QrBatchResult> => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const event = (await ctx.runQuery(api.events.get, {
      eventId: args.eventId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    })) as Doc<"events"> | null;
    if (!event) {
      throw new Error("Event not found");
    }

    const validatedBaseUrl = resolvePublicBaseUrlForEvent(event);
    if (!validatedBaseUrl) {
      throw new Error("Missing public base URL for event site");
    }

    const recipients = (await ctx.runQuery(api.qrDelivery.listPendingDeferredRecipients, {
      eventId: args.eventId,
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
      listKey: args.listKey,
    })) as QrDeliveryRecipient[];

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failures: QrBatchResult["failures"] = [];

    for (const recipient of recipients) {
      const result = await deliverQrToRecipient(ctx, { event, recipient, validatedBaseUrl });
      if (result.sent) {
        sent += 1;
      } else {
        console.error(
          `[qrDelivery] Failed to send QR to ${recipient.clerkUserId}: ${result.error.errorMessage}`,
        );
        failed += 1;
        failures.push({
          rsvpId: recipient.rsvpId,
          clerkUserId: recipient.clerkUserId,
          message: result.error.errorMessage,
          errorCode: result.error.errorCode,
        });
      }
    }

    return { sent, failed, skipped, failures };
  },
});
