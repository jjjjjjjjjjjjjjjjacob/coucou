/**
 * Comprehensive Twilio SMS testing and debugging utilities
 * Consolidated from debugSms.ts for simpler testing interface
 */

"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { UserIdentity } from "convex/server";
import twilio from "twilio";

type ActionResult<T> = T extends (...args: any[]) => Promise<infer R>
  ? R
  : never;

type TestTwilioSmsArgs = {
  testPhoneNumber: string;
  testMessage?: string;
};

type SendSmsResult = unknown;

type IdentityWithRole = UserIdentity & { role?: string };

const identityHasHostRole = (identity: IdentityWithRole): boolean => {
  return identity.role === "org:admin";
};

/**
 * Test Twilio SMS integration
 * Call this from Convex dashboard to verify SMS functionality
 * Only admins/hosts can trigger this function
 */
export const testTwilioSms = action({
  args: {
    testPhoneNumber: v.string(),
    testMessage: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message?: string;
    result?: SendSmsResult;
    error?: string;
    timestamp: string;
  }> => {
    // Verify user is admin/host
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        error: "Unauthorized",
        timestamp: new Date().toISOString(),
      };
    }
    const identityWithRole = identity as IdentityWithRole;
    if (!identityHasHostRole(identityWithRole)) {
      return {
        success: false,
        error: "Not authorized - only admins/hosts can trigger test SMS",
        timestamp: new Date().toISOString(),
      };
    }

    // Check if Twilio is enabled in development
    const devTwilioEnabled = process.env.DEV_TWILIO_ENABLED === "true";
    if (!devTwilioEnabled) {
      return {
        success: false,
        error: "Twilio SMS disabled in development (DEV_TWILIO_ENABLED=false). Set DEV_TWILIO_ENABLED=true to enable.",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      // Test simple SMS sending
      const result = await ctx.runAction(internal.smsActions.sendSmsInternal, {
        phoneNumber: args.testPhoneNumber,
        message: args.testMessage || "🎉 Twilio SMS test from Dojo Events - working perfectly!",
      });

      return {
        success: true,
        message: "Twilio SMS sent successfully",
        result,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 * Test phone number formatting to E.164 format
 * Only admins/hosts can trigger this function
 */
export const testPhoneFormatting = action({
  args: {
    phoneNumbers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Verify user is admin/host
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        error: "Unauthorized",
        results: [],
      };
    }
    const identityWithRole = identity as IdentityWithRole;
    if (!identityHasHostRole(identityWithRole)) {
      return {
        success: false,
        error: "Not authorized - only admins/hosts can trigger phone formatting tests",
        results: [],
      };
    }

    const results = [];

    for (const phone of args.phoneNumbers) {
      const digitsOnly = phone.replace(/\D/g, "");
      const formattedOptions = [];

      // Show different formatting options
      if (digitsOnly.length === 10) {
        formattedOptions.push(`+1${digitsOnly}`);
        formattedOptions.push(`1${digitsOnly}`);
      }

      if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
        formattedOptions.push(`+${digitsOnly}`);
      }

      if (!phone.startsWith("+")) {
        formattedOptions.push(`+${digitsOnly}`);
      }

      results.push({
        original: phone,
        digitsOnly,
        length: digitsOnly.length,
        formattedOptions,
        recommended: digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`,
      });
    }

    return {
      success: true,
      results,
      provider: "Twilio",
    };
  },
});

/**
 * Test Twilio account status and balance
 * Only admins/hosts can trigger this function
 */
export const testTwilioAccount = action({
  args: {},
  handler: async (ctx) => {
    // Verify user is admin/host
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }
    const identityWithRole = identity as IdentityWithRole;
    if (!identityHasHostRole(identityWithRole)) {
      return {
        success: false,
        error: "Not authorized - only admins/hosts can check Twilio account status",
      };
    }

    // Check if Twilio is enabled in development
    const devTwilioEnabled = process.env.DEV_TWILIO_ENABLED === "true";
    if (!devTwilioEnabled) {
      return {
        success: false,
        error: "Twilio SMS disabled in development (DEV_TWILIO_ENABLED=false). Set DEV_TWILIO_ENABLED=true to enable."
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      return {
        success: false,
        error: "Twilio credentials not configured"
      };
    }

    const twilioClient = twilio(accountSid, authToken);

    try {
      const account = await twilioClient.api.accounts(accountSid).fetch();
      const balance = await twilioClient.api.accounts(accountSid).balance.fetch();

      return {
        success: true,
        account: {
          sid: account.sid,
          friendlyName: account.friendlyName,
          status: account.status,
          type: account.type,
        },
        balance: {
          balance: balance.balance,
          currency: balance.currency,
        },
        fromNumber: process.env.TWILIO_PHONE_NUMBER,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        code: error.code || error.status,
        timestamp: new Date().toISOString(),
      };
    }
  },
});

/**
 * Send test SMS and check delivery status
 * Combines SMS sending with account verification
 * Only admins/hosts can trigger this function
 */
export const checkTwilioStatus = action({
  args: {
    testPhoneNumber: v.string(),
  },
  handler: async (ctx, args: { testPhoneNumber: string }) => {
    // Verify user is admin/host
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }
    const identityWithRole = identity as IdentityWithRole;
    if (!identityHasHostRole(identityWithRole)) {
      return {
        success: false,
        error: "Not authorized - only admins/hosts can check Twilio status",
      };
    }

    // Check if Twilio is enabled in development
    const devTwilioEnabled = process.env.DEV_TWILIO_ENABLED === "true";
    if (!devTwilioEnabled) {
      return { 
        success: false,
        error: "Twilio SMS disabled in development (DEV_TWILIO_ENABLED=false). Set DEV_TWILIO_ENABLED=true to enable." 
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      return { success: false, error: "Twilio credentials not configured" };
    }

    const twilioClient = twilio(accountSid, authToken);

    try {
      // Format phone number
      const digitsOnly = args.testPhoneNumber.replace(/\D/g, "");
      let formattedPhone = args.testPhoneNumber;

      if (digitsOnly.length === 10) {
        formattedPhone = `+1${digitsOnly}`;
      } else if (!args.testPhoneNumber.startsWith("+")) {
        formattedPhone = `+${digitsOnly}`;
      }

      // Send test SMS
      const message = await twilioClient.messages.create({
        body: "Test SMS from Dojo Pomodoro - if you receive this, SMS is working!",
        from: fromNumber,
        to: formattedPhone,
      });

      // Get account info
      const account = await twilioClient.api.accounts(accountSid).fetch();

      return {
        success: true,
        messageId: message.sid,
        messageSid: message.sid,
        formattedPhone,
        originalPhone: args.testPhoneNumber,
        fromNumber,
        accountSid,
        accountStatus: account.status,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        code: error.code || error.status,
        moreInfo: error.moreInfo,
      };
    }
  },
});