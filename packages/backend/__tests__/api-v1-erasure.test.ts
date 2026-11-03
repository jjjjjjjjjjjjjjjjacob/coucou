import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { deleteUserData } from "../convex/lib/deleteUserData";
import { issueListAccess } from "../convex/lib/listAccess";
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
    subscribedEventTypes: ["rsvp.created", "rsvp.updated", "rsvp.attendance_updated"],
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

const MEMBER_CLERK_USER_ID = "user_member";
const MEMBER_PHONE = "+15551230200";

// A partner RSVP for a Coucou member and one for a guest phone on the same
// event; the member then verifies the guest phone, which merges the guest RSVP
// into the member's and retires the guest RSVP id.
async function mergeGuestRsvpIntoMemberRsvp(
  testBackend: TestBackend,
  partnerKeys: { memberPartnerKey: string; guestPartnerKey: string },
  beforeMerge?: () => Promise<void>,
): Promise<{ canonicalRsvpId: string; retiredRsvpId: string }> {
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.insert("users", {
      clerkUserId: MEMBER_CLERK_USER_ID,
      phone: MEMBER_PHONE,
      firstName: "Mia",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  });
  const canonicalRsvpId = await postPartnerRsvp(
    testBackend,
    partnerKeys.memberPartnerKey,
    "evt-erase",
    { phone: MEMBER_PHONE, name: "Mia Member" },
  );
  const retiredRsvpId = await postPartnerRsvp(
    testBackend,
    partnerKeys.guestPartnerKey,
    "evt-erase",
    { phone: ERASED_PHONE, name: ERASED_NAME },
  );
  await beforeMerge?.();
  await testBackend.mutation(internal.rsvps.claimGuestRsvpsForClerkPhoneInternal, {
    clerkUserId: MEMBER_CLERK_USER_ID,
    phone: ERASED_PHONE,
  });
  await drainScheduledFunctions(testBackend);
  expect((await readStoredPersonState(testBackend)).rsvps.map((rsvp) => rsvp.rsvpId)).toEqual([
    canonicalRsvpId,
  ]);
  return { canonicalRsvpId, retiredRsvpId };
}

const PERSON_NOTE = "Typed on the Coucou form";

async function issueGaListAccessToken(testBackend: TestBackend, eventId: Id<"events">) {
  return await testBackend.run(async (databaseContext) => {
    const listCredential = await databaseContext.db
      .query("listCredentials")
      .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
      .first();
    if (!listCredential) throw new Error("Expected a list credential");
    const access = await issueListAccess(databaseContext, listCredential, "no-password");
    if (!access.ok) throw new Error("Expected a list access grant");
    return access.accessToken;
  });
}

// The person fills in Coucou's public guest form for an event, with a note and SMS consent.
async function submitCoucouGuestForm(
  testBackend: TestBackend,
  eventId: Id<"events">,
  submission: { phone?: string; lastName?: string; note?: string } = {},
) {
  const accessToken = await issueGaListAccessToken(testBackend, eventId);
  await testBackend.mutation(api.rsvps.submitGuestRequest, {
    eventId,
    siteKey: "dojo",
    listKey: "ga",
    accessToken,
    firstName: "Erin",
    lastName: submission.lastName ?? "Typed",
    phone: submission.phone ?? ERASED_PHONE,
    shareContact: true,
    attendees: 1,
    note: submission.note ?? PERSON_NOTE,
    smsConsent: true,
    smsConsentIpAddress: CONSENT_IP_ADDRESS,
    customFields: {},
    socialProfiles: [],
  });
  await drainScheduledFunctions(testBackend);
}

async function readRsvpRecord(testBackend: TestBackend, rsvpId: string) {
  return await testBackend.run(async (databaseContext) => {
    const rsvp = await databaseContext.db.get(rsvpId as Id<"rsvps">);
    return rsvp
      ? {
          source: rsvp.source ?? null,
          listKey: rsvp.listKey,
          createdByApiClientId: rsvp.createdByApiClientId ?? null,
          personSubmittedAt: rsvp.personSubmittedAt ?? null,
          note: rsvp.note ?? null,
          userName: rsvp.userName ?? null,
          smsConsentIpAddress: rsvp.smsConsentIpAddress ?? null,
        }
      : null;
  });
}

// The whole stored row, so a field that should be gone cannot hide.
async function readStoredRsvpDocument(testBackend: TestBackend, rsvpId: string) {
  return await testBackend.run(async (databaseContext) => {
    const rsvp = await databaseContext.db.get(rsvpId as Id<"rsvps">);
    if (!rsvp) return null;
    const { _creationTime, ...storedFields } = rsvp;
    return storedFields;
  });
}

