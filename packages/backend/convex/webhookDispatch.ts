import {
  WEBHOOK_DELIVERY_ID_HEADER,
  WEBHOOK_EVENT_TYPE_HEADER,
  WEBHOOK_KEY_GENERATION_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
} from "@coucou/sdk/api-v1";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./functions";
import { buildWebhookEnvelope, buildWebhookSignatureHeader } from "./lib/webhookCrypto";

const DELIVERY_REQUEST_TIMEOUT_MS = 10_000;

export const attemptDelivery = internalAction({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  handler: async (ctx, args) => {
    const dispatchTarget = await ctx.runQuery(internal.webhookDeliveries.getDeliveryForDispatch, {
      deliveryId: args.deliveryId,
    });
    if (!dispatchTarget || dispatchTarget.delivery.status !== "pending") {
      return;
    }

    const { delivery, endpoint } = dispatchTarget;
    if (!endpoint.isActive || !dispatchTarget.eventAccessAllowed) {
      await ctx.runMutation(internal.webhookDeliveries.markDeliverySkippedInactive, {
        deliveryId: args.deliveryId,
      });
      return;
    }

    // Inject the delivery id (the consumer-facing idempotency key) into the
    // stored payload snapshot, then encrypt with a fresh IV for this attempt.
    const payload = JSON.parse(delivery.payloadJson) as Record<string, unknown>;
    payload.deliveryId = delivery._id;
    const payloadJson = JSON.stringify(payload);

    try {
      const envelope = await buildWebhookEnvelope(
        payloadJson,
        endpoint.encryptionSecretBase64,
        endpoint.secretGeneration,
      );
      const rawBody = JSON.stringify(envelope);
      const timestampSeconds = Math.floor(Date.now() / 1000);
      const signatureHeader = await buildWebhookSignatureHeader(
        rawBody,
        endpoint.signingSecretBase64,
        timestampSeconds,
      );

      const response = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "coucou-webhooks/1",
          [WEBHOOK_EVENT_TYPE_HEADER]: delivery.eventType,
          [WEBHOOK_DELIVERY_ID_HEADER]: delivery._id,
          [WEBHOOK_KEY_GENERATION_HEADER]: String(endpoint.secretGeneration),
          [WEBHOOK_SIGNATURE_HEADER]: signatureHeader,
        },
        body: rawBody,
        signal: AbortSignal.timeout(DELIVERY_REQUEST_TIMEOUT_MS),
      });

      await ctx.runMutation(internal.webhookDeliveries.recordDeliveryAttempt, {
        deliveryId: args.deliveryId,
        responseStatus: response.status,
        errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
      });
    } catch (error) {
      await ctx.runMutation(internal.webhookDeliveries.recordDeliveryAttempt, {
        deliveryId: args.deliveryId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  },
});
