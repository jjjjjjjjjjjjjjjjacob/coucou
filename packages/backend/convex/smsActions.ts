/**
 * SMS actions that require Node.js runtime
 * Uses Twilio for sending SMS messages
 */

"use node";
import { v } from "convex/values";
import twilio from "twilio";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction } from "./_generated/server";
import { formatPhoneNumberForSms, obfuscatePhoneNumber } from "./lib/phoneUtils";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Determines if we're in development mode with SMS disabled
 */
function isDevWithSmsDisabled(): boolean {
  return process.env.DEV_TWILIO_ENABLED === "false";
}

/** Resolves Coucou's environment-backed fallback credentials. */
type ResolvedTwilioCredentials = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  source: "event" | "workspace" | "global";
};

function getGlobalTwilioCredentials(): ResolvedTwilioCredentials | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    const missingKeys = [];
    if (!accountSid) missingKeys.push("TWILIO_ACCOUNT_SID");
    if (!authToken) missingKeys.push("TWILIO_AUTH_TOKEN");
    if (!fromNumber) missingKeys.push("TWILIO_PHONE_NUMBER");

    throw new Error(
      `Twilio credentials not configured. Missing environment variables: ${missingKeys.join(", ")}`,
    );
  }

  return { accountSid, authToken, fromNumber, source: "global" };
}

async function resolveTwilioCredentials(
  ctx: Pick<ActionCtx, "runQuery">,
  eventId?: Id<"events">,
): Promise<ResolvedTwilioCredentials | null> {
  if (isDevWithSmsDisabled()) {
    console.warn("⚠️  SMS disabled in development (DEV_TWILIO_ENABLED=false). SMS will be skipped.");
    return null;
  }

  if (eventId) {
    const storedCredentials = await ctx.runQuery(internal.twilioCredentials.resolveForEvent, {
      eventId,
    });
    if (storedCredentials) {
      return {
        accountSid: storedCredentials.accountSid,
        authToken: storedCredentials.authToken,
        fromNumber: storedCredentials.fromPhoneNumber,
        source: storedCredentials.source,
      };
    }
  }

  return getGlobalTwilioCredentials();
}

async function recordNotificationConversationMessage(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
  args: {
    notificationId?: Id<"smsNotifications">;
    providerMessageId?: string;
    providerStatus: string;
    qrCodeSent?: boolean;
    createdAt?: number;
  },
) {
  if (!args.notificationId) {
    return;
  }

  const mirrorContext = await ctx.runQuery(internal.smsConversations.getNotificationMirrorContext, {
    notificationId: args.notificationId,
  });
  if (!mirrorContext) {
    return;
  }

  await ctx.runMutation(internal.smsConversations.recordMessage, {
    eventId: mirrorContext.eventId,
    phoneHash: mirrorContext.phoneHash,
    phoneObfuscated: mirrorContext.phoneObfuscated,
    participantClerkUserIds: mirrorContext.participantClerkUserIds,
    direction: mirrorContext.direction,
    kind: mirrorContext.kind,
    body: mirrorContext.body,
    smsNotificationId: mirrorContext.smsNotificationId,
    textBlastId: mirrorContext.textBlastId,
    textBlastRecipientId: mirrorContext.textBlastRecipientId,
    qrCodeSent: args.qrCodeSent,
    providerMessageId: args.providerMessageId ?? mirrorContext.providerMessageId,
    providerStatus: args.providerStatus,
    createdAt: args.createdAt ?? Date.now(),
  });
}

/**
 * Calculate SMS cost based on message length
 * Twilio charges per 160-character segment for US numbers
 * ~$0.00645 per segment for US SMS
 */
function calculateSmsCost(messageLength: number): number {
  const segments = Math.ceil(messageLength / 160);
  const costPerSegment = 0.00645; // US SMS cost per segment
  return segments * costPerSegment;
}

/**
 * Internal action to send SMS via Twilio
 * Only callable from other Convex functions, not from client
 */
