import { action, internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import { resolvePublicBaseUrlForEvent } from "./lib/publicBaseUrl";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { ensureEventInSiteScope } from "./lib/siteScope";

type QrBatchResult = {
  sent: number;
  failed: number;
  skipped: number;
};

export const listPendingDeferredRecipients = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKey: v.optional(v.string()),
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

    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const qrEnabledKeys = new Set(
      credentials
        .filter((credential) => credential.generateQR === true)
        .map((credential) => credential.listKey),
    );

    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId))
      .collect();

    const eligibleRedemptions = redemptions.filter((redemption) => {
      if (redemption.qrDeliveredAt) return false;
      if (redemption.disabledAt) return false;
      if (!qrEnabledKeys.has(redemption.listKey)) return false;
      if (args.listKey && redemption.listKey !== args.listKey) return false;
      return true;
    });

    const recipients: Array<{
      clerkUserId: string;
      listKey: string;
      code: string;
      phone: string;
    }> = [];
    for (const redemption of eligibleRedemptions) {
      const userRecord = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) =>
          q.eq("clerkUserId", redemption.clerkUserId),
        )
        .unique();
      if (!userRecord?.phone) continue;
      recipients.push({
        clerkUserId: redemption.clerkUserId,
        listKey: redemption.listKey,
        code: redemption.code,
        phone: userRecord.phone,
      });
    }
    return recipients;
  },
});

export const countPendingDeferredRecipients = query({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return 0;

    const credentials = await ctx.db
      .query("listCredentials")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const qrEnabledKeys = new Set(
      credentials
        .filter((credential) => credential.generateQR === true)
        .map((credential) => credential.listKey),
    );

    const redemptions = await ctx.db
      .query("redemptions")
      .withIndex("by_event_user", (q) => q.eq("eventId", args.eventId))
      .collect();

    return redemptions.filter(
      (redemption) =>
        !redemption.qrDeliveredAt &&
        !redemption.disabledAt &&
        qrEnabledKeys.has(redemption.listKey),
    ).length;
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

    const recipients = (await ctx.runQuery(
      api.qrDelivery.listPendingDeferredRecipients,
      {
        eventId: args.eventId,
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
        listKey: args.listKey,
      },
    )) as Array<{
      clerkUserId: string;
      listKey: string;
      code: string;
      phone: string;
    }>;

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const recipient of recipients) {
      try {
        const ticketUrl = `${validatedBaseUrl}/redeem/${recipient.code}`;
        const qrCodeStorageId = await ctx.runAction(
          internal.lib.qrCodeGenerator.generateAndUploadQrCode,
          {
            value: ticketUrl,
            foregroundColor: event.themeTextColor,
            backgroundColor: event.themeBackgroundColor,
          },
        );
        const qrCodeUrl = await ctx.runAction(
          internal.lib.qrCodeGenerator.getQrCodeUrl,
          { storageId: qrCodeStorageId },
        );
        if (!qrCodeUrl) {
          skipped += 1;
          continue;
        }

        const message = `Your QR code for ${event.name?.trim() || "the event"}.

View your ticket here: ${ticketUrl}`;

        const notificationId = await ctx.runMutation(
          internal.sms.createNotification,
          {
            eventId: args.eventId,
            recipientClerkUserId: recipient.clerkUserId,
            recipientPhoneObfuscated: obfuscatePhoneNumber(recipient.phone),
            type: "approval",
            message,
          },
        );

        await ctx.runAction(internal.smsActions.sendSmsInternal, {
          phoneNumber: recipient.phone,
          message,
          notificationId,
          mediaUrl: qrCodeUrl,
          messageType: "Transactional",
        });

        await ctx.runMutation(internal.qrDelivery.markRedemptionDelivered, {
          eventId: args.eventId,
          clerkUserId: recipient.clerkUserId,
        });

        sent += 1;
      } catch (error) {
        console.error(
          `[qrDelivery] Failed to send QR to ${recipient.clerkUserId}:`,
          error,
        );
        failed += 1;
      }
    }

    return { sent, failed, skipped };
  },
});
