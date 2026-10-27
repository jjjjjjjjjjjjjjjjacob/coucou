import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import { insertRsvpIntoAggregate } from "../convex/lib/rsvpAggregate";
import schema from "../convex/schema";

const convexModules = import.meta.glob("../convex/**/*.ts");

const aggregateComponentModules = {
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/_generated/api.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/btree.js"),
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js": () =>
    import("../../../node_modules/@convex-dev/aggregate/dist/esm/component/public.js"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const OTHER_WORKSPACE_SLUG = "other-workspace";
const CLERK_ORGANIZATION_ID = "org_dojo";
const OTHER_CLERK_ORGANIZATION_ID = "org_other";
const ENDPOINT_URL = "https://consumer.example.com/webhooks/coucou";
const ERASED_PHONE = "+15551230100";
const ERASED_NAME = "Erin Erased";
const ERASED_HANDLE = "erin.erased";
const CONSENT_IP_ADDRESS = "203.0.113.42";
const FIXED_NOW = Date.UTC(2026, 9, 27, 12, 0, 0);

type TestBackend = ReturnType<typeof convexTest>;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.stubEnv("DEV_TWILIO_ENABLED", "false");
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://consumer.example.com/")) {
      return new Response("", { status: 200 });
    }
    return originalFetch(input as never, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function setupTestBackend(): TestBackend {
  const testBackend = convexTest(schema, convexModules);
  testBackend.registerComponent(
    "rsvpAggregate",
    aggregateComponentSchema,
    aggregateComponentModules,
  );
  return testBackend;
}

function createHostIdentity(organizationId: string): Partial<UserIdentity> {
  return {
    subject: `host_${organizationId}`,
    org_id: organizationId,
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

async function drainScheduledFunctions(testBackend: TestBackend) {
  await testBackend.finishAllScheduledFunctions(vi.runAllTimers);
}

async function seedWorkspace(
  testBackend: TestBackend,
  slug: string,
  clerkOrganizationId: string,
): Promise<Id<"workspaces">> {
  return await testBackend.run(async (databaseContext) => {
    const workspaceId = await databaseContext.db.insert("workspaces", {
      slug,
      name: slug,
      clerkOrganizationId,
      clerkOrganizationSlug: slug,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    // Contact directory rows are maintained only once a workspace is enabled.
    await databaseContext.db.insert("contactDirectoryState", {
      workspaceId,
      status: "ready",
      phase: "messages",
      processed: 0,
      updatedAt: FIXED_NOW,
    });
    return workspaceId;
  });
}

async function seedEvent(
  testBackend: TestBackend,
  shortId: string,
  workspaceSlug = WORKSPACE_SLUG,
): Promise<Id<"events">> {
  return await testBackend.run(async (databaseContext) => {
    const eventId = await databaseContext.db.insert("events", {
      workspaceSlug,
      siteKey: "dojo",
      shortId,
      name: `Event ${shortId}`,
      location: "Main Room",
      eventDate: FIXED_NOW + 86_400_000,
      status: "active",
      lifecycle: "published",
      maxAttendees: 2,
      primaryFieldConfig: {
        socialPlatforms: [{ platformKey: "instagram", label: "Instagram" }],
      },
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    await databaseContext.db.insert("listCredentials", {
      eventId,
      listKey: "ga",
      createdAt: FIXED_NOW,
    });
    return eventId;
  });
}

async function issueApiKey(
  testBackend: TestBackend,
  options: {
    workspaceSlug?: string;
    clerkOrganizationId?: string;
    displayName?: string;
    scopes?: ("events:read" | "events:write" | "rsvps:read" | "rsvps:write")[];
  } = {},
): Promise<{ plaintextKey: string; apiClientId: Id<"apiClients"> }> {
  const hostBackend = testBackend.withIdentity(
    createHostIdentity(options.clerkOrganizationId ?? CLERK_ORGANIZATION_ID),
  );
  const created = await hostBackend.mutation(api.apiClients.create, {
    workspaceSlug: options.workspaceSlug ?? WORKSPACE_SLUG,
    displayName: options.displayName ?? "Partner key",
    scopes: options.scopes ?? ["events:read", "rsvps:read", "rsvps:write"],
    eventAccessMode: "all",
  });
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.patch(created.apiClientId, { lastUsedAt: FIXED_NOW });
  });
  return { plaintextKey: created.plaintextKey, apiClientId: created.apiClientId };
}

async function subscribeWebhookEndpoint(testBackend: TestBackend) {
  const hostBackend = testBackend.withIdentity(createHostIdentity(CLERK_ORGANIZATION_ID));
  await hostBackend.mutation(api.webhookEndpoints.create, {
    workspaceSlug: WORKSPACE_SLUG,
    url: ENDPOINT_URL,
    subscribedEventTypes: ["rsvp.created", "rsvp.deleted"],
    eventAccessMode: "all",
  });
}

function buildJsonRequest(plaintextKey: string, method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${plaintextKey}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

async function postPartnerRsvp(
  testBackend: TestBackend,
  plaintextKey: string,
  eventShortId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await testBackend.fetch(
    `/api/v1/events/${eventShortId}/rsvps`,
    buildJsonRequest(plaintextKey, "POST", { listKey: "ga", ...body }),
  );
  expect([200, 201]).toContain(response.status);
  const responseBody = (await response.json()) as { rsvp: { rsvpId: string } };
  await drainScheduledFunctions(testBackend);
  return responseBody.rsvp.rsvpId;
}

async function requestErasure(
  testBackend: TestBackend,
  plaintextKey: string,
  body: Record<string, unknown>,
) {
  const response = await testBackend.fetch(
    "/api/v1/erasures",
    buildJsonRequest(plaintextKey, "POST", body),
  );
  const responseBody = await response.json();
  await drainScheduledFunctions(testBackend);
  return { status: response.status, body: responseBody };
}

// Every table that can hold a partner-sent person, read whole so a stray copy shows up.
async function readStoredPersonState(testBackend: TestBackend) {
  return await testBackend.run(async (databaseContext) => {
    const database = databaseContext.db;
    const deliveries = await database.query("webhookDeliveries").collect();
    return {
      rsvps: (await database.query("rsvps").collect()).map((rsvp) => ({
        rsvpId: rsvp._id,
        clerkUserId: rsvp.clerkUserId,
        source: rsvp.source ?? null,
        userName: rsvp.userName ?? null,
        apiClientId: rsvp.apiClientId ?? null,
        smsConsentIpAddress: rsvp.smsConsentIpAddress ?? null,
      })),
      guestContacts: (await database.query("guestContacts").collect()).map((guestContact) => ({
        phoneHash: guestContact.phoneHash,
        phoneNumber: guestContact.phoneNumber,
      })),
      smsOrganizerPreferences: (await database.query("userSmsOrganizerPreferences").collect()).map(
        (preference) => ({
          clerkUserId: preference.clerkUserId,
          smsConsent: preference.smsConsent,
          smsConsentIpAddress: preference.smsConsentIpAddress ?? null,
        }),
      ),
      userSocialProfiles: (await database.query("userSocialProfiles").collect()).map(
        (socialProfile) => ({
          clerkUserId: socialProfile.clerkUserId,
          handle: socialProfile.handle,
        }),
      ),
      rsvpSocialProfiles: (await database.query("rsvpSocialProfiles").collect()).map(
        (socialProfile) => ({ rsvpId: socialProfile.rsvpId, handle: socialProfile.handle }),
      ),
      profileFieldValues: (await database.query("profileFieldValues").collect()).map((value) => ({
        clerkUserId: value.clerkUserId,
        value: value.value,
      })),
      profileValueGrants: (await database.query("workspaceProfileValueGrants").collect()).map(
        (grant) => ({ clerkUserId: grant.clerkUserId, fieldKey: grant.fieldKey }),
      ),
      workspaceContacts: (await database.query("workspaceContacts").collect()).map((contact) => ({
        name: contact.name,
        phoneNumber: contact.phoneNumber ?? null,
        eventCount: contact.eventCount,
      })),
      contactEvents: (await database.query("contactEvents").collect()).map((contactEvent) => ({
        rsvpId: contactEvent.rsvpId,
        eventName: contactEvent.eventName,
      })),
      contactIdentities: (await database.query("workspaceContactIdentities").collect()).map(
        (identity) => identity.clerkUserId,
      ),
      webhookDeliveries: deliveries.map((delivery) => {
        const payload = JSON.parse(delivery.payloadJson) as {
          data: { identity?: unknown; origin: unknown; changes?: unknown };
        };
        return {
          eventType: delivery.eventType,
          rsvpId: delivery.rsvpId ?? null,
          identity: payload.data.identity ?? null,
          origin: payload.data.origin,
          changes: payload.data.changes ?? null,
        };
      }),
      webhookPayloadText: deliveries.map((delivery) => delivery.payloadJson).join("\n"),
      smsOptOuts: (await database.query("smsOptOuts").collect()).map((optOut) => ({
        phoneNumber: optOut.phoneNumber,
        reason: optOut.reason ?? null,
      })),
      users: (await database.query("users").collect()).map((user) => ({
        clerkUserId: user.clerkUserId ?? null,
        phone: user.phone ?? null,
        firstName: user.firstName ?? null,
      })),
    };
  });
}

async function readAuditEntries(testBackend: TestBackend) {
  return await testBackend.run(async (databaseContext) =>
    (await databaseContext.db.query("auditLog").collect()).map((entry) => ({
      action: entry.action,
      targetKind: entry.targetKind ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    })),
  );
}

describe("POST /api/v1/erasures", () => {
  it("removes a guest's partner-sent RSVP and every copy Coucou kept because of it", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const guestClerkUserId = `guest:${phoneHash}`;
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("smsOptOuts", {
        phoneNumber: phoneHash,
        optedOutAt: FIXED_NOW,
        reason: "user_request",
      });
    });

    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
      socialProfiles: [{ platformKey: "instagram", handle: ERASED_HANDLE }],
      smsConsent: true,
      smsConsentIpAddress: CONSENT_IP_ADDRESS,
    });

    const storedBefore = await readStoredPersonState(testBackend);
    expect(storedBefore).toMatchObject({
      rsvps: [
        {
          rsvpId,
          clerkUserId: guestClerkUserId,
          source: "api",
          userName: ERASED_NAME,
          apiClientId: partner.apiClientId,
          smsConsentIpAddress: CONSENT_IP_ADDRESS,
        },
      ],
      guestContacts: [{ phoneHash, phoneNumber: ERASED_PHONE }],
      smsOrganizerPreferences: [
        {
          clerkUserId: guestClerkUserId,
          smsConsent: true,
          smsConsentIpAddress: CONSENT_IP_ADDRESS,
        },
      ],
      userSocialProfiles: [{ clerkUserId: guestClerkUserId, handle: ERASED_HANDLE }],
      rsvpSocialProfiles: [{ rsvpId, handle: ERASED_HANDLE }],
      profileFieldValues: [{ clerkUserId: guestClerkUserId, value: ERASED_HANDLE }],
      profileValueGrants: [{ clerkUserId: guestClerkUserId, fieldKey: "social.instagram" }],
      workspaceContacts: [{ name: ERASED_NAME, phoneNumber: ERASED_PHONE, eventCount: 1 }],
      contactEvents: [{ rsvpId, eventName: "Event evt-erase" }],
      contactIdentities: [guestClerkUserId],
      webhookDeliveries: [
        {
          eventType: "rsvp.created",
          rsvpId,
          identity: { phone: ERASED_PHONE, phoneHash, name: ERASED_NAME, isGuest: true },
          origin: { type: "api", apiClientId: partner.apiClientId },
          changes: null,
        },
      ],
      smsOptOuts: [{ phoneNumber: phoneHash, reason: "user_request" }],
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });
    expect(erasure).toEqual({
      status: 200,
      body: {
        erasure: {
          status: "completed",
          erasedRsvpIds: [rsvpId],
          retainedRsvpIds: [],
          completedAt: FIXED_NOW,
        },
      },
    });

    const storedAfter = await readStoredPersonState(testBackend);
    expect(storedAfter).toEqual({
      rsvps: [],
      guestContacts: [],
      smsOrganizerPreferences: [],
      userSocialProfiles: [],
      rsvpSocialProfiles: [],
      profileFieldValues: [],
      profileValueGrants: [],
      workspaceContacts: [],
      contactEvents: [],
      contactIdentities: [],
      webhookDeliveries: [
        {
          eventType: "rsvp.deleted",
          rsvpId,
          identity: { phone: null, phoneHash: null, name: null, isGuest: true },
          origin: { type: "api", apiClientId: partner.apiClientId },
          changes: { reason: "erasure" },
        },
      ],
      webhookPayloadText: expect.any(String),
      smsOptOuts: [{ phoneNumber: phoneHash, reason: "user_request" }],
      users: [],
    });
    expect(storedAfter.webhookPayloadText).not.toContain(ERASED_PHONE);
    expect(storedAfter.webhookPayloadText).not.toContain(phoneHash);
    expect(storedAfter.webhookPayloadText).not.toContain(ERASED_NAME);
    expect(storedBefore.webhookPayloadText).toContain(ERASED_PHONE);

    const eventResponse = await testBackend.fetch(
      "/api/v1/events/evt-erase",
      buildJsonRequest(partner.plaintextKey, "GET"),
    );
    expect((await eventResponse.json()).attendanceCounts).toEqual({
      approved: 0,
      pending: 0,
      denied: 0,
      total: 0,
    });
    const lookupResponse = await testBackend.fetch(
      `/api/v1/events/evt-erase/rsvps/lookup?phone=${encodeURIComponent(ERASED_PHONE)}`,
      buildJsonRequest(partner.plaintextKey, "GET"),
    );
    expect(lookupResponse.status).toBe(404);

    expect(await readAuditEntries(testBackend)).toEqual([
      {
        action: "partnerApi.erasure",
        targetKind: "apiClient",
        targetId: partner.apiClientId,
        metadata: { erasedRsvpIds: rsvpId, retainedRsvpIds: "" },
      },
    ]);
  });

  it("is idempotent: a repeat erasure changes nothing and sends no second notice", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });

    const firstErasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
      rsvpIds: [rsvpId],
    });
    expect(firstErasure.body.erasure.erasedRsvpIds).toEqual([rsvpId]);
    const storedAfterFirstErasure = await readStoredPersonState(testBackend);

    const repeatErasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
      rsvpIds: [rsvpId],
    });
    expect(repeatErasure).toEqual({
      status: 200,
      body: {
        erasure: {
          status: "completed",
          erasedRsvpIds: [],
          retainedRsvpIds: [],
          completedAt: FIXED_NOW,
        },
      },
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedAfterFirstErasure);
    expect(storedAfterFirstErasure.webhookDeliveries.map((delivery) => delivery.eventType)).toEqual(
      ["rsvp.deleted"],
    );
  });

  it("erases only the calling partner's RSVPs and keeps RSVPs given to Coucou directly", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedWorkspace(testBackend, OTHER_WORKSPACE_SLUG, OTHER_CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-alpha");
    await seedEvent(testBackend, "evt-bravo");
    const nativeEventId = await seedEvent(testBackend, "evt-native");
    const alphaPartner = await issueApiKey(testBackend, { displayName: "Alpha" });
    const bravoPartner = await issueApiKey(testBackend, { displayName: "Bravo" });
    const otherWorkspacePartner = await issueApiKey(testBackend, {
      workspaceSlug: OTHER_WORKSPACE_SLUG,
      clerkOrganizationId: OTHER_CLERK_ORGANIZATION_ID,
      displayName: "Other workspace",
    });
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const guestClerkUserId = `guest:${phoneHash}`;

    const nativeRsvpId = await testBackend.run(async (databaseContext) => {
      const insertedRsvpId = await databaseContext.db.insert("rsvps", {
        eventId: nativeEventId,
        clerkUserId: guestClerkUserId,
        source: "form",
        guestPhoneHash: phoneHash,
        listKey: "ga",
        userName: "Native Form Name",
        shareContact: true,
        status: "pending",
        approvalStatus: "pending",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      const insertedRsvp = await databaseContext.db.get(insertedRsvpId);
      if (insertedRsvp) await insertRsvpIntoAggregate(databaseContext, insertedRsvp);
      return insertedRsvpId;
    });
    const alphaRsvpId = await postPartnerRsvp(testBackend, alphaPartner.plaintextKey, "evt-alpha", {
      phone: ERASED_PHONE,
      name: "Alpha Name",
    });
    const bravoRsvpId = await postPartnerRsvp(testBackend, bravoPartner.plaintextKey, "evt-bravo", {
      phone: ERASED_PHONE,
      name: "Bravo Name",
    });
    const alphaUpdatedNativeRsvpId = await postPartnerRsvp(
      testBackend,
      alphaPartner.plaintextKey,
      "evt-native",
      { phone: ERASED_PHONE, name: "Alpha Name" },
    );
    expect(alphaUpdatedNativeRsvpId).toBe(nativeRsvpId);

    const otherWorkspaceErasure = await requestErasure(
      testBackend,
      otherWorkspacePartner.plaintextKey,
      { phone: ERASED_PHONE, rsvpIds: [alphaRsvpId, bravoRsvpId] },
    );
    expect(otherWorkspaceErasure.body.erasure).toMatchObject({
      erasedRsvpIds: [],
      retainedRsvpIds: [],
    });

    const alphaErasure = await requestErasure(testBackend, alphaPartner.plaintextKey, {
      phone: ERASED_PHONE,
      rsvpIds: [bravoRsvpId],
    });
    expect(alphaErasure.body.erasure).toMatchObject({
      erasedRsvpIds: [alphaRsvpId],
      retainedRsvpIds: [nativeRsvpId],
    });
    const storedAfterAlpha = await readStoredPersonState(testBackend);
    expect(storedAfterAlpha.rsvps).toEqual(
      [
        {
          rsvpId: bravoRsvpId,
          clerkUserId: guestClerkUserId,
          source: "api",
          userName: "Bravo Name",
          apiClientId: bravoPartner.apiClientId,
          smsConsentIpAddress: null,
        },
        {
          rsvpId: nativeRsvpId,
          clerkUserId: guestClerkUserId,
          source: "form",
          userName: "Alpha Name",
          apiClientId: alphaPartner.apiClientId,
          smsConsentIpAddress: null,
        },
      ].sort((first, second) => first.rsvpId.localeCompare(second.rsvpId)),
    );
    expect(storedAfterAlpha.guestContacts).toEqual([{ phoneHash, phoneNumber: ERASED_PHONE }]);
    expect(
      storedAfterAlpha.contactEvents.map((contactEvent) => contactEvent.rsvpId).sort(),
    ).toEqual([bravoRsvpId, nativeRsvpId].sort());
    expect(storedAfterAlpha.workspaceContacts).toHaveLength(1);
    expect(storedAfterAlpha.workspaceContacts[0]?.phoneNumber).toBe(ERASED_PHONE);

    const bravoErasure = await requestErasure(testBackend, bravoPartner.plaintextKey, {
      phone: ERASED_PHONE,
    });
    expect(bravoErasure.body.erasure).toMatchObject({
      erasedRsvpIds: [bravoRsvpId],
      retainedRsvpIds: [],
    });
    const storedAfterBravo = await readStoredPersonState(testBackend);
    expect(storedAfterBravo.rsvps.map((rsvp) => rsvp.rsvpId)).toEqual([nativeRsvpId]);
    expect(storedAfterBravo.guestContacts).toEqual([{ phoneHash, phoneNumber: ERASED_PHONE }]);
  });

  it("answers an unknown person with an empty erasure and leaves other people alone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: "+15551230999",
      name: "Someone Else",
    });
    const storedBefore = await readStoredPersonState(testBackend);

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
      rsvpIds: ["not-an-rsvp-id"],
    });

    expect(erasure).toEqual({
      status: 200,
      body: {
        erasure: {
          status: "completed",
          erasedRsvpIds: [],
          retainedRsvpIds: [],
          completedAt: FIXED_NOW,
        },
      },
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedBefore);
    expect(storedBefore.rsvps.map((rsvp) => rsvp.userName)).toEqual(["Someone Else"]);
  });

  it("erases an RSVP attached to a Coucou account and keeps the account", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_member",
        phone: ERASED_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    expect((await readStoredPersonState(testBackend)).rsvps).toMatchObject([
      { rsvpId, clerkUserId: "user_member", source: "api" },
    ]);

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });

    expect(erasure.body.erasure.erasedRsvpIds).toEqual([rsvpId]);
    const storedAfter = await readStoredPersonState(testBackend);
    expect(storedAfter.rsvps).toEqual([]);
    expect(storedAfter.contactEvents).toEqual([]);
    expect(storedAfter.workspaceContacts).toEqual([]);
    expect(storedAfter.users).toEqual([
      { clerkUserId: "user_member", phone: ERASED_PHONE, firstName: "Mia" },
    ]);
  });

  it("treats a partner-written RSVP from before source tracking as partner-sourced", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(rsvpId as Id<"rsvps">, { source: undefined });
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      rsvpIds: [rsvpId],
    });

    expect(erasure.body.erasure).toMatchObject({ erasedRsvpIds: [rsvpId], retainedRsvpIds: [] });
    expect((await readStoredPersonState(testBackend)).guestContacts).toEqual([]);
  });

  it("cancels a pending SMS that still carries the erased phone number", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    const response = await testBackend.fetch(
      "/api/v1/events/evt-erase/rsvps",
      buildJsonRequest(partner.plaintextKey, "POST", {
        phone: ERASED_PHONE,
        name: ERASED_NAME,
        listKey: "ga",
        smsConsent: true,
      }),
    );
    expect(response.status).toBe(201);

    await requestErasure(testBackend, partner.plaintextKey, { phone: ERASED_PHONE });

    const consentMessageStates = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.system.query("_scheduled_functions").collect())
        .filter(
          (scheduledFunction) =>
            scheduledFunction.name === "notifications:sendSmsConsentStatusMessage",
        )
        .map((scheduledFunction) => scheduledFunction.state.kind),
    );
    expect(consentMessageStates).toEqual(["canceled"]);
  });

  it("validates the body and requires an rsvps:write key", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const partner = await issueApiKey(testBackend);
    const readOnlyPartner = await issueApiKey(testBackend, { scopes: ["rsvps:read"] });

    const cases: Array<[string, Record<string, unknown>, number, unknown]> = [
      [
        partner.plaintextKey,
        {},
        400,
        { code: "invalid_request", message: "phone or rsvpIds is required" },
      ],
      [
        partner.plaintextKey,
        { phone: "not a phone" },
        400,
        { code: "invalid_request", field: "phone" },
      ],
      [
        partner.plaintextKey,
        { rsvpIds: "rsvp_1" },
        400,
        { code: "invalid_request", field: "rsvpIds" },
      ],
      [
        partner.plaintextKey,
        { rsvpIds: Array.from({ length: 101 }, (_, index) => `rsvp_${index}`) },
        400,
        { code: "invalid_request", field: "rsvpIds" },
      ],
      [
        readOnlyPartner.plaintextKey,
        { phone: ERASED_PHONE },
        403,
        { code: "forbidden", message: "API key is missing the required scope: rsvps:write" },
      ],
      ["coucou_sk_unknown", { phone: ERASED_PHONE }, 401, { code: "unauthorized" }],
    ];
    for (const [plaintextKey, body, expectedStatus, expectedError] of cases) {
      const response = await testBackend.fetch(
        "/api/v1/erasures",
        buildJsonRequest(plaintextKey, "POST", body),
      );
      expect(response.status).toBe(expectedStatus);
      expect((await response.json()).error).toMatchObject(expectedError as object);
    }
    expect(await readAuditEntries(testBackend)).toEqual([]);
  });
});
