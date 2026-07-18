import { API_VERSION, isCoucouWebhookEventType } from "@coucou/sdk/api-v1";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./functions";
import { generateWebhookEndpointSecrets } from "./lib/webhookCrypto";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

function validateEndpointUrl(url: string): string {
  const trimmedUrl = url.trim();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    throw new Error("Webhook URL is not a valid URL");
  }
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Webhook URLs must use https://");
  }
  return trimmedUrl;
}

function validateSubscribedEventTypes(subscribedEventTypes: string[]): string[] {
  const uniqueEventTypes = [...new Set(subscribedEventTypes)];
  if (uniqueEventTypes.length === 0) {
    throw new Error("Subscribe to at least one event type");
  }
  for (const eventType of uniqueEventTypes) {
    if (!isCoucouWebhookEventType(eventType)) {
      throw new Error(`Unknown webhook event type: ${eventType}`);
    }
  }
  return uniqueEventTypes;
}

function buildEndpointSummary(endpoint: Doc<"webhookEndpoints">) {
  // Secrets are deliberately excluded — revealSecrets is the only read path.
  return {
    endpointId: endpoint._id,
    url: endpoint.url,
    description: endpoint.description ?? null,
    secretGeneration: endpoint.secretGeneration,
    subscribedEventTypes: endpoint.subscribedEventTypes,
    isActive: endpoint.isActive,
    disabledReason: endpoint.disabledReason ?? null,
    consecutiveFailureCount: endpoint.consecutiveFailureCount,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

async function requireEndpointInWorkspace(
  ctx: QueryCtx,
  workspaceSlug: string,
  endpointId: Doc<"webhookEndpoints">["_id"],
): Promise<Doc<"webhookEndpoints">> {
  const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug });
  const endpoint = await ctx.db.get(endpointId);
  if (!endpoint || endpoint.workspaceId !== resolvedScope.workspaceId) {
    throw new Error("Webhook endpoint not found");
  }
  return endpoint;
}

export const create = mutation({
  args: {
    workspaceSlug: v.string(),
    url: v.string(),
    description: v.optional(v.string()),
    subscribedEventTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });

    const validatedUrl = validateEndpointUrl(args.url);
    const validatedEventTypes = validateSubscribedEventTypes(args.subscribedEventTypes);
    const { encryptionSecretBase64, signingSecretBase64 } = generateWebhookEndpointSecrets();

    const now = Date.now();
    const endpointId = await ctx.db.insert("webhookEndpoints", {
      workspaceId: resolvedScope.workspaceId,
      url: validatedUrl,
      description: args.description?.trim() || undefined,
      encryptionSecretBase64,
      signingSecretBase64,
      secretGeneration: 1,
      subscribedEventTypes: validatedEventTypes,
      isActive: true,
      consecutiveFailureCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return {
      endpointId,
      encryptionSecretBase64,
      signingSecretBase64,
      secretGeneration: 1,
    };
  },
});

export const update = mutation({
  args: {
    workspaceSlug: v.string(),
    endpointId: v.id("webhookEndpoints"),
    url: v.optional(v.string()),
    description: v.optional(v.string()),
    subscribedEventTypes: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const endpoint = await requireEndpointInWorkspace(ctx, args.workspaceSlug, args.endpointId);

    const patch: Partial<Doc<"webhookEndpoints">> = { updatedAt: Date.now() };
    if (args.url !== undefined) {
      patch.url = validateEndpointUrl(args.url);
    }
    if (args.description !== undefined) {
      patch.description = args.description.trim() || undefined;
    }
    if (args.subscribedEventTypes !== undefined) {
      patch.subscribedEventTypes = validateSubscribedEventTypes(args.subscribedEventTypes);
    }
    if (args.isActive !== undefined) {
      patch.isActive = args.isActive;
      patch.disabledReason = args.isActive ? undefined : "manual";
      if (args.isActive) {
        patch.consecutiveFailureCount = 0;
      }
    }

    await ctx.db.patch(endpoint._id, patch);
    return { ok: true };
  },
});

