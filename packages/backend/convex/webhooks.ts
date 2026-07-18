/**
 * Twilio webhook handlers for SMS delivery status and opt-outs
 * HTTP actions cannot use Node.js runtime, so Twilio signature validation
 * is handled at the application level
 */

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

function base64FromArrayBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binaryString = "";
  for (const byte of bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString);
}

function timingSafeEqual(firstValue: string, secondValue: string): boolean {
  if (firstValue.length !== secondValue.length) {
    return false;
  }

  let difference = 0;
  for (let characterIndex = 0; characterIndex < firstValue.length; characterIndex++) {
    difference |= firstValue.charCodeAt(characterIndex) ^ secondValue.charCodeAt(characterIndex);
  }
  return difference === 0;
}

function buildTwilioSignaturePayload(requestUrl: string, params: URLSearchParams): string {
  const payloadParts = [requestUrl];
  const parameterNames = Array.from(new Set(params.keys())).sort();
  for (const parameterName of parameterNames) {
    for (const parameterValue of params.getAll(parameterName)) {
      payloadParts.push(parameterName, parameterValue);
    }
  }
  return payloadParts.join("");
}

function twilioParamsToRecord(params: URLSearchParams): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    record[key] = value;
  }
  return record;
}

export async function verifyTwilioRequestSignature(
  request: Request,
  rawBody: string,
): Promise<boolean> {
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const providedSignature = request.headers.get("x-twilio-signature");
  if (!twilioAuthToken || !providedSignature) {
    return false;
  }

  const signaturePayload = buildTwilioSignaturePayload(request.url, new URLSearchParams(rawBody));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(twilioAuthToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(signaturePayload));
  const expectedSignature = base64FromArrayBuffer(signatureBuffer);
  return timingSafeEqual(expectedSignature, providedSignature);
}

/**
 * Handle SMS delivery status webhooks from Twilio
 * Configure this endpoint in your Twilio Console under Messaging > Settings > Webhook URL
 */
export const handleDeliveryStatus = httpAction(async (ctx, request) => {
  // Parse webhook data
  const body = await request.text();
  if (!(await verifyTwilioRequestSignature(request, body))) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }
  const params = new URLSearchParams(body);
  const messageSid = params.get("MessageSid");
  const messageStatus = params.get("MessageStatus");
  const _errorCode = params.get("ErrorCode");
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
  } catch (error) {
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
  if (!(await verifyTwilioRequestSignature(request, body))) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }
  const params = new URLSearchParams(body);

  const from = params.get("From"); // User's phone number
  const bodyText = params.get("Body")?.toLowerCase().trim();
  const messageSid = params.get("MessageSid") ?? undefined;

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
      await ctx.runMutation(internal.smsConversations.recordInboundForExistingThreads, {
        fromPhoneNumber: from,
        body: params.get("Body")?.trim() ?? bodyText,
        kind: "opt_out",
        providerMessageId: messageSid,
        providerStatus: "received",
        rawPayload: twilioParamsToRecord(params),
      });

      console.log(`SMS opt-out recorded for ${from}`);
    } else if (bodyText && optInKeywords.includes(bodyText)) {
      // Handle opt-in (remove from opt-out list)
      await ctx.runAction(internal.smsMonitoringActions.removeOptOutAction, {
        phoneNumber: from,
      });
      await ctx.runMutation(internal.smsConversations.recordInboundForExistingThreads, {
        fromPhoneNumber: from,
        body: params.get("Body")?.trim() ?? bodyText,
        kind: "opt_out",
        providerMessageId: messageSid,
        providerStatus: "received",
        rawPayload: twilioParamsToRecord(params),
      });

      console.log(`SMS opt-in recorded for ${from}`);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Failed to process opt-out webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});

/**
 * Handle incoming SMS messages (for STOP/START responses)
 */
export const handleIncomingSms = httpAction(async (ctx, request) => {
  const body = await request.text();
  if (!(await verifyTwilioRequestSignature(request, body))) {
    return new Response("Invalid Twilio signature", { status: 403 });
  }
  const params = new URLSearchParams(body);

  const from = params.get("From");
  const rawMessageBody = params.get("Body")?.trim();
  const messageBody = rawMessageBody?.toLowerCase();
  const to = params.get("To"); // Your Twilio phone number
  const messageSid = params.get("MessageSid") ?? undefined;

  if (!from || !rawMessageBody || !messageBody) {
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
      await ctx.runMutation(internal.smsConversations.recordInboundForExistingThreads, {
        fromPhoneNumber: from,
        body: rawMessageBody,
        kind: "opt_out",
        providerMessageId: messageSid,
        providerStatus: "received",
        rawPayload: twilioParamsToRecord(params),
      });

      // Send automatic confirmation (Twilio handles this automatically)
      console.log(`Opt-out processed for ${from}`);
    } else if (optInKeywords.includes(messageBody)) {
      await ctx.runAction(internal.smsMonitoringActions.removeOptOutAction, {
        phoneNumber: from,
      });
      await ctx.runMutation(internal.smsConversations.recordInboundForExistingThreads, {
        fromPhoneNumber: from,
        body: rawMessageBody,
        kind: "opt_out",
        providerMessageId: messageSid,
        providerStatus: "received",
        rawPayload: twilioParamsToRecord(params),
      });

      console.log(`Opt-in processed for ${from}`);
    } else if (helpKeywords.includes(messageBody)) {
      await ctx.runMutation(internal.smsConversations.recordInboundForExistingThreads, {
        fromPhoneNumber: from,
        body: rawMessageBody,
        kind: "help",
        providerMessageId: messageSid,
        providerStatus: "received",
        rawPayload: twilioParamsToRecord(params),
      });
      // Twilio Advanced Opt-Out owns the branded HELP response for each
      // Messaging Service. Sending another application-level response here
      // would duplicate the reply and can identify the wrong client Brand.
      console.log(`SMS help request recorded for ${from} to ${to ?? "unknown number"}`);
    } else {
      const replyResult = await ctx.runMutation(internal.textBlasts.processIncomingSmsReply, {
        fromPhoneNumber: from,
        messageBody: rawMessageBody,
        messageSid,
      });
      if (replyResult.shouldRespond && replyResult.responseMessage) {
        try {
          await ctx.runAction(internal.smsActions.sendSmsInternal, {
            phoneNumber: from,
            message: replyResult.responseMessage,
            messageType: "Transactional",
          });
          await ctx.runMutation(internal.smsConversations.recordOutboundForExistingThreads, {
            toPhoneNumber: from,
            body: replyResult.responseMessage,
            kind: "reply_action",
            providerStatus: "sent",
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error("Failed to send reply action response:", errorMessage);
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
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
