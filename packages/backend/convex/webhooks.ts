/**
 * Twilio webhook handlers for SMS delivery status and opt-outs
 * HTTP actions cannot use Node.js runtime, so Twilio signature validation
 * is handled at the application level
 */

import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Handle SMS delivery status webhooks from Twilio
 * Configure this endpoint in your Twilio Console under Messaging > Settings > Webhook URL
 */
export const handleDeliveryStatus = httpAction(async (ctx, request) => {
  // Parse webhook data
  const body = await request.text();
  const params = new URLSearchParams(body);
  const messageSid = params.get("MessageSid");
  const messageStatus = params.get("MessageStatus");
  const errorCode = params.get("ErrorCode");
  const errorMessage = params.get("ErrorMessage");

  if (!messageSid || !messageStatus) {
    return new Response("Missing required parameters", { status: 400 });
  }

  try {
    // Update SMS notification status in database
    await ctx.runMutation(internal.sms.updateNotificationByMessageId, {
      messageId: messageSid,
      status: mapTwilioStatus(messageStatus),
      errorMessage: errorMessage || undefined,
    });

    // Log delivery for cost tracking if delivered
    if (messageStatus === "delivered") {
      await ctx.runMutation(internal.smsMonitoring.updateDeliveryStatus, {
        messageId: messageSid,
        status: "delivered",
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Failed to process delivery status webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

/**
 * Handle opt-out webhooks from Twilio
 * Twilio automatically handles STOP/START keywords, this webhook notifies us
 */
export const handleOptOut = httpAction(async (ctx, request) => {
  const body = await request.text();
  const params = new URLSearchParams(body);

  const from = params.get("From"); // User's phone number
  const bodyText = params.get("Body")?.toLowerCase().trim();
  const messageSid = params.get("MessageSid");

  if (!from) {
    return new Response("Missing phone number", { status: 400 });
  }

  try {
    // Check if this is an opt-out keyword
    const optOutKeywords = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
    const optInKeywords = ["start", "yes", "unstop"];

    if (bodyText && optOutKeywords.includes(bodyText)) {
      // Record opt-out
      await ctx.runAction(internal.smsMonitoringActions.recordOptOutAction, {
        phoneNumber: from,
        reason: "user_request_stop",
      });

      console.log(`SMS opt-out recorded for ${from}`);
    } else if (bodyText && optInKeywords.includes(bodyText)) {
      // Handle opt-in (remove from opt-out list)
      await ctx.runAction(internal.smsMonitoringActions.removeOptOutAction, {
        phoneNumber: from,
      });

      console.log(`SMS opt-in recorded for ${from}`);
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Failed to process opt-out webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

/**
 * Handle incoming SMS messages (for STOP/START responses)
 */
export const handleIncomingSms = httpAction(async (ctx, request) => {
  const body = await request.text();
  const params = new URLSearchParams(body);

  const from = params.get("From");
  const messageBody = params.get("Body")?.toLowerCase().trim();
  const to = params.get("To"); // Your Twilio phone number

  if (!from || !messageBody) {
    return new Response("Missing required parameters", { status: 400 });
  }

  try {
    // Handle common SMS keywords
    const optOutKeywords = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit"];
    const optInKeywords = ["start", "yes", "unstop"];
    const helpKeywords = ["help", "info"];

    if (optOutKeywords.includes(messageBody)) {
      await ctx.runAction(internal.smsMonitoringActions.recordOptOutAction, {
        phoneNumber: from,
        reason: "user_request_sms",
      });

      // Send automatic confirmation (Twilio handles this automatically)
      console.log(`Opt-out processed for ${from}`);

    } else if (optInKeywords.includes(messageBody)) {
      await ctx.runAction(internal.smsMonitoringActions.removeOptOutAction, {
        phoneNumber: from,
      });

      console.log(`Opt-in processed for ${from}`);

    } else if (helpKeywords.includes(messageBody)) {
      // Send help response via Twilio action
      // The action will handle dev/production logic internally
      try {
        await ctx.runAction(internal.smsActions.sendHelpResponse, {
          to: from,
          from: to || "",
        });
      } catch (error) {
        // In production, missing credentials will throw - log and continue
        // In dev with SMS disabled, it will return gracefully
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to send help response:", errorMessage);
        // Don't throw - webhook should still return 200 even if help response fails
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    console.error("Failed to process incoming SMS:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

/**
 * Map Twilio message status to our internal status
 */
function mapTwilioStatus(twilioStatus: string): string {
  switch (twilioStatus) {
    case "delivered":
      return "sent";
    case "failed":
    case "undelivered":
      return "failed";
    case "sent":
    case "queued":
    case "accepted":
      return "pending";
    default:
      return "pending";
  }
}