async function readAttendanceCounts(testBackend: TestBackend, plaintextKey: string) {
  const eventResponse = await testBackend.fetch(
    "/api/v1/events/evt-erase",
    buildJsonRequest(plaintextKey, "GET"),
  );
  return (await eventResponse.json()).attendanceCounts;
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

const PLATFORM_ORGANIZATION_ID = "org_coucou";

function createPlatformStaffIdentity(): Partial<UserIdentity> {
  return {
    subject: "platform_staff",
    org_id: PLATFORM_ORGANIZATION_ID,
    org_slug: "coucou",
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

// Ticket counts as the host reads them: the dashboard, the CSV export filters and
// the door's ticket list.
async function readHostTicketCounts(testBackend: TestBackend, eventIds: Id<"events">[]) {
  const hostBackend = testBackend.withIdentity(createHostIdentity(CLERK_ORGANIZATION_ID));
  const dashboard = await hostBackend.query(api.dashboard.getDashboardStats, {
    workspaceSlug: WORKSPACE_SLUG,
  });
  const exportCounts = { issued: 0, disabled: 0, redeemed: 0 };
  const doorCounts = { issued: 0, disabled: 0, redeemed: 0 };
  for (const eventId of eventIds) {
    for (const ticketStatus of ["issued", "disabled", "redeemed"] as const) {
      const exported = await testBackend.query(internal.exportsQueries.getRsvpsForExportInternal, {
        eventId,
        workspaceSlug: WORKSPACE_SLUG,
        ticketStatusFilters: [ticketStatus],
      });
      exportCounts[ticketStatus] += exported.rsvps.length;
    }
    const doorTickets = await hostBackend.query(api.redemptions.listForEvent, {
      eventId,
      workspaceSlug: WORKSPACE_SLUG,
    });
    for (const ticket of doorTickets) {
      doorCounts[ticket.disabledAt ? "disabled" : ticket.redeemedAt ? "redeemed" : "issued"] += 1;
    }
  }
  return {
    dashboard: {
      totalRsvps: dashboard.totalRsvps,
      approvedRsvps: dashboard.approvedRsvps,
      issuedTickets: dashboard.issuedTickets,
      redeemedTickets: dashboard.redeemedTickets,
    },
    exportCounts,
    doorCounts,
  };
}

// RSVPs inserted straight into the table, one per new event, for the tests
// that need more RSVPs than one transaction anonymizes.
async function insertRsvpsOnNewEvents(
  testBackend: TestBackend,
  count: number,
  fields: { clerkUserId: string; guestPhoneHash?: string; apiClientId?: Id<"apiClients"> },
): Promise<Id<"rsvps">[]> {
  return await testBackend.run(async (databaseContext) => {
    const rsvpIds: Id<"rsvps">[] = [];
    for (let index = 0; index < count; index += 1) {
      const eventId = await databaseContext.db.insert("events", {
        workspaceSlug: WORKSPACE_SLUG,
        siteKey: "dojo",
        shortId: `evt-bulk-${index}`,
        name: `Bulk ${index}`,
        location: "Main Room",
        eventDate: FIXED_NOW + 86_400_000,
        status: "active",
        lifecycle: "published",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      rsvpIds.push(
        await databaseContext.db.insert("rsvps", {
          eventId,
          clerkUserId: fields.clerkUserId,
          guestPhoneHash: fields.guestPhoneHash,
          userName: ERASED_NAME,
          listKey: "ga",
          shareContact: true,
          status: "pending",
          approvalStatus: "pending",
          ...(fields.apiClientId
            ? {
                source: "api" as const,
                apiClientId: fields.apiClientId,
                createdByApiClientId: fields.apiClientId,
              }
            : { source: "form" as const }),
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
        }),
      );
    }
    return rsvpIds;
  });
}

async function countAnonymizedRsvps(testBackend: TestBackend, rsvpIds: Id<"rsvps">[]) {
  return await testBackend.run(async (databaseContext) => {
    let anonymizedCount = 0;
    for (const rsvpId of rsvpIds) {
      const rsvp = await databaseContext.db.get(rsvpId);
      if (rsvp?.anonymizedAt !== undefined && rsvp.userName === undefined) anonymizedCount += 1;
    }
    return anonymizedCount;
  });
}

// Wraps ctx.db so every query counts the documents it returns, per table.
function countDocumentsRead(ctx: MutationCtx, documentsReadByTable: Map<string, number>) {
  const record = (table: string, documentCount: number) =>
    documentsReadByTable.set(table, (documentsReadByTable.get(table) ?? 0) + documentCount);
  const wrapQuery = (table: string, query: object): object =>
    new Proxy(query, {
      get(target, property) {
        const value = Reflect.get(target, property);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          const result = value.apply(target, args);
          if (property === "collect" || property === "take") {
            return (result as Promise<unknown[]>).then((documents) => {
              record(table, documents.length);
              return documents;
            });
          }
          if (property === "first" || property === "unique") {
            return (result as Promise<unknown>).then((document) => {
              record(table, document ? 1 : 0);
              return document;
            });
          }
          return result && typeof result === "object" && !("then" in result)
            ? wrapQuery(table, result)
            : result;
        };
      },
    });
  const db = new Proxy(ctx.db, {
    get(target, property) {
      if (property === "query") {
        return (table: string) => wrapQuery(table, target.query(table as never));
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { ...ctx, db } as MutationCtx;
}

// One SMS recipient row per text blast; each lists one of the person's RSVPs
// and an RSVP of someone else on the same event.
async function insertSmsRecipientRows(
  testBackend: TestBackend,
  phoneHash: string,
  personRsvpIds: Id<"rsvps">[],
  otherRsvpId: Id<"rsvps">,
  rowCount: number,
) {
  await testBackend.run(async (databaseContext) => {
    for (let index = 0; index < rowCount; index += 1) {
      const textBlastId = await databaseContext.db.insert("textBlasts", {
        name: `Reminder ${index}`,
        message: "See you there",
        targetLists: ["ga"],
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        sentBy: `host_${CLERK_ORGANIZATION_ID}`,
        status: "sent",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      await databaseContext.db.insert("textBlastRecipients", {
        textBlastId,
        phoneHash,
        status: "sent",
        sourceEventIds: [],
        sourceRsvpIds: [personRsvpIds[index % personRsvpIds.length], otherRsvpId],
        sourceListKeys: ["ga"],
        recipientClerkUserIds: [],
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    }
  });
}

async function readSmsRecipientState(testBackend: TestBackend, otherRsvpId: Id<"rsvps">) {
  return await testBackend.run(async (databaseContext) => {
    const recipients = await databaseContext.db.query("textBlastRecipients").collect();
    return {
      rowsListingThePerson: recipients.filter((recipient) =>
        recipient.sourceRsvpIds.some((rsvpId) => rsvpId !== otherRsvpId),
      ).length,
      rowsListingTheOtherRsvp: recipients.filter((recipient) =>
        recipient.sourceRsvpIds.includes(otherRsvpId),
      ).length,
    };
  });
}

async function readAnonymizationBatches(testBackend: TestBackend) {
  return await testBackend.run(async (databaseContext) => ({
    batches: (await databaseContext.db.query("rsvpAnonymizationBatches").collect()).map(
      ({ _id, _creationTime, createdAt, ...batch }) => ({ batchId: _id, ...batch }),
    ),
    pendingRsvpIds: (await databaseContext.db.query("pendingRsvpAnonymizations").collect()).map(
      (pending) => pending.rsvpId,
    ),
  }));
}

const RETIRED_MEMBER_CLERK_USER_ID = "user_member_retired";

// The member's account absorbed an older account; audit entries about the
// member's partner RSVP name the older account and a staff member as actors.
async function seedMemberWithRetiredAccountAuditEntries(testBackend: TestBackend) {
  const partner = await issueApiKey(testBackend);
  await testBackend.run(async (databaseContext) => {
    const userId = await databaseContext.db.insert("users", {
      clerkUserId: MEMBER_CLERK_USER_ID,
      phone: MEMBER_PHONE,
      firstName: "Mia",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    await databaseContext.db.insert("userIdentityAliases", {
      aliasClerkUserId: RETIRED_MEMBER_CLERK_USER_ID,
      canonicalClerkUserId: MEMBER_CLERK_USER_ID,
      canonicalUserId: userId,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  });
  const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
    phone: MEMBER_PHONE,
    name: "Mia Member",
  });
  await testBackend.run(async (databaseContext) => {
    for (const actorClerkUserId of [RETIRED_MEMBER_CLERK_USER_ID, "platform_staff"]) {
      await databaseContext.db.insert("auditLog", {
        at: FIXED_NOW,
        actorClerkUserId,
        actorEmail: `${actorClerkUserId}@example.com`,
        action: "rsvp.text_association_repaired",
        targetKind: "rsvp",
        targetId: rsvpId,
        metadata: { evidenceId: "evidence" },
      });
    }
  });
  return { partner, rsvpId };
}

async function readRsvpAuditActors(testBackend: TestBackend, rsvpId: string) {
  return await testBackend.run(async (databaseContext) =>
    (await databaseContext.db.query("auditLog").collect())
      .filter((entry) => entry.targetId === rsvpId)
      .map((entry) => ({
        actorClerkUserId: entry.actorClerkUserId ?? null,
        actorEmail: entry.actorEmail ?? null,
        metadata: entry.metadata ?? null,
      })),
  );
}

// The tickets the partner's GET /events/{id}/rsvps shows, for both ticket test events.
async function readPartnerTickets(testBackend: TestBackend, plaintextKey: string) {
  const tickets: Array<{ rsvpId: string; ticketStatus: string | null; hasCode: boolean }> = [];
  for (const eventShortId of ["evt-erase", "evt-ticketed"]) {
    const response = await testBackend.fetch(
      `/api/v1/events/${eventShortId}/rsvps`,
      buildJsonRequest(plaintextKey, "GET"),
    );
    const body = (await response.json()) as {
      data: Array<{ rsvpId: string; ticket: { status: string; redemptionCode: string } | null }>;
    };
    for (const rsvp of body.data) {
      tickets.push({
        rsvpId: rsvp.rsvpId,
        ticketStatus: rsvp.ticket?.status ?? null,
        hasCode: typeof rsvp.ticket?.redemptionCode === "string",
      });
    }
  }
  return tickets;
}

describe("POST /api/v1/erasures", () => {
  it("anonymizes a guest's partner-sent RSVP and removes every copy Coucou kept of the person", async () => {
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
    const rsvpBefore = await readStoredRsvpDocument(testBackend, rsvpId);
    const countsBefore = await readAttendanceCounts(testBackend, partner.plaintextKey);
    expect(countsBefore).toEqual({ approved: 0, pending: 1, denied: 0, total: 1 });
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
          anonymizedRsvpIds: [rsvpId],
          retainedRsvpIds: [],
          completedAt: FIXED_NOW,
        },
      },
    });

    const anonymizedClerkUserId = `guest:anonymized-${rsvpId}`;
    expect(await readStoredRsvpDocument(testBackend, rsvpId)).toEqual({
      _id: rsvpId,
      eventId: rsvpBefore?.eventId,
      clerkUserId: anonymizedClerkUserId,
      source: "api",
      listKey: "ga",
      ticketStatus: "not-issued",
      shareContact: false,
      attendees: 1,
      status: "pending",
      approvalStatus: "pending",
      attendanceStatus: "yes",
      apiClientId: partner.apiClientId,
      createdByApiClientId: partner.apiClientId,
      webhookOriginApiClientId: partner.apiClientId,
      webhookOriginMutationId: expect.any(String),
      anonymizedAt: FIXED_NOW,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
    expect(rsvpBefore).toMatchObject({
      clerkUserId: guestClerkUserId,
      userName: ERASED_NAME,
      guestPhoneHash: phoneHash,
      guestPhoneObfuscated: expect.any(String),
      shareContact: true,
      smsConsent: true,
      smsConsentTimestamp: FIXED_NOW,
      smsConsentIpAddress: CONSENT_IP_ADDRESS,
    });
    const storedAfter = await readStoredPersonState(testBackend);
    expect(storedAfter).toEqual({
      rsvps: [
        {
          rsvpId,
          clerkUserId: anonymizedClerkUserId,
          source: "api",
          userName: null,
          apiClientId: partner.apiClientId,
          smsConsentIpAddress: null,
        },
      ],
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
          eventType: "rsvp.updated",
          rsvpId,
          identity: { phone: null, phoneHash: null, name: null, isGuest: true },
          origin: { type: "api", apiClientId: partner.apiClientId },
          changes: {
            previousApprovalStatus: "pending",
            previousAttendanceStatus: "yes",
            reason: "erasure",
          },
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

    expect(await readAttendanceCounts(testBackend, partner.plaintextKey)).toEqual(countsBefore);
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
        metadata: { anonymizedRsvpIds: rsvpId, retainedRsvpIds: "" },
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
    expect(firstErasure.body.erasure.anonymizedRsvpIds).toEqual([rsvpId]);
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
          anonymizedRsvpIds: [],
          retainedRsvpIds: [],
          completedAt: FIXED_NOW,
        },
      },
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedAfterFirstErasure);
    expect(storedAfterFirstErasure.webhookDeliveries).toEqual([
      {
        eventType: "rsvp.updated",
        rsvpId,
        identity: { phone: null, phoneHash: null, name: null, isGuest: true },
        origin: { type: "api", apiClientId: partner.apiClientId },
        changes: {
          previousApprovalStatus: "pending",
          previousAttendanceStatus: "yes",
          reason: "erasure",
        },
      },
    ]);
  });

  it("anonymizes only the calling partner's RSVPs and keeps RSVPs given to Coucou directly", async () => {
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
      anonymizedRsvpIds: [],
      retainedRsvpIds: [],
    });

    const alphaErasure = await requestErasure(testBackend, alphaPartner.plaintextKey, {
      phone: ERASED_PHONE,
      rsvpIds: [bravoRsvpId],
    });
    expect(alphaErasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [alphaRsvpId],
      retainedRsvpIds: [nativeRsvpId],
    });
    const storedAfterAlpha = await readStoredPersonState(testBackend);
    expect(storedAfterAlpha.rsvps).toEqual(
      [
        {
          rsvpId: alphaRsvpId,
          clerkUserId: `guest:anonymized-${alphaRsvpId}`,
          source: "api",
          userName: null,
          apiClientId: alphaPartner.apiClientId,
          smsConsentIpAddress: null,
        },
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
      anonymizedRsvpIds: [bravoRsvpId],
      retainedRsvpIds: [],
    });
    const storedAfterBravo = await readStoredPersonState(testBackend);
    expect(storedAfterBravo.rsvps.map((rsvp) => [rsvp.rsvpId, rsvp.clerkUserId])).toEqual(
      [
        [alphaRsvpId, `guest:anonymized-${alphaRsvpId}`],
        [bravoRsvpId, `guest:anonymized-${bravoRsvpId}`],
        [nativeRsvpId, guestClerkUserId],
      ].sort((first, second) => first[0].localeCompare(second[0])),
    );
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
          anonymizedRsvpIds: [],
          retainedRsvpIds: [],
          completedAt: FIXED_NOW,
        },
      },
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedBefore);
    expect(storedBefore.rsvps.map((rsvp) => rsvp.userName)).toEqual(["Someone Else"]);
  });

  it("anonymizes an RSVP attached to a Coucou account and keeps the account", async () => {
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

    expect(erasure.body.erasure.anonymizedRsvpIds).toEqual([rsvpId]);
    const storedAfter = await readStoredPersonState(testBackend);
    expect(storedAfter.rsvps).toEqual([
      {
        rsvpId,
        clerkUserId: `anonymized-${rsvpId}`,
        source: "api",
        userName: null,
        apiClientId: partner.apiClientId,
        smsConsentIpAddress: null,
      },
    ]);
    expect(storedAfter.contactEvents).toEqual([]);
    expect(storedAfter.workspaceContacts).toEqual([]);
    expect(storedAfter.users).toEqual([
      { clerkUserId: "user_member", phone: ERASED_PHONE, firstName: "Mia" },
    ]);
  });

  it("lets only the inserting key anonymize an RSVP another key updated", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const insertingPartner = await issueApiKey(testBackend, { displayName: "Inserting" });
    const updatingPartner = await issueApiKey(testBackend, { displayName: "Updating" });
    const rsvpId = await postPartnerRsvp(testBackend, insertingPartner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    const attendanceResponse = await testBackend.fetch(
      `/api/v1/rsvps/${rsvpId}`,
      buildJsonRequest(updatingPartner.plaintextKey, "PATCH", { attendanceStatus: "maybe" }),
    );
    expect(attendanceResponse.status).toBe(200);
    await drainScheduledFunctions(testBackend);
    expect((await readStoredPersonState(testBackend)).rsvps).toMatchObject([
      { rsvpId, apiClientId: updatingPartner.apiClientId },
    ]);

    const updatingErasure = await requestErasure(testBackend, updatingPartner.plaintextKey, {
      phone: ERASED_PHONE,
      rsvpIds: [rsvpId],
    });
    expect(updatingErasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [rsvpId],
    });

    const insertingErasure = await requestErasure(testBackend, insertingPartner.plaintextKey, {
      phone: ERASED_PHONE,
    });
    expect(insertingErasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [rsvpId],
      retainedRsvpIds: [],
    });
    expect((await readStoredPersonState(testBackend)).rsvps).toEqual([
      {
        rsvpId,
        clerkUserId: `guest:anonymized-${rsvpId}`,
        source: "api",
        userName: null,
        apiClientId: updatingPartner.apiClientId,
        smsConsentIpAddress: null,
      },
    ]);
  });

  it("anonymizes a pre-attribution RSVP whose rsvp.created notice names the calling key", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(rsvpId as Id<"rsvps">, {
        source: undefined,
        createdByApiClientId: undefined,
      });
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      rsvpIds: [rsvpId],
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [rsvpId],
      retainedRsvpIds: [],
    });
    expect((await readStoredPersonState(testBackend)).guestContacts).toEqual([]);
  });

  it("keeps a pre-attribution RSVP when no rsvp.created notice names the calling key", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(rsvpId as Id<"rsvps">, {
        source: undefined,
        createdByApiClientId: undefined,
      });
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      rsvpIds: [rsvpId],
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [rsvpId],
    });
    expect((await readStoredPersonState(testBackend)).rsvps).toMatchObject([
      { rsvpId, userName: ERASED_NAME },
    ]);
  });

  it("keeps a pre-source-tracking form RSVP that a partner later updated", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-legacy");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const legacyFormRsvpId = await testBackend.run(async (databaseContext) => {
      const insertedRsvpId = await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: `guest:${phoneHash}`,
        guestPhoneHash: phoneHash,
        listKey: "ga",
        userName: "Typed On Coucou Form",
        shareContact: true,
        status: "pending",
        approvalStatus: "pending",
        createdAt: FIXED_NOW - 60 * 86_400_000,
        updatedAt: FIXED_NOW - 60 * 86_400_000,
      });
      const insertedRsvp = await databaseContext.db.get(insertedRsvpId);
      if (insertedRsvp) await insertRsvpIntoAggregate(databaseContext, insertedRsvp);
      return insertedRsvpId;
    });
    const updatedRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-legacy", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    expect(updatedRsvpId).toBe(legacyFormRsvpId);
    const storedBefore = await readStoredPersonState(testBackend);
    expect(storedBefore.rsvps).toMatchObject([
      { rsvpId: legacyFormRsvpId, source: null, apiClientId: partner.apiClientId },
    ]);

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [legacyFormRsvpId],
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedBefore);
  });

  it("anonymizes the merged RSVP when a request names an id an identity merge retired", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const merged = await mergeGuestRsvpIntoMemberRsvp(testBackend, {
      memberPartnerKey: partner.plaintextKey,
      guestPartnerKey: partner.plaintextKey,
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      rsvpIds: [merged.retiredRsvpId],
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [merged.canonicalRsvpId],
      retainedRsvpIds: [],
    });
    const storedAfter = await readStoredPersonState(testBackend);
    expect(storedAfter.rsvps).toMatchObject([
      {
        rsvpId: merged.canonicalRsvpId,
        clerkUserId: `anonymized-${merged.canonicalRsvpId}`,
        userName: null,
      },
    ]);
    // The retired row's own rsvp.created notice held the guest phone and name.
    expect(
      storedAfter.webhookDeliveries.map((delivery) => [delivery.rsvpId, delivery.eventType]),
    ).toEqual([[merged.canonicalRsvpId, "rsvp.updated"]]);
    expect(storedAfter.webhookPayloadText).not.toContain(ERASED_PHONE);
    expect(storedAfter.webhookPayloadText).not.toContain(ERASED_NAME);
  });

  it("keeps a pre-attribution RSVP that absorbed another RSVP in a merge", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const merged = await mergeGuestRsvpIntoMemberRsvp(testBackend, {
      memberPartnerKey: partner.plaintextKey,
      guestPartnerKey: partner.plaintextKey,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(merged.canonicalRsvpId as Id<"rsvps">, {
        source: undefined,
        createdByApiClientId: undefined,
      });
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      rsvpIds: [merged.canonicalRsvpId],
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [merged.canonicalRsvpId],
    });
  });

  it("keeps a merged RSVP whose two rows came from different keys", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const memberPartner = await issueApiKey(testBackend, { displayName: "Member" });
    const guestPartner = await issueApiKey(testBackend, { displayName: "Guest" });
    const merged = await mergeGuestRsvpIntoMemberRsvp(testBackend, {
      memberPartnerKey: memberPartner.plaintextKey,
      guestPartnerKey: guestPartner.plaintextKey,
    });

    const memberErasure = await requestErasure(testBackend, memberPartner.plaintextKey, {
      rsvpIds: [merged.canonicalRsvpId],
    });
    const guestErasure = await requestErasure(testBackend, guestPartner.plaintextKey, {
      rsvpIds: [merged.retiredRsvpId],
    });

    expect(memberErasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [merged.canonicalRsvpId],
    });
    expect(guestErasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [merged.canonicalRsvpId],
    });
    expect((await readStoredPersonState(testBackend)).rsvps).toMatchObject([
      { rsvpId: merged.canonicalRsvpId, clerkUserId: MEMBER_CLERK_USER_ID },
    ]);
  });

  it("keeps a partner RSVP the person then submitted on Coucou's guest form", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    await submitCoucouGuestForm(testBackend, eventId);
    const storedBefore = await readStoredPersonState(testBackend);
    expect(await readRsvpRecord(testBackend, rsvpId)).toEqual({
      source: "api",
      listKey: "ga",
      createdByApiClientId: partner.apiClientId,
      personSubmittedAt: FIXED_NOW,
      note: PERSON_NOTE,
      userName: "Erin Typed",
      smsConsentIpAddress: CONSENT_IP_ADDRESS,
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [rsvpId],
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedBefore);
    expect(await readRsvpRecord(testBackend, rsvpId)).toMatchObject({ note: PERSON_NOTE });
  });

  it.each([
    { partnerListKey: "ga", textOutcome: "existing" },
    { partnerListKey: "vip", textOutcome: "submitted" },
  ])("keeps a partner RSVP on list $partnerListKey that the person then texted the ga code for", async ({
    partnerListKey,
    textOutcome,
  }) => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    await testBackend.run(async (databaseContext) => {
      const listCredential = await databaseContext.db
        .query("listCredentials")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
        .first();
      if (!listCredential) throw new Error("Expected a list credential");
      await databaseContext.db.patch(listCredential._id, {
        password: "ERASECODE",
        passwordNormalized: "erasecode",
      });
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "vip",
        createdAt: FIXED_NOW,
      });
    });
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
      listKey: partnerListKey,
    });
    await testBackend.mutation(internal.smsCodeRouter.beginInboundReceipt, {
      providerMessageId: "SM_partner_row",
      fromPhoneNumber: ERASED_PHONE,
      toPhoneNumber: "+18449054257",
      body: "ERASECODE",
    });
    const textResult = await testBackend.mutation(internal.smsCodeRouter.processReservedInbound, {
      providerMessageId: "SM_partner_row",
      fromPhoneNumber: ERASED_PHONE,
      messageBody: "ERASECODE",
    });
    await drainScheduledFunctions(testBackend);
    expect(textResult.outcome).toBe(textOutcome);
    const storedBefore = await readStoredPersonState(testBackend);
    expect(await readRsvpRecord(testBackend, rsvpId)).toMatchObject({
      source: "api",
      listKey: "ga",
      createdByApiClientId: partner.apiClientId,
      personSubmittedAt: FIXED_NOW,
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [rsvpId],
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedBefore);
  });

  it("keeps a partner RSVP the member then resubmitted while signed in to Coucou", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: MEMBER_PHONE,
      name: "Mia Member",
    });
    await testBackend
      .withIdentity({ subject: MEMBER_CLERK_USER_ID })
      .mutation(api.rsvps.submitRequest, {
        eventId,
        siteKey: "dojo",
        listKey: "ga",
        firstName: "Mia",
        lastName: "Member",
        shareContact: true,
        attendees: 1,
        note: PERSON_NOTE,
        smsConsent: true,
        smsConsentIpAddress: CONSENT_IP_ADDRESS,
        customFields: {},
        socialProfiles: [],
      });
    await drainScheduledFunctions(testBackend);
    const storedBefore = await readStoredPersonState(testBackend);
    expect(await readRsvpRecord(testBackend, rsvpId)).toMatchObject({
      source: "api",
      createdByApiClientId: partner.apiClientId,
      personSubmittedAt: FIXED_NOW,
      note: PERSON_NOTE,
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: MEMBER_PHONE,
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [rsvpId],
    });
    expect(await readStoredPersonState(testBackend)).toEqual(storedBefore);
  });

  it("keeps a merged RSVP when the person had submitted the absorbed row on Coucou", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    const merged = await mergeGuestRsvpIntoMemberRsvp(
      testBackend,
      { memberPartnerKey: partner.plaintextKey, guestPartnerKey: partner.plaintextKey },
      async () => await submitCoucouGuestForm(testBackend, eventId),
    );
    expect(await readRsvpRecord(testBackend, merged.canonicalRsvpId)).toMatchObject({
      createdByApiClientId: partner.apiClientId,
      personSubmittedAt: FIXED_NOW,
      note: PERSON_NOTE,
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      rsvpIds: [merged.retiredRsvpId],
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [],
      retainedRsvpIds: [merged.canonicalRsvpId],
    });
    expect((await readStoredPersonState(testBackend)).rsvps).toMatchObject([
      { rsvpId: merged.canonicalRsvpId, clerkUserId: MEMBER_CLERK_USER_ID },
    ]);
  });

  it("keeps an anonymized RSVP's approval, party size, check-in and ticket status, and shows partners no ticket", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const checkedInEventId = await seedEvent(testBackend, "evt-erase");
    const ticketedEventId = await seedEvent(testBackend, "evt-ticketed");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const host = testBackend.withIdentity(createHostIdentity(CLERK_ORGANIZATION_ID));
    const checkedInRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
      attendees: 2,
    });
    const ticketedRsvpId = await postPartnerRsvp(
      testBackend,
      partner.plaintextKey,
      "evt-ticketed",
      { phone: ERASED_PHONE, name: ERASED_NAME },
    );
    const checkedInApproval = await host.mutation(api.approvals.applyApproval, {
      rsvpId: checkedInRsvpId as Id<"rsvps">,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const ticketedApproval = await host.mutation(api.approvals.applyApproval, {
      rsvpId: ticketedRsvpId as Id<"rsvps">,
      workspaceSlug: WORKSPACE_SLUG,
    });
    await host.mutation(api.redemptions.redeem, {
      code: checkedInApproval.code,
      workspaceSlug: WORKSPACE_SLUG,
    });
    await drainScheduledFunctions(testBackend);
    const countsBefore = await readAttendanceCounts(testBackend, partner.plaintextKey);
    expect(countsBefore).toEqual({ approved: 1, pending: 0, denied: 0, total: 1 });
    expect(await readPartnerTickets(testBackend, partner.plaintextKey)).toEqual([
      { rsvpId: checkedInRsvpId, ticketStatus: "redeemed", hasCode: true },
      { rsvpId: ticketedRsvpId, ticketStatus: "issued", hasCode: true },
    ]);

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });

    expect(erasure.body.erasure).toMatchObject({
      anonymizedRsvpIds: [checkedInRsvpId, ticketedRsvpId].sort(),
      retainedRsvpIds: [],
    });
    const checkedInClerkUserId = `guest:anonymized-${checkedInRsvpId}`;
    const ticketedClerkUserId = `guest:anonymized-${ticketedRsvpId}`;
    expect(await readStoredRsvpDocument(testBackend, checkedInRsvpId)).toMatchObject({
      clerkUserId: checkedInClerkUserId,
      listKey: "ga",
      attendees: 2,
      status: "approved",
      approvalStatus: "approved",
      ticketStatus: "redeemed",
      anonymizedAt: FIXED_NOW,
    });
    expect(await readStoredRsvpDocument(testBackend, ticketedRsvpId)).toMatchObject({
      clerkUserId: ticketedClerkUserId,
      status: "approved",
      approvalStatus: "approved",
      ticketStatus: "issued",
    });
    const ticketsAfter = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.query("redemptions").collect()).map((redemption) => ({
        eventId: redemption.eventId,
        clerkUserId: redemption.clerkUserId,
        codeChanged:
          redemption.code !== checkedInApproval.code && redemption.code !== ticketedApproval.code,
        redeemedAt: redemption.redeemedAt ?? null,
        redeemedByClerkUserId: redemption.redeemedByClerkUserId ?? null,
        disabledAt: redemption.disabledAt ?? null,
      })),
    );
    expect(ticketsAfter).toEqual([
      {
        eventId: checkedInEventId,
        clerkUserId: checkedInClerkUserId,
        codeChanged: true,
        redeemedAt: FIXED_NOW,
        redeemedByClerkUserId: `host_${CLERK_ORGANIZATION_ID}`,
        disabledAt: null,
      },
      {
        eventId: ticketedEventId,
        clerkUserId: ticketedClerkUserId,
        codeChanged: true,
        redeemedAt: null,
        redeemedByClerkUserId: null,
        disabledAt: null,
      },
    ]);
    expect(await readPartnerTickets(testBackend, partner.plaintextKey)).toEqual([
      { rsvpId: checkedInRsvpId, ticketStatus: null, hasCode: false },
      { rsvpId: ticketedRsvpId, ticketStatus: null, hasCode: false },
    ]);
    for (const deliveredCode of [checkedInApproval.code, ticketedApproval.code]) {
      expect(
        await testBackend.query(api.redemptions.byCode, {
          code: deliveredCode,
          workspaceSlug: WORKSPACE_SLUG,
        }),
      ).toEqual({ status: "invalid" });
    }
    const approvalsAfter = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.query("approvals").collect()).map((approval) => ({
        rsvpId: approval.rsvpId,
        clerkUserId: approval.clerkUserId,
        decision: approval.decision,
      })),
    );
    expect(approvalsAfter).toEqual([
      { rsvpId: checkedInRsvpId, clerkUserId: checkedInClerkUserId, decision: "approved" },
      { rsvpId: ticketedRsvpId, clerkUserId: ticketedClerkUserId, decision: "approved" },
    ]);
    const erasureNotices = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.query("webhookDeliveries").collect()).map((delivery) => {
        const payload = JSON.parse(delivery.payloadJson) as {
          data: { ticket?: unknown; changes?: { reason?: string } };
        };
        return {
          eventType: delivery.eventType,
          rsvpId: delivery.rsvpId,
          ticket: payload.data.ticket ?? null,
          reason: payload.data.changes?.reason ?? null,
        };
      }),
    );
    expect(erasureNotices).toEqual(
      [checkedInRsvpId, ticketedRsvpId].sort().map((rsvpId) => ({
        eventType: "rsvp.updated",
        rsvpId,
        ticket: null,
        reason: "erasure",
      })),
    );
    expect(await readAttendanceCounts(testBackend, partner.plaintextKey)).toEqual(countsBefore);
  });

  it("never attaches the person to an anonymized RSVP again", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    await subscribeWebhookEndpoint(testBackend);
    const partner = await issueApiKey(testBackend);
    const rsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    await requestErasure(testBackend, partner.plaintextKey, { phone: ERASED_PHONE });
    const anonymizedRsvp = await readStoredRsvpDocument(testBackend, rsvpId);

    const resentRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    await submitCoucouGuestForm(testBackend, eventId);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: ERASED_PHONE,
        firstName: "Erin",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    await testBackend.mutation(internal.rsvps.claimGuestRsvpsForClerkPhoneInternal, {
      clerkUserId: MEMBER_CLERK_USER_ID,
      phone: ERASED_PHONE,
    });
    await drainScheduledFunctions(testBackend);

    expect(resentRsvpId).not.toBe(rsvpId);
    expect(await readStoredRsvpDocument(testBackend, rsvpId)).toEqual(anonymizedRsvp);
    expect(await readStoredRsvpDocument(testBackend, resentRsvpId)).toMatchObject({
      clerkUserId: MEMBER_CLERK_USER_ID,
      note: PERSON_NOTE,
    });

    const attendanceResponse = await testBackend.fetch(
      `/api/v1/rsvps/${rsvpId}`,
      buildJsonRequest(partner.plaintextKey, "PATCH", { attendanceStatus: "no" }),
    );
    await drainScheduledFunctions(testBackend);
    expect(attendanceResponse.status).toBe(200);
    expect((await attendanceResponse.json()).rsvp).toMatchObject({
      rsvpId,
      name: null,
      isGuest: true,
      attendanceStatus: "no",
    });
    expect(await readStoredRsvpDocument(testBackend, rsvpId)).toEqual({
      ...anonymizedRsvp,
      attendanceStatus: "no",
      webhookOriginMutationId: expect.any(String),
    });
    const anonymizedRowNotices = (await readStoredPersonState(testBackend)).webhookDeliveries
      .filter((delivery) => delivery.rsvpId === rsvpId)
      .map((delivery) => [delivery.eventType, delivery.identity]);
    const nullIdentity = { phone: null, phoneHash: null, name: null, isGuest: true };
    expect(anonymizedRowNotices).toEqual([
      ["rsvp.updated", nullIdentity],
      ["rsvp.attendance_updated", nullIdentity],
    ]);
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

  it("takes the anonymized RSVP's id out of the SMS logs and redacts its audit entries", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedWorkspace(testBackend, "coucou", PLATFORM_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    const formEventId = await seedEvent(testBackend, "evt-form");
    const partner = await issueApiKey(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const rsvpId = (await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    })) as Id<"rsvps">;
    await submitCoucouGuestForm(testBackend, formEventId);
    const logIds = await testBackend.run(async (databaseContext) => {
      const formRsvp = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", formEventId))
        .unique();
      if (!formRsvp) throw new Error("Expected the form RSVP");
      const textBlastId = await databaseContext.db.insert("textBlasts", {
        name: "Reminder",
        message: "Reply YES",
        targetLists: ["ga"],
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
        sentBy: `host_${CLERK_ORGANIZATION_ID}`,
        status: "sent",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      const recipientId = await databaseContext.db.insert("textBlastRecipients", {
        textBlastId,
        phoneHash,
        status: "sent",
        sourceEventIds: [eventId, formEventId],
        sourceRsvpIds: [rsvpId, formRsvp._id],
        sourceListKeys: ["ga"],
        recipientClerkUserIds: [`guest:${phoneHash}`],
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      const replyAttemptId = await databaseContext.db.insert("textBlastReplyAttempts", {
        textBlastId,
        textBlastRecipientId: recipientId,
        phoneHash,
        fromPhoneObfuscated: "***-***-0100",
        inboundMessage: "YES",
        normalizedReplyCode: "yes",
        targetEventId: eventId,
        sourceRsvpId: rsvpId,
        destinationRsvpId: rsvpId,
        status: "submitted",
        receivedAt: FIXED_NOW,
        createdAt: FIXED_NOW,
      });
      const receiptId = await databaseContext.db.insert("smsInboundReceipts", {
        providerMessageId: "SM-erase",
        destinationRsvpId: rsvpId,
        phoneHash,
        toPhoneNumber: "+15550000000",
        body: "YES",
        status: "processed",
        outcome: "submitted",
        targetEventId: eventId,
        receivedAt: FIXED_NOW,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      return { formRsvpId: formRsvp._id, recipientId, replyAttemptId, receiptId };
    });
    const platformStaff = testBackend.withIdentity(createPlatformStaffIdentity());
    const repairBefore = await platformStaff.mutation(
      api.identityConsolidation.repairTextRsvpAssociations,
      { evidence: "reply_attempts", dryRun: false },
    );
    expect(repairBefore.updates).toEqual([
      expect.objectContaining({ rsvpId, associatePhone: true }),
    ]);

    await requestErasure(testBackend, partner.plaintextKey, { phone: ERASED_PHONE });

    const logsAfter = await testBackend.run(async (databaseContext) => {
      const recipient = await databaseContext.db.get(logIds.recipientId);
      const replyAttempt = await databaseContext.db.get(logIds.replyAttemptId);
      const receipt = await databaseContext.db.get(logIds.receiptId);
      return {
        recipient: { phoneHash: recipient?.phoneHash, sourceRsvpIds: recipient?.sourceRsvpIds },
        replyAttempt: {
          phoneHash: replyAttempt?.phoneHash,
          sourceRsvpId: replyAttempt?.sourceRsvpId ?? null,
          destinationRsvpId: replyAttempt?.destinationRsvpId ?? null,
        },
        receipt: {
          phoneHash: receipt?.phoneHash,
          destinationRsvpId: receipt?.destinationRsvpId ?? null,
        },
      };
    });
    expect(logsAfter).toEqual({
      recipient: { phoneHash, sourceRsvpIds: [logIds.formRsvpId] },
      replyAttempt: { phoneHash, sourceRsvpId: null, destinationRsvpId: null },
      receipt: { phoneHash, destinationRsvpId: null },
    });
    const repairAudit = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.query("auditLog").collect())
        .filter((entry) => entry.targetId === rsvpId)
        .map((entry) => ({
          action: entry.action,
          actorClerkUserId: entry.actorClerkUserId ?? null,
          metadata: entry.metadata ?? null,
        })),
    );
    expect(repairAudit).toEqual([
      {
        action: "rsvp.text_association_repaired",
        actorClerkUserId: "platform_staff",
        metadata: { redacted: "rsvp_anonymized" },
      },
    ]);
  });

  it("clears an audit actor that is any account of the person, merged accounts included", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const { partner, rsvpId } = await seedMemberWithRetiredAccountAuditEntries(testBackend);

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: MEMBER_PHONE,
    });

    expect(erasure.body.erasure.anonymizedRsvpIds).toEqual([rsvpId]);
    expect(await readRsvpAuditActors(testBackend, rsvpId)).toEqual([
      { actorClerkUserId: null, actorEmail: null, metadata: { redacted: "rsvp_anonymized" } },
      {
        actorClerkUserId: "platform_staff",
        actorEmail: "platform_staff@example.com",
        metadata: { redacted: "rsvp_anonymized" },
      },
    ]);
  });

  it("does not let a text-association repair attach a phone to an anonymized RSVP", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedWorkspace(testBackend, "coucou", PLATFORM_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    const partner = await issueApiKey(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const rsvpId = (await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    })) as Id<"rsvps">;
    await requestErasure(testBackend, partner.plaintextKey, { phone: ERASED_PHONE });
    const anonymizedRsvp = await readStoredRsvpDocument(testBackend, rsvpId);
    // A log row that still points at the RSVP, as one written by an older release could.
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("textBlastReplyAttempts", {
        phoneHash,
        fromPhoneObfuscated: "***-***-0100",
        inboundMessage: "YES",
        normalizedReplyCode: "yes",
        targetEventId: eventId,
        destinationRsvpId: rsvpId,
        status: "submitted",
        receivedAt: FIXED_NOW,
        createdAt: FIXED_NOW,
      });
    });

    const repair = await testBackend
      .withIdentity(createPlatformStaffIdentity())
      .mutation(api.identityConsolidation.repairTextRsvpAssociations, {
        evidence: "reply_attempts",
        dryRun: false,
      });

    expect(repair).toMatchObject({ updates: [], unresolved: 0 });
    expect(await readStoredRsvpDocument(testBackend, rsvpId)).toEqual(anonymizedRsvp);
  });

  it("anonymizes at most 50 RSVPs per request and reports the rest as partial", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const partner = await issueApiKey(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const rsvpIds = await insertRsvpsOnNewEvents(testBackend, 51, {
      clerkUserId: `guest:${phoneHash}`,
      guestPhoneHash: phoneHash,
      apiClientId: partner.apiClientId,
    });
    const sortedRsvpIds = [...rsvpIds].sort();

    const firstErasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });
    expect(await countAnonymizedRsvps(testBackend, rsvpIds)).toBe(50);
    const secondErasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });

    expect(firstErasure.body.erasure).toMatchObject({
      status: "partial",
      anonymizedRsvpIds: sortedRsvpIds.slice(0, 50),
      retainedRsvpIds: [],
    });
    expect(secondErasure.body.erasure).toMatchObject({
      status: "completed",
      anonymizedRsvpIds: sortedRsvpIds.slice(50),
      retainedRsvpIds: [],
    });
    expect(await countAnonymizedRsvps(testBackend, rsvpIds)).toBe(51);
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

