import { httpAction, type ActionCtx } from "./_generated/server";
import { httpRouter } from "convex/server";
import { api, internal } from "./_generated/api";
import {
  extractClerkOrganizationMembershipPayload,
  extractClerkOrganizationWorkspacePayload,
  extractClerkUserWebhookProfile,
  parseClerkWebhookEvent,
  type ClerkOrganizationWorkspacePayload,
} from "./lib/clerkWebhookPayloads";
import { getCoucouOrganizationSlug } from "./lib/platformAuth";

async function upsertTenantWorkspaceFromOrganizationPayload(
  ctx: ActionCtx,
  organizationPayload: ClerkOrganizationWorkspacePayload,
) {
  const slug =
    organizationPayload.workspaceSlug ??
    organizationPayload.clerkOrganizationSlug;
  if (!slug) {
    return;
  }
  if (slug.trim().toLowerCase() === getCoucouOrganizationSlug()) {
    await ctx.runMutation(
      internal.workspaces.upsertCoucouAdminWorkspaceForClerkOrganization,
      {
        name: organizationPayload.name,
        clerkOrganizationId: organizationPayload.clerkOrganizationId,
        clerkOrganizationSlug: organizationPayload.clerkOrganizationSlug,
        primaryDomain: organizationPayload.primaryDomain,
      },
    );
    return;
  }

  await ctx.runMutation(
    internal.workspaces.upsertTenantWorkspaceForClerkOrganization,
    {
      slug,
      name: organizationPayload.name,
      clerkOrganizationId: organizationPayload.clerkOrganizationId,
      clerkOrganizationSlug: organizationPayload.clerkOrganizationSlug,
      primaryDomain: organizationPayload.primaryDomain,
    },
  );
}

// We verify Clerk webhooks using Svix. In local/dev without a secret, we 401.
export const clerkWebhook = httpAction(async (ctx, request) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing Svix signature headers", { status: 400 });
  }

  const payload = await request.text();

  // Dynamically import svix to avoid bundling issues if not installed yet.
  let event = null;
  try {
    const { Webhook } = await import("svix");
    const webhook = new Webhook(secret);
    event = parseClerkWebhookEvent(
      webhook.verify(payload, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }),
    );
    if (!event) {
      throw new Error("Invalid Clerk webhook event payload");
    }
  } catch (err) {
    console.error("Webhook verification failed", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const { type, data } = event;

  try {
    if (type === "user.created" || type === "user.updated") {
      const userProfile = extractClerkUserWebhookProfile(data);
      if (!userProfile) {
        return new Response("ok", { status: 200 });
      }

      await ctx.runMutation(api.users.upsertFromClerk, {
        clerkUserId: userProfile.clerkUserId,
        email: userProfile.email,
        phone: userProfile.phone,
        imageUrl: userProfile.imageUrl,
      });
    } else if (
      type === "organization.created" ||
      type === "organization.updated"
    ) {
      const organizationPayload =
        extractClerkOrganizationWorkspacePayload(data);
      if (organizationPayload) {
        await upsertTenantWorkspaceFromOrganizationPayload(
          ctx,
          organizationPayload,
        );
      }
    } else if (
      type === "organizationMembership.created" ||
      type === "organizationMembership.updated"
    ) {
      const membershipPayload =
        extractClerkOrganizationMembershipPayload(data);
      if (membershipPayload?.clerkUserId && membershipPayload.organizationId) {
        await ctx.runMutation(api.orgMemberships.upsertMembership, {
          clerkUserId: membershipPayload.clerkUserId,
          organizationId: membershipPayload.organizationId,
          role: membershipPayload.role,
        });
      }

      if (membershipPayload?.organization) {
        await upsertTenantWorkspaceFromOrganizationPayload(
          ctx,
          membershipPayload.organization,
        );
      }
    } else if (type === "organizationMembership.deleted") {
      const membershipPayload =
        extractClerkOrganizationMembershipPayload(data);
      if (membershipPayload?.clerkUserId && membershipPayload.organizationId) {
        await ctx.runMutation(api.orgMemberships.removeMembership, {
          clerkUserId: membershipPayload.clerkUserId,
          organizationId: membershipPayload.organizationId,
        });
      }
    } else {
      // Ignore unrelated events
    }
  } catch (err) {
    console.error("Error handling Clerk webhook", type, err);
    return new Response("Error handling webhook", { status: 500 });
  }

  return new Response("ok", { status: 200 });
});

const http = httpRouter();
http.route({ path: "/webhooks/clerk", method: "POST", handler: clerkWebhook });
export default http;