export const sendSmsInternal = internalAction({
  args: {
    eventId: v.optional(v.id("events")),
    phoneNumber: v.string(),
    message: v.string(),
    notificationId: v.optional(v.id("smsNotifications")),
    mediaUrl: v.optional(v.string()), // URL for MMS image attachment
    messageType: v.optional(v.string()), // 'Transactional' | 'Promotional'
  },
  handler: async (ctx, args) => {
    // Validate credentials (throws error in production if missing, returns null in dev if disabled)
    const credentials = await resolveTwilioCredentials(ctx, args.eventId);

    if (!credentials) {
      // Dev mode with SMS disabled - update notification status and return gracefully
      const errorMessage = "Twilio disabled in development (DEV_TWILIO_ENABLED=false)";
      console.error(`[sendSmsInternal] ${errorMessage}`);
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
        await recordNotificationConversationMessage(ctx, {
          notificationId: args.notificationId,
          providerStatus: "failed",
        });
      }
      return {
        success: false,
        messageId: undefined,
        phone: obfuscatePhoneNumber(args.phoneNumber),
        error: errorMessage,
      };
    }

    const { accountSid, authToken, fromNumber } = credentials;

    // Format phone number for international format
    let formattedPhone: string;
    try {
      formattedPhone = formatPhoneNumberForSms(args.phoneNumber);
    } catch (error) {
      const errorMessage = `Invalid phone number format: ${getErrorMessage(error)}`;
      console.error(
        `[sendSmsInternal] Phone formatting failed for ${obfuscatePhoneNumber(args.phoneNumber)}: ${errorMessage}`,
      );
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
        await recordNotificationConversationMessage(ctx, {
          notificationId: args.notificationId,
          providerStatus: "failed",
        });
      }
      return {
        success: false,
        messageId: undefined,
        phone: obfuscatePhoneNumber(args.phoneNumber),
        error: errorMessage,
      };
    }

    // Check if user has opted out
    // Wrap in try-catch to handle authentication errors gracefully (internal actions shouldn't need auth)
    let hasOptedOut = false;
    try {
      hasOptedOut = await ctx.runAction(internal.smsMonitoringActions.checkOptOutAction, {
        phoneNumber: formattedPhone,
      });
    } catch (error) {
      // If we get an authentication error (OIDC token), log it but continue
      // Internal actions shouldn't require authentication, so this is likely a Convex bug
      const errorMessage = getErrorMessage(error);
      if (errorMessage.includes("OIDC") || errorMessage.includes("Unauthenticated")) {
        console.warn(
          `[sendSmsInternal] Authentication error checking opt-out status (continuing anyway): ${errorMessage}`,
        );
        // Continue without opt-out check - better to send than to fail silently
        hasOptedOut = false;
      } else {
        // Re-throw other errors
        throw error;
      }
    }

    if (hasOptedOut) {
      // User has opted out - update notification status and skip sending
      const errorMessage = "User has opted out of SMS notifications";
      console.warn(`[sendSmsInternal] User opted out: ${obfuscatePhoneNumber(formattedPhone)}`);
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
        await recordNotificationConversationMessage(ctx, {
          notificationId: args.notificationId,
          providerStatus: "failed",
        });
      }
      return {
        success: false,
        messageId: undefined,
        phone: obfuscatePhoneNumber(formattedPhone),
        skipped: "opted_out",
        error: errorMessage,
      };
    }

    // Create Twilio client
    const twilioClient = twilio(accountSid, authToken);

    try {
      // Send SMS/MMS via Twilio
      const messageConfig: {
        body: string;
        from: string;
        to: string;
        mediaUrl?: string[];
      } = {
        body: args.message,
        from: fromNumber,
        to: formattedPhone,
      };

      // Add media URL for MMS if provided
      if (args.mediaUrl) {
        messageConfig.mediaUrl = [args.mediaUrl];
      }

      const message = await twilioClient.messages.create(messageConfig);

      // Calculate message length and cost
      const messageLength = args.message.length;
      const estimatedCost = calculateSmsCost(messageLength);
      const messageType = args.messageType || "Transactional";

      // Log SMS usage
      // Wrap in try-catch to handle authentication errors gracefully (internal actions shouldn't need auth)
      try {
        await ctx.runAction(internal.smsMonitoringActions.logSmsUsageAction, {
          messageId: message.sid,
          phoneNumber: formattedPhone,
          messageLength,
          messageType,
          estimatedCost,
          timestamp: Date.now(),
        });
      } catch (error) {
        // If we get an authentication error (OIDC token), log it but continue
        // Internal actions shouldn't require authentication, so this is likely a Convex bug
        const errorMessage = getErrorMessage(error);
        if (errorMessage.includes("OIDC") || errorMessage.includes("Unauthenticated")) {
          console.warn(
            `[sendSmsInternal] Authentication error logging SMS usage (continuing anyway): ${errorMessage}`,
          );
          // Continue without logging - SMS was sent successfully, logging is secondary
        } else {
          // Log other errors but don't fail the SMS send
          console.error(`[sendSmsInternal] Error logging SMS usage: ${errorMessage}`);
        }
      }

      // Update notification status if ID provided
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "sent",
          messageId: message.sid,
          sentAt: Date.now(),
        });
        await recordNotificationConversationMessage(ctx, {
          notificationId: args.notificationId,
          providerMessageId: message.sid,
          providerStatus: "sent",
          qrCodeSent: args.mediaUrl !== undefined,
          createdAt: Date.now(),
        });
      }

      return {
        success: true,
        messageId: message.sid,
        phone: obfuscatePhoneNumber(formattedPhone),
      };
    } catch (error) {
      // Update notification status with error if ID provided
      const errorMessage = getErrorMessage(error);
      console.error(
        `[sendSmsInternal] Failed to send SMS to ${obfuscatePhoneNumber(formattedPhone)}: ${errorMessage}`,
        error,
      );
      if (args.notificationId) {
        await ctx.runMutation(internal.sms.updateNotificationStatus, {
          notificationId: args.notificationId,
          status: "failed",
          errorMessage,
        });
        await recordNotificationConversationMessage(ctx, {
          notificationId: args.notificationId,
          providerStatus: "failed",
        });
      }

      throw new Error(`SMS send failed: ${errorMessage}`);
    }
  },
});