describe("Coucou account deletion", () => {
  it("anonymizes every RSVP the person holds and sends granted partners an erasure notice", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const partnerEventId = await seedEvent(testBackend, "evt-erase");
    const directEventId = await seedEvent(testBackend, "evt-direct");
    const ungrantedEventId = await seedEvent(testBackend, "evt-ungranted");
    const hostBackend = testBackend.withIdentity(createHostIdentity(CLERK_ORGANIZATION_ID));
    await hostBackend.mutation(api.webhookEndpoints.create, {
      workspaceSlug: WORKSPACE_SLUG,
      url: ENDPOINT_URL,
      subscribedEventTypes: ["rsvp.created", "rsvp.updated"],
      eventAccessMode: "selected",
      allowedEventIds: [partnerEventId, directEventId],
    });
    const partner = await issueApiKey(testBackend);
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    const partnerRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
      smsConsent: true,
      smsConsentIpAddress: CONSENT_IP_ADDRESS,
    });
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: ERASED_PHONE,
        phoneHash,
        firstName: "Erin",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      await databaseContext.db.insert("smsOptOuts", {
        phoneNumber: phoneHash,
        optedOutAt: FIXED_NOW,
        reason: "user_request",
      });
      await databaseContext.db.insert("smsNotifications", {
        eventId: partnerEventId,
        recipientClerkUserId: `guest:${phoneHash}`,
        recipientPhoneObfuscated: "***-***-0100",
        recipientPhoneHash: phoneHash,
        type: "approval",
        message: "You're on the list",
        status: "sent",
        createdAt: FIXED_NOW,
      });
    });
    const memberBackend = testBackend.withIdentity({ subject: MEMBER_CLERK_USER_ID });
    for (const eventId of [directEventId, ungrantedEventId]) {
      await memberBackend.mutation(api.rsvps.submitRequest, {
        eventId,
        siteKey: "dojo",
        listKey: "ga",
        accessToken: await issueGaListAccessToken(testBackend, eventId),
        firstName: "Erin",
        lastName: "Member",
        shareContact: true,
        attendees: 2,
        note: PERSON_NOTE,
        smsConsent: true,
        smsConsentIpAddress: CONSENT_IP_ADDRESS,
        customFields: {},
        socialProfiles: [],
      });
    }
    await drainScheduledFunctions(testBackend);
    const rsvpsBefore = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.query("rsvps").collect()).map((rsvp) => ({
        rsvpId: rsvp._id,
        eventId: rsvp.eventId,
        clerkUserId: rsvp.clerkUserId,
      })),
    );
    const directRsvpId = rsvpsBefore.find((rsvp) => rsvp.eventId === directEventId)?.rsvpId;
    const ungrantedRsvpId = rsvpsBefore.find((rsvp) => rsvp.eventId === ungrantedEventId)?.rsvpId;
    expect(rsvpsBefore).toEqual([
      { rsvpId: partnerRsvpId, eventId: partnerEventId, clerkUserId: `guest:${phoneHash}` },
      { rsvpId: directRsvpId, eventId: directEventId, clerkUserId: MEMBER_CLERK_USER_ID },
      { rsvpId: ungrantedRsvpId, eventId: ungrantedEventId, clerkUserId: MEMBER_CLERK_USER_ID },
    ]);
    const countsBefore = await readAttendanceCounts(testBackend, partner.plaintextKey);

    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    await drainScheduledFunctions(testBackend);

    const keptRsvpFields = [
      "_id",
      "anonymizedAt",
      "approvalStatus",
      "attendanceStatus",
      "attendees",
      "clerkUserId",
      "createdAt",
      "eventId",
      "listKey",
      "shareContact",
      "source",
      "status",
      "ticketStatus",
      "updatedAt",
    ];
    const expectedRsvps = [
      {
        rsvpId: partnerRsvpId,
        clerkUserId: `guest:anonymized-${partnerRsvpId}`,
        source: "api",
        attendees: 1,
        partnerFields: ["apiClientId", "createdByApiClientId", "webhookOriginApiClientId"],
      },
      {
        rsvpId: directRsvpId,
        clerkUserId: `anonymized-${directRsvpId}`,
        source: "form",
        attendees: 2,
        partnerFields: [],
      },
      {
        rsvpId: ungrantedRsvpId,
        clerkUserId: `anonymized-${ungrantedRsvpId}`,
        source: "form",
        attendees: 2,
        partnerFields: [],
      },
    ];
    for (const expected of expectedRsvps) {
      const storedRsvp = await readStoredRsvpDocument(testBackend, expected.rsvpId as string);
      expect(storedRsvp).toMatchObject({
        clerkUserId: expected.clerkUserId,
        source: expected.source,
        attendees: expected.attendees,
        listKey: "ga",
        anonymizedAt: FIXED_NOW,
        shareContact: false,
      });
      expect(
        Object.keys(storedRsvp ?? {})
          .filter((fieldName) => fieldName !== "webhookOriginMutationId")
          .sort(),
      ).toEqual([...keptRsvpFields, ...expected.partnerFields].sort());
    }

    const storedAfter = await readStoredPersonState(testBackend);
    expect(storedAfter.webhookDeliveries).toEqual(
      [
        { rsvpId: directRsvpId, isGuest: false },
        { rsvpId: partnerRsvpId, isGuest: true },
      ].map(({ rsvpId, isGuest }) => ({
        eventType: "rsvp.updated",
        rsvpId,
        identity: { phone: null, phoneHash: null, name: null, isGuest },
        origin: { type: "app" },
        changes: {
          previousApprovalStatus: "pending",
          previousAttendanceStatus: "yes",
          reason: "erasure",
        },
      })),
    );
    expect(storedAfter.webhookPayloadText).not.toContain(ERASED_PHONE);
    expect(storedAfter.webhookPayloadText).not.toContain(phoneHash);
    expect(storedAfter.webhookPayloadText).not.toContain("Erin");
    expect(storedAfter).toMatchObject({
      users: [],
      guestContacts: [],
      smsOrganizerPreferences: [],
      contactEvents: [],
      smsOptOuts: [{ phoneNumber: phoneHash, reason: "user_request" }],
    });
    const sentSmsLogs = await testBackend.run(async (databaseContext) =>
      (await databaseContext.db.query("smsNotifications").collect()).map((notification) => ({
        recipientPhoneHash: notification.recipientPhoneHash ?? null,
        message: notification.message,
      })),
    );
    expect(sentSmsLogs).toContainEqual({
      recipientPhoneHash: phoneHash,
      message: "You're on the list",
    });
    expect(await readAttendanceCounts(testBackend, partner.plaintextKey)).toEqual(countsBefore);
  });

  it("leaves the host's ticket counts unchanged after a partner erasure and an account deletion", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventIds = [
      await seedEvent(testBackend, "evt-erase"),
      await seedEvent(testBackend, "evt-disabled"),
      await seedEvent(testBackend, "evt-direct"),
      await seedEvent(testBackend, "evt-redeemed"),
    ];
    const [, , directEventId, redeemedEventId] = eventIds;
    const partner = await issueApiKey(testBackend);
    const hostBackend = testBackend.withIdentity(createHostIdentity(CLERK_ORGANIZATION_ID));
    const issuedRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    const disabledRsvpId = await postPartnerRsvp(
      testBackend,
      partner.plaintextKey,
      "evt-disabled",
      { phone: ERASED_PHONE, name: ERASED_NAME },
    );
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const memberBackend = testBackend.withIdentity({ subject: MEMBER_CLERK_USER_ID });
    for (const eventId of [directEventId, redeemedEventId]) {
      await memberBackend.mutation(api.rsvps.submitRequest, {
        eventId,
        siteKey: "dojo",
        listKey: "ga",
        accessToken: await issueGaListAccessToken(testBackend, eventId),
        firstName: "Mia",
        lastName: "Member",
        shareContact: true,
        attendees: 1,
        customFields: {},
        socialProfiles: [],
      });
    }
    await drainScheduledFunctions(testBackend);
    const memberRsvpIds = await testBackend.run(async (databaseContext) =>
      (
        await databaseContext.db
          .query("rsvps")
          .withIndex("by_user", (queryBuilder) =>
            queryBuilder.eq("clerkUserId", MEMBER_CLERK_USER_ID),
          )
          .collect()
      ).map((rsvp) => rsvp._id),
    );
    const approvalCodes: string[] = [];
    for (const rsvpId of [issuedRsvpId, disabledRsvpId, ...memberRsvpIds]) {
      const approval = await hostBackend.mutation(api.approvals.applyApproval, {
        rsvpId: rsvpId as Id<"rsvps">,
        workspaceSlug: WORKSPACE_SLUG,
      });
      approvalCodes.push(approval.code);
    }
    await hostBackend.mutation(api.redemptions.toggleRedemptionStatus, {
      rsvpId: disabledRsvpId as Id<"rsvps">,
      workspaceSlug: WORKSPACE_SLUG,
    });
    await hostBackend.mutation(api.redemptions.redeem, {
      code: approvalCodes[3],
      workspaceSlug: WORKSPACE_SLUG,
    });
    await drainScheduledFunctions(testBackend);
    const ticketCountsBefore = await readHostTicketCounts(testBackend, eventIds);
    expect(ticketCountsBefore).toEqual({
      dashboard: { totalRsvps: 4, approvedRsvps: 4, issuedTickets: 2, redeemedTickets: 1 },
      exportCounts: { issued: 2, disabled: 1, redeemed: 1 },
      doorCounts: { issued: 2, disabled: 1, redeemed: 1 },
    });

    const erasure = await requestErasure(testBackend, partner.plaintextKey, {
      phone: ERASED_PHONE,
    });
    expect(erasure.body.erasure.anonymizedRsvpIds).toEqual([issuedRsvpId, disabledRsvpId].sort());
    expect(await readHostTicketCounts(testBackend, eventIds)).toEqual(ticketCountsBefore);

    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    await drainScheduledFunctions(testBackend);
    expect(await countAnonymizedRsvps(testBackend, memberRsvpIds)).toBe(2);
    expect(await readHostTicketCounts(testBackend, eventIds)).toEqual(ticketCountsBefore);
  });

  it("removes the person from audit entries about the RSVPs it anonymizes", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    await seedEvent(testBackend, "evt-other");
    const { phoneHash } = await normalizeAndHashPhoneNumber(ERASED_PHONE);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const partner = await issueApiKey(testBackend);
    const memberRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: MEMBER_PHONE,
      name: "Mia Member",
    });
    const retiredRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-erase", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    const claimedRsvpId = await postPartnerRsvp(testBackend, partner.plaintextKey, "evt-other", {
      phone: ERASED_PHONE,
      name: ERASED_NAME,
    });
    // Staff repaired the guest row before the merge retired its id.
    await testBackend.run(async (databaseContext) => {
      const guestRsvp = await databaseContext.db.get(retiredRsvpId as Id<"rsvps">);
      await databaseContext.db.insert("auditLog", {
        at: FIXED_NOW,
        actorClerkUserId: "platform_staff",
        action: "rsvp.text_association_repaired",
        targetKind: "rsvp",
        targetId: retiredRsvpId,
        metadata: { evidenceId: "evidence", previousRsvp: JSON.stringify(guestRsvp) },
      });
    });
    await testBackend
      .withIdentity({ subject: MEMBER_CLERK_USER_ID })
      .mutation(internal.rsvps.claimGuestRsvpsForClerkPhoneInternal, {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: ERASED_PHONE,
      });
    await drainScheduledFunctions(testBackend);
    const readRsvpAuditEntries = async () =>
      await testBackend.run(async (databaseContext) =>
        (await databaseContext.db.query("auditLog").collect())
          .filter((entry) => entry.targetKind === "rsvp")
          .map((entry) => ({
            action: entry.action,
            targetId: entry.targetId,
            actorClerkUserId: entry.actorClerkUserId ?? null,
            metadata: entry.metadata ?? null,
          }))
          .sort((firstEntry, secondEntry) =>
            `${firstEntry.action}${firstEntry.targetId}`.localeCompare(
              `${secondEntry.action}${secondEntry.targetId}`,
            ),
          ),
      );
    const auditBefore = await readRsvpAuditEntries();
    expect(
      auditBefore.map((entry) => [
        entry.action,
        entry.targetId,
        entry.actorClerkUserId,
        Object.keys(entry.metadata ?? {}).sort(),
      ]),
    ).toEqual(
      [
        ["rsvp.reconciled", memberRsvpId, ["previousRsvp", "previousTargetRsvp"]],
        ["rsvp.reconciled", claimedRsvpId, ["canonicalClerkUserId", "previousRsvp"]],
      ]
        .sort((first, second) => String(first[1]).localeCompare(String(second[1])))
        .map(([action, targetId, metadataKeys]) => [
          action,
          targetId,
          MEMBER_CLERK_USER_ID,
          metadataKeys,
        ])
        .concat([
          [
            "rsvp.text_association_repaired",
            retiredRsvpId,
            "platform_staff",
            ["evidenceId", "previousRsvp"],
          ],
        ]),
    );
    expect(JSON.stringify(auditBefore)).toContain(ERASED_NAME);

    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    await drainScheduledFunctions(testBackend);

    const redacted = { redacted: "rsvp_anonymized" };
    expect(await readRsvpAuditEntries()).toEqual(
      auditBefore.map((entry) => ({
        ...entry,
        actorClerkUserId: entry.actorClerkUserId === "platform_staff" ? "platform_staff" : null,
        metadata: redacted,
      })),
    );
    const auditText = await testBackend.run(async (databaseContext) =>
      JSON.stringify(await databaseContext.db.query("auditLog").collect()),
    );
    expect(auditText).not.toContain(ERASED_NAME);
    expect(auditText).not.toContain("Mia");
    expect(auditText).not.toContain(phoneHash);
    expect(auditText).not.toContain(MEMBER_CLERK_USER_ID);
  });

  it("anonymizes RSVPs beyond the first 50 in scheduled batches after the account is gone", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const { phoneHash } = await normalizeAndHashPhoneNumber(MEMBER_PHONE);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const rsvpIds = await insertRsvpsOnNewEvents(testBackend, 51, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });

    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });

    const countUsers = async () =>
      await testBackend.run(
        async (databaseContext) => (await databaseContext.db.query("users").collect()).length,
      );
    const stateAfterDeletion = await readAnonymizationBatches(testBackend);
    expect(await countAnonymizedRsvps(testBackend, rsvpIds)).toBe(50);
    expect(await countUsers()).toBe(0);
    expect(stateAfterDeletion).toEqual({
      batches: [
        {
          batchId: expect.any(String),
          rsvpIds: [rsvpIds[50]],
          person: {
            clerkUserIds: [MEMBER_CLERK_USER_ID, `guest:${phoneHash}`],
            phoneHashes: [phoneHash],
          },
          smsLogRsvpIds: [],
          attempts: 1,
          scheduledAt: FIXED_NOW,
        },
      ],
      pendingRsvpIds: [rsvpIds[50]],
    });

    // The batch runs once here and again from the scheduler; the second run finds nothing to do.
    await testBackend.mutation(internal.rsvpAnonymizationBatches.run, {
      batchId: stateAfterDeletion.batches[0].batchId,
    });
    await drainScheduledFunctions(testBackend);

    expect(await countAnonymizedRsvps(testBackend, rsvpIds)).toBe(51);
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [],
      pendingRsvpIds: [],
    });
  });

  it("checks each SMS recipient row once per transaction, at most 500, and finishes the rest in batches", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const { phoneHash } = await normalizeAndHashPhoneNumber(MEMBER_PHONE);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const personRsvpIds = await insertRsvpsOnNewEvents(testBackend, 50, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    const [otherRsvpId] = await insertRsvpsOnNewEvents(testBackend, 1, {
      clerkUserId: "user_other",
    });
    await insertSmsRecipientRows(testBackend, phoneHash, personRsvpIds, otherRsvpId, 1200);

    const documentsReadByTable = new Map<string, number>();
    await testBackend.run(async (databaseContext) => {
      await deleteUserData(
        countDocumentsRead(databaseContext, documentsReadByTable),
        MEMBER_CLERK_USER_ID,
      );
    });

    // Scanning the rows once per RSVP read 50 x 1,200 = 60,000 rows in this transaction.
    expect(documentsReadByTable.get("textBlastRecipients")).toBe(500);
    expect(await countAnonymizedRsvps(testBackend, personRsvpIds)).toBe(50);
    expect(await readSmsRecipientState(testBackend, otherRsvpId)).toEqual({
      rowsListingThePerson: 700,
      rowsListingTheOtherRsvp: 1200,
    });
    const afterDeletion = await readAnonymizationBatches(testBackend);
    expect(afterDeletion).toEqual({
      batches: [
        {
          batchId: expect.any(String),
          rsvpIds: [],
          person: {
            clerkUserIds: [MEMBER_CLERK_USER_ID, `guest:${phoneHash}`],
            phoneHashes: [phoneHash],
          },
          smsLogRsvpIds: personRsvpIds,
          smsLogCursor: { phoneHash, afterCreationTime: expect.any(Number) },
          attempts: 1,
          scheduledAt: FIXED_NOW,
        },
      ],
      pendingRsvpIds: [],
    });

    const batchId = afterDeletion.batches[0].batchId;
    await testBackend.mutation(internal.rsvpAnonymizationBatches.run, { batchId });
    expect(await readSmsRecipientState(testBackend, otherRsvpId)).toEqual({
      rowsListingThePerson: 200,
      rowsListingTheOtherRsvp: 1200,
    });
    await testBackend.mutation(internal.rsvpAnonymizationBatches.run, { batchId });
    expect(await readSmsRecipientState(testBackend, otherRsvpId)).toEqual({
      rowsListingThePerson: 0,
      rowsListingTheOtherRsvp: 1200,
    });
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [],
      pendingRsvpIds: [],
    });
    await drainScheduledFunctions(testBackend);
  });

  it("reruns a batch whose scheduled run never finished", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const { phoneHash } = await normalizeAndHashPhoneNumber(MEMBER_PHONE);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    const rsvpIds = await insertRsvpsOnNewEvents(testBackend, 51, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    // The batch's scheduled run fails, so nothing else will run it.
    await testBackend.run(async (databaseContext) => {
      for (const scheduledFunction of await databaseContext.db.system
        .query("_scheduled_functions")
        .collect()) {
        if (
          scheduledFunction.name === "rsvpAnonymizationBatches:run" &&
          scheduledFunction.state.kind === "pending"
        ) {
          await databaseContext.scheduler.cancel(scheduledFunction._id);
        }
      }
    });
    const stalledBatch = {
      batchId: expect.any(String),
      rsvpIds: [rsvpIds[50]],
      person: {
        clerkUserIds: [MEMBER_CLERK_USER_ID, `guest:${phoneHash}`],
        phoneHashes: [phoneHash],
      },
      smsLogRsvpIds: [],
    };

    // Nine minutes on, the run may still be queued, so the sweep leaves the batch alone.
    vi.setSystemTime(FIXED_NOW + 9 * 60 * 1000);
    await testBackend.mutation(internal.rsvpAnonymizationBatches.rerunStalled, {});
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [{ ...stalledBatch, attempts: 1, scheduledAt: FIXED_NOW }],
      pendingRsvpIds: [rsvpIds[50]],
    });

    vi.setSystemTime(FIXED_NOW + 11 * 60 * 1000);
    await testBackend.mutation(internal.rsvpAnonymizationBatches.rerunStalled, {});
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [{ ...stalledBatch, attempts: 2, scheduledAt: FIXED_NOW + 11 * 60 * 1000 }],
      pendingRsvpIds: [rsvpIds[50]],
    });
    expect(await countAnonymizedRsvps(testBackend, rsvpIds)).toBe(50);

    await drainScheduledFunctions(testBackend);

    expect(await countAnonymizedRsvps(testBackend, rsvpIds)).toBe(51);
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [],
      pendingRsvpIds: [],
    });
  });

  // 50 RSVPs under the account fill the deletion's own transaction, so the
  // guest-form RSVP on evt-erase waits in a batch.
  async function deleteMemberWithPendingGuestRsvp(testBackend: TestBackend) {
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    const eventId = await seedEvent(testBackend, "evt-erase");
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: MEMBER_CLERK_USER_ID,
        phone: MEMBER_PHONE,
        firstName: "Mia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });
    await insertRsvpsOnNewEvents(testBackend, 50, { clerkUserId: MEMBER_CLERK_USER_ID });
    await submitCoucouGuestForm(testBackend, eventId, {
      phone: MEMBER_PHONE,
      note: "Typed before the deletion",
    });
    const guestRsvpId = await testBackend.run(async (databaseContext) => {
      const guestRsvp = await databaseContext.db
        .query("rsvps")
        .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
        .unique();
      if (!guestRsvp) throw new Error("Expected the guest-form RSVP");
      return guestRsvp._id;
    });
    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    expect((await readAnonymizationBatches(testBackend)).pendingRsvpIds).toEqual([guestRsvpId]);
    return { eventId, guestRsvpId };
  }

  async function readEventRsvps(testBackend: TestBackend, eventId: Id<"events">) {
    return await testBackend.run(async (databaseContext) =>
      (
        await databaseContext.db
          .query("rsvps")
          .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
          .collect()
      ).map((rsvp) => ({
        rsvpId: rsvp._id,
        clerkUserId: rsvp.clerkUserId,
        userName: rsvp.userName ?? null,
        note: rsvp.note ?? null,
        anonymizedAt: rsvp.anonymizedAt ?? null,
      })),
    );
  }

  it("lets the person RSVP again on the guest form before the batch runs, and keeps the new RSVP", async () => {
    const testBackend = setupTestBackend();
    const { phoneHash } = await normalizeAndHashPhoneNumber(MEMBER_PHONE);
    const { eventId, guestRsvpId } = await deleteMemberWithPendingGuestRsvp(testBackend);

    await submitCoucouGuestForm(testBackend, eventId, {
      phone: MEMBER_PHONE,
      lastName: "Again",
      note: "Typed after the deletion",
    });

    expect(await readEventRsvps(testBackend, eventId)).toEqual([
      {
        rsvpId: guestRsvpId,
        clerkUserId: `guest:anonymized-${guestRsvpId}`,
        userName: null,
        note: null,
        anonymizedAt: expect.any(Number),
      },
      {
        rsvpId: expect.any(String),
        clerkUserId: `guest:${phoneHash}`,
        userName: "Erin Again",
        note: "Typed after the deletion",
        anonymizedAt: null,
      },
    ]);
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [],
      pendingRsvpIds: [],
    });
  });

  it("keeps an RSVP waiting for anonymization out of a new account's guest claim", async () => {
    const testBackend = setupTestBackend();
    const { eventId, guestRsvpId } = await deleteMemberWithPendingGuestRsvp(testBackend);
    // The person signs up again with the same phone and RSVPs to the same event.
    const newAccountRsvpId = await testBackend.run(async (databaseContext) => {
      await databaseContext.db.insert("users", {
        clerkUserId: "user_new_account",
        phone: MEMBER_PHONE,
        firstName: "Nia",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
      return await databaseContext.db.insert("rsvps", {
        eventId,
        clerkUserId: "user_new_account",
        userName: "Nia New",
        listKey: "ga",
        shareContact: true,
        status: "pending",
        approvalStatus: "pending",
        source: "form",
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });

    const claim = await testBackend.mutation(internal.rsvps.claimGuestRsvpsForClerkPhoneInternal, {
      clerkUserId: "user_new_account",
      phone: MEMBER_PHONE,
    });
    await drainScheduledFunctions(testBackend);

    expect(claim).toEqual({ paired: 0, merged: 0 });
    expect(await readEventRsvps(testBackend, eventId)).toEqual([
      {
        rsvpId: guestRsvpId,
        clerkUserId: `guest:anonymized-${guestRsvpId}`,
        userName: null,
        note: null,
        anonymizedAt: expect.any(Number),
      },
      {
        rsvpId: newAccountRsvpId,
        clerkUserId: "user_new_account",
        userName: "Nia New",
        note: null,
        anonymizedAt: null,
      },
    ]);
    expect(
      (await readAuditEntries(testBackend)).filter((entry) => entry.action === "rsvp.reconciled"),
    ).toEqual([]);
    expect(await readAnonymizationBatches(testBackend)).toEqual({
      batches: [],
      pendingRsvpIds: [],
    });
  });

  it("clears an audit actor that is an account merged into the deleted one", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend, WORKSPACE_SLUG, CLERK_ORGANIZATION_ID);
    await seedEvent(testBackend, "evt-erase");
    const { rsvpId } = await seedMemberWithRetiredAccountAuditEntries(testBackend);

    await testBackend.mutation(internal.users.deleteFromClerk, {
      clerkUserId: MEMBER_CLERK_USER_ID,
    });
    await drainScheduledFunctions(testBackend);

    expect(await readRsvpAuditActors(testBackend, rsvpId)).toEqual([
      { actorClerkUserId: null, actorEmail: null, metadata: { redacted: "rsvp_anonymized" } },
      {
        actorClerkUserId: "platform_staff",
        actorEmail: "platform_staff@example.com",
        metadata: { redacted: "rsvp_anonymized" },
      },
    ]);
  });
});
