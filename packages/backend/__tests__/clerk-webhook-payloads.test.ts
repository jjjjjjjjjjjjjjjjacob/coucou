import { describe, expect, it } from "bun:test";
import {
  extractClerkOrganizationMembershipPayload,
  extractClerkOrganizationWorkspacePayload,
  extractClerkUserWebhookProfile,
  parseClerkWebhookEvent,
} from "../convex/lib/clerkWebhookPayloads";

describe("Clerk webhook payload helpers", () => {
  it("extracts tenant workspace details from organization metadata", () => {
    const organizationPayload = extractClerkOrganizationWorkspacePayload({
      id: "org_123",
      name: "Dojo Pomodoro",
      slug: "dojo",
      public_metadata: {
        workspaceSlug: "dojo-pomodoro",
        primaryDomain: "events.dojopomodoro.club",
      },
    });

    expect(organizationPayload).toEqual({
      clerkOrganizationId: "org_123",
      name: "Dojo Pomodoro",
      clerkOrganizationSlug: "dojo",
      workspaceSlug: "dojo-pomodoro",
      primaryDomain: "events.dojopomodoro.club",
    });
  });

  it("extracts embedded organization details from membership events", () => {
    const membershipPayload = extractClerkOrganizationMembershipPayload({
      public_user_data: {
        user_id: "user_123",
      },
      role: "org:admin",
      organization: {
        id: "org_123",
        name: "Dojo Pomodoro",
        slug: "dojo-pomodoro",
      },
    });

    expect(membershipPayload).toEqual({
      clerkUserId: "user_123",
      organizationId: "org_123",
      role: "org:admin",
      organization: {
        clerkOrganizationId: "org_123",
        name: "Dojo Pomodoro",
        clerkOrganizationSlug: "dojo-pomodoro",
        workspaceSlug: "dojo-pomodoro",
        primaryDomain: undefined,
      },
    });
  });

  it("extracts primary user contact details without unsafe casts", () => {
    const userProfile = extractClerkUserWebhookProfile({
      id: "user_123",
      primary_email_address_id: "email_primary",
      email_addresses: [
        { id: "email_secondary", email_address: "old@example.com" },
        { id: "email_primary", email_address: "new@example.com" },
      ],
      primary_phone_number_id: "phone_primary",
      phone_numbers: [{ id: "phone_primary", phone_number: "+15555555555" }],
      image_url: "https://img.example/avatar.png",
    });

    expect(userProfile).toEqual({
      clerkUserId: "user_123",
      email: "new@example.com",
      phone: "+15555555555",
      imageUrl: "https://img.example/avatar.png",
    });
  });

  it("rejects webhook events without an event type", () => {
    expect(parseClerkWebhookEvent({ data: {} })).toBeNull();
  });
});