export const rotateSecrets = mutation({
  args: {
    workspaceSlug: v.string(),
    endpointId: v.id("webhookEndpoints"),
  },
  handler: async (ctx, args) => {
    const endpoint = await requireEndpointInWorkspace(ctx, args.workspaceSlug, args.endpointId);

    const { encryptionSecretBase64, signingSecretBase64 } = generateWebhookEndpointSecrets();
    const nextSecretGeneration = endpoint.secretGeneration + 1;
    await ctx.db.patch(endpoint._id, {
      encryptionSecretBase64,
      signingSecretBase64,
      secretGeneration: nextSecretGeneration,
      updatedAt: Date.now(),
    });

    return {
      encryptionSecretBase64,
      signingSecretBase64,
      secretGeneration: nextSecretGeneration,
    };
  },
});

export const revealSecrets = query({
  args: {
    workspaceSlug: v.string(),
    endpointId: v.id("webhookEndpoints"),
  },
  handler: async (ctx, args) => {
    const endpoint = await requireEndpointInWorkspace(ctx, args.workspaceSlug, args.endpointId);
    return {
      encryptionSecretBase64: endpoint.encryptionSecretBase64,
      signingSecretBase64: endpoint.signingSecretBase64,
      secretGeneration: endpoint.secretGeneration,
    };
  },
});

export const remove = mutation({
  args: {
    workspaceSlug: v.string(),
    endpointId: v.id("webhookEndpoints"),
  },
  handler: async (ctx, args) => {
    const endpoint = await requireEndpointInWorkspace(ctx, args.workspaceSlug, args.endpointId);
    await ctx.db.delete(endpoint._id);
    return { ok: true };
  },
});

export const listForWorkspace = query({
  args: {
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const resolvedScope = await requireWorkspaceHost(ctx, { workspaceSlug: args.workspaceSlug });
    const endpoints = await ctx.db
      .query("webhookEndpoints")
      .withIndex("by_workspace", (queryBuilder) =>
        queryBuilder.eq("workspaceId", resolvedScope.workspaceId),
      )
      .collect();
    return endpoints.map(buildEndpointSummary);
  },
});

export const sendTestDelivery = mutation({
  args: {
    workspaceSlug: v.string(),
    endpointId: v.id("webhookEndpoints"),
  },
  handler: async (ctx, args) => {
    const endpoint = await requireEndpointInWorkspace(ctx, args.workspaceSlug, args.endpointId);
    if (!endpoint.isActive) {
      throw new Error("Enable the endpoint before sending a test event");
    }

    const now = Date.now();
    const testPayload = {
      apiVersion: API_VERSION,
      eventType: "rsvp.created",
      occurredAt: now,
      workspaceSlug: args.workspaceSlug,
      test: true,
      data: {
        event: {
          id: "evt_test",
          shortId: "test",
          name: "Test event",
          eventDate: now + 86_400_000,
          eventEndDate: null,
          eventTimezone: "America/New_York",
          location: "Test venue",
          flyerUrl: null,
        },
        rsvp: {
          id: "rsvp_test",
          listKey: "ga",
          approvalStatus: "pending",
          attendanceStatus: "yes",
          attendees: 1,
          createdAt: now,
          updatedAt: now,
        },
        identity: {
          phone: "+15555550100",
          phoneHash: "test",
          name: "Test Guest",
          isGuest: true,
        },
        origin: { type: "app" },
      },
    };

    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      endpointId: endpoint._id,
      workspaceId: endpoint.workspaceId,
      eventType: "rsvp.created",
      payloadJson: JSON.stringify(testPayload),
      status: "pending",
      attemptCount: 0,
      occurredAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.webhookDispatch.attemptDelivery, { deliveryId });
    return { deliveryId };
  },
});