/**
 * Internal action to send bulk SMS messages
 * Processes in batches to avoid overwhelming Twilio
 * Sends messages directly via Twilio API and returns write data for a caller-side finalizer.
 */
export const sendBulkSmsInternal = internalAction({
  args: {
    eventId: v.optional(v.id("events")),
    recipients: v.array(
      v.object({
        phoneNumber: v.string(),
        clerkUserId: v.string(),
        notificationId: v.id("smsNotifications"),
        textBlastRecipientId: v.id("textBlastRecipients"),
        phoneHash: v.string(),
        personalizedMessage: v.optional(v.string()),
        mediaUrl: v.optional(v.string()),
      }),
    ),
    message: v.string(),
    batchSize: v.optional(v.number()),
    messageType: v.optional(v.string()), // 'Transactional' | 'Promotional'
  },
  handler: async (ctx, args) => {
    // Validate credentials (throws error in production if missing, returns null in dev if disabled)
    const credentials = await resolveTwilioCredentials(ctx, args.eventId);

    if (!credentials) {
      // Dev mode with SMS disabled - return failure for all recipients
      console.error(
        `[sendBulkSmsInternal] Twilio disabled - failing all ${args.recipients.length} recipients`,
      );
      return {
        totalRecipients: args.recipients.length,
        successCount: 0,
        failureCount: args.recipients.length,
        results: args.recipients.map((recipient) => ({
          notificationId: recipient.notificationId,
          textBlastRecipientId: recipient.textBlastRecipientId,
          clerkUserId: recipient.clerkUserId,
          phoneHash: recipient.phoneHash,
          success: false,
          error: "Twilio disabled in development (DEV_TWILIO_ENABLED=false)",
        })),
      };
    }

    const { accountSid, authToken, fromNumber } = credentials;

    // Create Twilio client once - this doesn't depend on Convex auth tokens
    const twilioClient = twilio(accountSid, authToken);

    const batchSize = args.batchSize || 10; // Process 10 SMS at a time
    const messageType = args.messageType || "Transactional";
    const results: Array<{
      notificationId: Id<"smsNotifications">;
      textBlastRecipientId: Id<"textBlastRecipients">;
      clerkUserId: string;
      phoneHash: string;
      success: boolean;
      messageId?: string;
      error?: string;
      messageLength?: number;
      messageType?: string;
      estimatedCost?: number;
      sentAt?: number;
      mediaIncluded?: boolean;
    }> = [];

    console.log(
      `[sendBulkSmsInternal] Starting bulk send: ${args.recipients.length} recipients, batch size: ${batchSize}`,
    );

    // Process recipients in batches
    for (
      let recipientStartIndex = 0;
      recipientStartIndex < args.recipients.length;
      recipientStartIndex += batchSize
    ) {
      const batch = args.recipients.slice(recipientStartIndex, recipientStartIndex + batchSize);
      const batchNumber = Math.floor(recipientStartIndex / batchSize) + 1;
      const totalBatches = Math.ceil(args.recipients.length / batchSize);

      console.log(
        `[sendBulkSmsInternal] Processing batch ${batchNumber}/${totalBatches} (${batch.length} recipients)`,
      );

      // Send batch of SMS messages directly via Twilio API.
      const batchResults = await Promise.allSettled(
        batch.map(async (recipient) => {
          try {
            // Format phone number for international format
            let formattedPhone: string;
            try {
              formattedPhone = formatPhoneNumberForSms(recipient.phoneNumber);
            } catch (error) {
              const errorMessage = `Invalid phone number format: ${getErrorMessage(error)}`;
              console.error(
                `[sendBulkSmsInternal] Phone formatting failed for ${obfuscatePhoneNumber(recipient.phoneNumber)}: ${errorMessage}`,
              );
              return {
                success: false,
                messageId: undefined,
                phone: obfuscatePhoneNumber(recipient.phoneNumber),
                error: errorMessage,
              };
            }

            // Send SMS/MMS via Twilio directly.
            const personalizedMessage = recipient.personalizedMessage ?? args.message;
            const messageConfig: {
              body: string;
              from: string;
              to: string;
              mediaUrl?: string[];
            } = {
              body: personalizedMessage,
              from: fromNumber,
              to: formattedPhone,
            };

            // Add media URL for MMS if provided
            if (recipient.mediaUrl) {
              messageConfig.mediaUrl = [recipient.mediaUrl];
            }

            const message = await twilioClient.messages.create(messageConfig);

            // Calculate message length and cost
            const messageLength = personalizedMessage.length;
            const estimatedCost = calculateSmsCost(messageLength);
            const sentAt = Date.now();

            return {
              success: true,
              messageId: message.sid,
              phone: obfuscatePhoneNumber(formattedPhone),
              messageLength,
              messageType,
              estimatedCost,
              sentAt,
            };
          } catch (error) {
            // Handle Twilio API errors
            const errorMessage = getErrorMessage(error);
            console.error(
              `[sendBulkSmsInternal] Failed to send SMS to ${obfuscatePhoneNumber(recipient.phoneNumber)}: ${errorMessage}`,
              error,
            );

            return {
              success: false,
              messageId: undefined,
              phone: obfuscatePhoneNumber(recipient.phoneNumber),
              error: errorMessage,
            };
          }
        }),
      );

      // Collect results
      batchResults.forEach((result, index) => {
        const recipient = batch[index];
        if (result.status === "fulfilled") {
          // Check if SMS was actually sent successfully, not just if promise fulfilled
          if (result.value.success) {
            results.push({
              notificationId: recipient.notificationId,
              textBlastRecipientId: recipient.textBlastRecipientId,
              clerkUserId: recipient.clerkUserId,
              phoneHash: recipient.phoneHash,
              success: true,
              messageId: result.value.messageId,
              messageLength: result.value.messageLength,
              messageType: result.value.messageType,
              estimatedCost: result.value.estimatedCost,
              sentAt: result.value.sentAt,
              mediaIncluded: recipient.mediaUrl !== undefined,
            });
          } else {
            // Promise fulfilled but SMS wasn't sent (e.g., opted out, invalid phone, Twilio error)
            const errorMessage = result.value.error || "SMS send failed but no error provided";
            console.error(
              `[sendBulkSmsInternal] SMS failed for user ${recipient.clerkUserId}: ${errorMessage}`,
            );
            results.push({
              notificationId: recipient.notificationId,
              textBlastRecipientId: recipient.textBlastRecipientId,
              clerkUserId: recipient.clerkUserId,
              phoneHash: recipient.phoneHash,
              success: false,
              error: errorMessage,
            });
          }
        } else {
          // Promise rejected - exception thrown (shouldn't happen with our try-catch, but handle anyway)
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason ?? "Unknown error");
          console.error(
            `[sendBulkSmsInternal] Exception sending SMS to user ${recipient.clerkUserId}: ${errorMessage}`,
          );
          results.push({
            notificationId: recipient.notificationId,
            textBlastRecipientId: recipient.textBlastRecipientId,
            clerkUserId: recipient.clerkUserId,
            phoneHash: recipient.phoneHash,
            success: false,
            error: errorMessage,
          });
        }
      });

      // Small delay between batches to be respectful to Twilio
      if (recipientStartIndex + batchSize < args.recipients.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // Calculate success/failure counts
    const successCount = results.filter((result) => result.success).length;
    const failureCount = results.filter((result) => !result.success).length;

    console.log(
      `[sendBulkSmsInternal] Bulk send complete: ${successCount} succeeded, ${failureCount} failed out of ${args.recipients.length} total`,
    );

    if (failureCount > 0) {
      const errorMessages = results
        .filter((result) => !result.success && result.error)
        .map((result) => result.error)
        .slice(0, 5); // Show first 5 errors
      console.error(`[sendBulkSmsInternal] Sample errors:`, errorMessages);
    }

    return {
      totalRecipients: args.recipients.length,
      successCount,
      failureCount,
      results,
    };
  },
});
