"use node";
import { resolveQrCodeColors } from "@coucou/sdk/shared/qr-code-colors";
import { v } from "convex/values";
import QRCode from "qrcode";
import { action, internalAction } from "../_generated/server";

/**
 * Generate a QR code image and upload it to Convex storage
 * Returns the storage ID of the uploaded QR code image
 */
export const generateAndUploadQrCode = internalAction({
  args: {
    value: v.string(), // The value to encode in the QR code
    foregroundColor: v.optional(v.string()), // QR foreground color
    backgroundColor: v.optional(v.string()), // QR background color
  },
  handler: async (ctx, args) => {
    const { foregroundColor, backgroundColor } = resolveQrCodeColors(args);
    const qrCodeBuffer = await QRCode.toBuffer(args.value, {
      type: "png",
      width: 500,
      margin: 2,
      color: {
        dark: foregroundColor,
        light: backgroundColor,
      },
    });

    // Upload to Convex storage
    // Convert Buffer to Uint8Array for Blob compatibility
    const qrCodeUint8Array = new Uint8Array(qrCodeBuffer);
    const storageId = await ctx.storage.store(new Blob([qrCodeUint8Array], { type: "image/png" }));

    return storageId;
  },
});

/**
 * Generate a QR code image and upload it to Convex storage (action wrapper)
 * This version can be called from other actions and preserves authentication context
 * Returns the storage ID and URL of the uploaded QR code image
 */
export const generateAndUploadQrCodeWithAuth = action({
  args: {
    value: v.string(), // The value to encode in the QR code
    foregroundColor: v.optional(v.string()), // QR foreground color
    backgroundColor: v.optional(v.string()), // QR background color
  },
  handler: async (ctx, args) => {
    const { foregroundColor, backgroundColor } = resolveQrCodeColors(args);
    const qrCodeBuffer = await QRCode.toBuffer(args.value, {
      type: "png",
      width: 500,
      margin: 2,
      color: {
        dark: foregroundColor,
        light: backgroundColor,
      },
    });

    // Upload to Convex storage using the calling action's authentication context
    // Convert Buffer to Uint8Array for Blob compatibility
    const qrCodeUint8Array = new Uint8Array(qrCodeBuffer);
    const storageId = await ctx.storage.store(new Blob([qrCodeUint8Array], { type: "image/png" }));

    // Get publicly accessible URL for the QR code
    const url = await ctx.storage.getUrl(storageId);

    return {
      storageId,
      url: url || undefined,
    };
  },
});

/**
 * Get a publicly accessible URL for a stored QR code image
 * Note: This returns a URL that can be used with Twilio MMS
 */
export const getQrCodeUrl = internalAction({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    // Get the URL for the stored file
    // Convex storage URLs are publicly accessible
    const url = await ctx.storage.getUrl(args.storageId);
    return url;
  },
});
