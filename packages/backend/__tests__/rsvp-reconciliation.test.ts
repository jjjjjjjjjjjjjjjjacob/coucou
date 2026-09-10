import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aggregateSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api, internal } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import { insertRsvpIntoAggregate, updateRsvpInAggregate } from "../convex/lib/rsvpAggregate";
import { applyApprovalStatusTransition } from "../convex/lib/rsvpApproval";
import { submitRsvpThroughSharedService } from "../convex/lib/rsvpSubmissionService";
import schema from "../convex/schema";

const clerkLookup = vi.hoisted(() => vi.fn());
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { getUser: clerkLookup } }),
}));
const phoneNumber = "+13104996272";
const modules = import.meta.glob("../convex/**/*.ts");
const aggregateModules = import.meta.glob(
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/**/*.js",
);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_mock");
  clerkLookup.mockReset();
  clerkLookup.mockResolvedValue({
    phoneNumbers: [{ phoneNumber, verification: { status: "verified" } }],
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function fixture(siteKey = "dojo", registered = false) {
  const backend = convexTest(schema, modules);
  backend.registerComponent("rsvpAggregate", aggregateSchema, aggregateModules);
  const { phoneHash } = await normalizeAndHashPhoneNumber(phoneNumber);
  const seeded = await backend.run(async (context) => {
    const workspaceId = await context.db.insert("workspaces", {
      slug: siteKey,
      name: siteKey,
      clerkOrganizationId: "org_dojo",
      createdAt: 1,
      updatedAt: 1,
    });
    const eventId = await context.db.insert("events", {
      siteKey,
      workspaceSlug: siteKey,
      shortId: "night",
      name: "Night",
      location: "Here",
      eventDate: Date.now() + 86400000,
      status: "active",
      rsvpConfirmationMessageEnabled: false,
      createdAt: 1,
      updatedAt: 1,
    });
    await context.db.insert("listCredentials", { eventId, listKey: "vip", createdAt: 1 });
    const userId = registered
      ? await context.db.insert("users", {
          clerkUserId: "old_account",
          phone: phoneNumber,
          phoneHash,
          firstName: "Ava",
          lastName: "Green",
          createdAt: 1,
          updatedAt: 1,
        })
      : null;
    const event = await context.db.get(eventId);
    const user = userId ? await context.db.get(userId) : null;
    if (!event) throw new Error("Missing event");
    const submission = await submitRsvpThroughSharedService(context, {
      submissionOrigin: "sms",
      smsPhoneHash: phoneHash,
      event,
      listKey: "vip",
      clerkUserId: registered ? "old_account" : `guest:${phoneHash}`,
      registeredUser: user ?? undefined,
      guestPhoneHash: registered ? undefined : phoneHash,
      normalizedPhoneNumber: phoneNumber,
      firstName: "Ava",
      lastName: "Green",
      socialProfiles: [],
      customFieldValues: {},
      smsConsent: true,
    });
    return { workspaceId, eventId, rsvpId: submission.rsvpId };
  });
  return {
    backend,
    phoneHash,
    ...seeded,
    authenticated: backend.withIdentity({ subject: "current_account" }),
  };
}

describe("verified text RSVP reconciliation", () => {
  it.each([
    "dojo",
    "club-chlorine",
    "danza-organica",
    "coucou",
  ])("recognizes a text RSVP through status and My Tickets for %s", async (siteKey) => {
    const { backend, authenticated, rsvpId } = await fixture(siteKey);
    expect(await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {})).toEqual({
      paired: 1,
      merged: 0,
    });
    expect(clerkLookup).toHaveBeenCalledWith("current_account");
    expect(
      await authenticated.query(api.rsvps.statusForUserEventByRouteId, {
        eventRouteId: "night",
        siteKey,
      }),
    ).toMatchObject({ rsvpId, status: "pending" });
    expect(await authenticated.query(api.rsvps.listUserTickets, {})).toMatchObject([
      { rsvp: { _id: rsvpId, source: "text", clerkUserId: "current_account" } },
    ]);
    expect(await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {})).toEqual({
      paired: 0,
      merged: 0,
    });
    const scheduled = await backend.run(
      async (context) => await context.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.filter((entry) => entry.name.includes("sendApprovalSms"))).toHaveLength(0);
  });

  it("recovers an older same-phone account RSVP without changing accounts or memberships, and deduplicates the next SMS", async () => {
    const { backend, authenticated, rsvpId, eventId, phoneHash } = await fixture("dojo", true);
    await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {});
    const repeated = await backend.run(async (context) => {
      const event = await context.db.get(eventId);
      const oldUser = await context.db
        .query("users")
        .withIndex("by_clerkUserId", (queryBuilder) =>
          queryBuilder.eq("clerkUserId", "old_account"),
        )
        .unique();
      if (!event || !oldUser) throw new Error("Missing fixture");
      return await submitRsvpThroughSharedService(context, {
        submissionOrigin: "sms",
        smsPhoneHash: phoneHash,
        event,
        listKey: "vip",
        clerkUserId: "old_account",
        registeredUser: oldUser,
        firstName: "Ava",
        lastName: "Green",
        socialProfiles: [],
        customFieldValues: {},
        smsConsent: true,
      });
    });
    expect(repeated).toMatchObject({ rsvpId, disposition: "existing" });
    const state = await backend.run(async (context) => ({
      rsvps: await context.db.query("rsvps").collect(),
      users: await context.db.query("users").collect(),
      aliases: await context.db.query("userIdentityAliases").collect(),
    }));
    expect(state.rsvps).toHaveLength(1);
    expect(state.rsvps[0].clerkUserId).toBe("current_account");
    expect(state.users).toHaveLength(2);
    expect(state.aliases).toHaveLength(0);
  });

  it.each([
    "unverified",
    "mismatched",
    "missing",
  ])("never trusts an editable profile phone when Clerk's phone is %s", async (kind) => {
    const { backend, authenticated, rsvpId } = await fixture();
    await backend.run(
      async (context) =>
        await context.db.insert("users", {
          clerkUserId: "current_account",
          phone: phoneNumber,
          createdAt: 1,
          updatedAt: 1,
        }),
    );
    clerkLookup.mockResolvedValue({
      phoneNumbers:
        kind === "missing"
          ? []
          : [
              {
                phoneNumber: kind === "mismatched" ? "+12025550123" : phoneNumber,
                verification: { status: kind === "unverified" ? "unverified" : "verified" },
              },
            ],
    });
    expect(await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {})).toEqual({
      paired: 0,
      merged: 0,
    });
    expect(await authenticated.mutation(api.rsvps.claimGuestRsvpsForCurrentUser, {})).toEqual({
      paired: 0,
      merged: 0,
    });
    expect(
      (await backend.run(async (context) => await context.db.get(rsvpId)))?.clerkUserId,
    ).toMatch(/^guest:/);
  });

  it("preserves the stronger source, redeemed ticket and audit snapshots on collision", async () => {
    const { backend, authenticated, eventId, rsvpId } = await fixture();
    const targetRsvpId = await backend.run(async (context) => {
      const original = await context.db.get(rsvpId);
      if (!original) throw new Error("Missing RSVP");
      await context.db.patch(rsvpId, {
        status: "approved",
        approvalStatus: "approved",
        ticketStatus: "redeemed",
      });
      const updated = await context.db.get(rsvpId);
      if (updated) await updateRsvpInAggregate(context, original, updated);
      await context.db.insert("redemptions", {
        eventId,
        clerkUserId: original.clerkUserId,
        listKey: "vip",
        code: "original-ticket",
        createdAt: 1,
        redeemedAt: 10,
        unredeemHistory: [],
      });
      const targetId = await context.db.insert("rsvps", {
        eventId,
        clerkUserId: "current_account",
        source: "form",
        listKey: "vip",
        status: "pending",
        shareContact: false,
        createdAt: 1,
        updatedAt: 1,
      });
      await insertRsvpIntoAggregate(context, (await context.db.get(targetId)) as Doc<"rsvps">);
      return targetId;
    });
    expect(await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {})).toEqual({
      paired: 1,
      merged: 1,
    });
    const state = await backend.run(async (context) => ({
      rsvp: await context.db.get(targetRsvpId),
      redemptions: await context.db.query("redemptions").collect(),
      aliases: await context.db.query("rsvpIdentityAliases").collect(),
      audits: await context.db.query("auditLog").collect(),
    }));
    expect(state.rsvp).toMatchObject({
      source: "text",
      approvalStatus: "approved",
      ticketStatus: "redeemed",
    });
    expect(state.redemptions).toMatchObject([
      { code: "original-ticket", redeemedAt: 10, clerkUserId: "current_account" },
    ]);
    expect(state.aliases).toMatchObject([{ retiredRsvpId: rsvpId, canonicalRsvpId: targetRsvpId }]);
    expect(state.audits[0].metadata?.previousRsvp).toContain('"source":"text"');
  });

  it("repairs proven historical text records in dry-run pages, without relabeling an existing form RSVP", async () => {
    const { backend, eventId, rsvpId, phoneHash } = await fixture();
    await backend.run(async (context) => {
      await context.db.patch(rsvpId, { source: undefined, smsPhoneHash: undefined });
      for (const status of ["submitted", "already_exists"] as const) {
        const destinationRsvpId =
          status === "submitted"
            ? rsvpId
            : await context.db.insert("rsvps", {
                eventId,
                clerkUserId: "form_owner",
                source: "form",
                listKey: "vip",
                status: "pending",
                shareContact: false,
                createdAt: 1,
                updatedAt: 1,
              });
        await context.db.insert("textBlastReplyAttempts", {
          phoneHash,
          fromPhoneObfuscated: "***6272",
          inboundMessage: "YES",
          normalizedReplyCode: "yes",
          targetEventId: eventId,
          destinationRsvpId,
          status,
          receivedAt: 1,
          createdAt: 1,
        });
      }
    });
    const platform = backend.withIdentity({
      subject: "host",
      org_id: "org_dojo",
      org_slug: "coucou",
      role: "org:admin",
    });
    const dryRun = await platform.mutation(api.identityConsolidation.repairTextRsvpAssociations, {
      evidence: "reply_attempts",
      batchSize: 1,
    });
    expect(dryRun.updates).toHaveLength(1);
    expect(
      (await backend.run(async (context) => await context.db.get(rsvpId)))?.source,
    ).toBeUndefined();
    await platform.mutation(api.identityConsolidation.repairTextRsvpAssociations, {
      evidence: "reply_attempts",
      dryRun: false,
    });
    const rsvps = await backend.run(async (context) => await context.db.query("rsvps").collect());
    expect(rsvps.map((rsvp) => rsvp.source).sort()).toEqual(["form", "text"]);
    expect(
      (
        await platform.mutation(api.identityConsolidation.repairTextRsvpAssociations, {
          evidence: "reply_attempts",
          dryRun: false,
        })
      ).updates,
    ).toHaveLength(0);
  });

  it("rejects unauthenticated reconciliation", async () => {
    const { backend } = await fixture();
    await expect(backend.action(api.rsvps.reconcileCurrentUserRsvps, {})).rejects.toThrow(
      "sign in",
    );
    await expect(
      backend.mutation(internal.rsvps.reconcileVerifiedRsvps, {
        verifiedPhoneNumbers: [phoneNumber],
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("does not claim a phone from an unverified JWT claim", async () => {
    const { backend } = await fixture();
    const authenticated = backend.withIdentity({
      subject: "current_account",
      phoneNumber,
      phoneNumberVerified: false,
    });
    expect(await authenticated.mutation(api.rsvps.claimGuestRsvpsForCurrentUser, {})).toEqual({
      paired: 0,
      merged: 0,
    });
  });

  it("recovers legacy guest IDs into the canonical identity without adding account aliases", async () => {
    const { backend, authenticated, rsvpId, phoneHash } = await fixture();
    await backend.run(async (context) => {
      await context.db.patch(rsvpId, {
        smsPhoneHash: undefined,
        guestPhoneHash: undefined,
        source: undefined,
      });
      const canonicalUserId = await context.db.insert("users", {
        clerkUserId: "canonical_account",
        createdAt: 1,
        updatedAt: 1,
      });
      await context.db.insert("userIdentityAliases", {
        aliasClerkUserId: "current_account",
        canonicalClerkUserId: "canonical_account",
        canonicalUserId,
        phoneHash,
        createdAt: 1,
        updatedAt: 1,
      });
    });
    expect(await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {})).toEqual({
      paired: 1,
      merged: 0,
    });
    expect(clerkLookup).toHaveBeenCalledWith("current_account");
    const state = await backend.run(async (context) => ({
      rsvp: await context.db.get(rsvpId),
      aliases: await context.db.query("userIdentityAliases").collect(),
    }));
    expect(state.rsvp?.clerkUserId).toBe("canonical_account");
    expect(state.rsvp?.source).toBeUndefined();
    expect(state.aliases).toHaveLength(1);
  });

  it("retains revoked profile sharing and organizer opt-outs without moving host roles", async () => {
    const { backend, authenticated, eventId, rsvpId, workspaceId } = await fixture("dojo", true);
    await backend.run(async (context) => {
      const profileFieldValueId = await context.db.insert("profileFieldValues", {
        clerkUserId: "old_account",
        fieldKey: "social.instagram",
        value: "ava",
        normalizedValue: "ava",
        sourceRsvpId: rsvpId,
        sourceEventId: eventId,
        createdAt: 1,
        updatedAt: 2,
      });
      await context.db.insert("workspaceProfileValueGrants", {
        workspaceId,
        clerkUserId: "old_account",
        fieldKey: "social.instagram",
        profileFieldValueId,
        sourceRsvpId: rsvpId,
        sourceEventId: eventId,
        revokedAt: 2,
        createdAt: 1,
        updatedAt: 2,
      });
      const preference = await context.db.query("userSmsOrganizerPreferences").unique();
      if (!preference) throw new Error("Missing preference");
      await context.db.patch(preference._id, {
        smsConsent: false,
        smsConsentTimestamp: 100,
        updatedAt: 100,
      });
      await context.db.insert("orgMemberships", {
        clerkUserId: "old_account",
        organizationId: "org_dojo",
        role: "org:admin",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {});
    const state = await backend.run(async (context) => ({
      grants: await context.db
        .query("workspaceProfileValueGrants")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", "current_account"))
        .collect(),
      preference: await context.db
        .query("userSmsOrganizerPreferences")
        .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", "current_account"))
        .unique(),
      memberships: await context.db.query("orgMemberships").collect(),
    }));
    expect(state.grants).toMatchObject([{ sourceRsvpId: rsvpId, revokedAt: 2, createdAt: 1 }]);
    expect(state.preference).toMatchObject({ smsConsent: false, smsConsentTimestamp: 100 });
    expect(state.memberships).toMatchObject([{ clerkUserId: "old_account", role: "org:admin" }]);
    expect(state.memberships).toHaveLength(1);
  });

  it.each(["approved", "denied"] as const)("preserves %s status during sign-in", async (status) => {
    const { backend, authenticated, eventId, rsvpId } = await fixture();
    await backend.run(async (context) => {
      const rsvp = await context.db.get(rsvpId);
      if (!rsvp) throw new Error("Missing RSVP");
      await applyApprovalStatusTransition(context, {
        rsvp,
        nextApprovalStatus: status,
        decidedBy: "host",
        now: Date.now(),
      });
    });
    const before = await backend.query(internal.rsvps.getApprovedRsvpWithRedemption, {
      eventId,
      clerkUserId: `guest:${(await normalizeAndHashPhoneNumber(phoneNumber)).phoneHash}`,
    });
    if (status === "approved") {
      const host = backend.withIdentity({ subject: "host", org_id: "org_dojo", role: "org:admin" });
      await backend.run(async (context) => {
        const list = await context.db
          .query("listCredentials")
          .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", eventId))
          .unique();
        if (!list) throw new Error("Missing list");
        await context.db.patch(list._id, { generateQR: true });
      });
      expect(
        await host.query(api.qrDelivery.listPendingDeferredRecipients, {
          eventId,
          workspaceSlug: "dojo",
        }),
      ).toMatchObject([{ rsvpId, phone: phoneNumber }]);
      expect(
        await backend.query(internal.rsvps.getApprovalSmsContext, {
          eventId,
          rsvpId,
          clerkUserId: "old_account",
          code: before?.redemptionCode ?? "",
        }),
      ).toMatchObject({ phone: phoneNumber, hasConsented: true });
    }
    await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {});
    await authenticated.action(api.rsvps.reconcileCurrentUserRsvps, {});
    expect(
      await authenticated.query(api.rsvps.statusForUserEventByRouteId, {
        eventRouteId: "night",
        siteKey: "dojo",
      }),
    ).toMatchObject({ rsvpId, status });
    const scheduled = await backend.run(
      async (context) => await context.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduled.filter((entry) => entry.name.includes("sendApprovalSms"))).toHaveLength(
      status === "approved" ? 1 : 0,
    );
    if (status === "approved") {
      expect(
        await backend.query(internal.rsvps.getApprovalSmsContext, {
          eventId,
          rsvpId,
          clerkUserId: "old_account",
          code: before?.redemptionCode ?? "",
        }),
      ).toMatchObject({
        clerkUserId: "current_account",
        phone: phoneNumber,
        code: before?.redemptionCode,
        hasConsented: true,
      });
      await backend.mutation(internal.qrDelivery.markRedemptionDelivered, {
        eventId,
        clerkUserId: "old_account",
        code: before?.redemptionCode,
      });
      const redemption = await backend.run(
        async (context) => await context.db.query("redemptions").unique(),
      );
      expect(redemption?.qrDeliveredAt).toBeDefined();
    }
  });

  it.each([
    true,
    false,
  ])("repairs legacy sessions and requires a matching successful receipt to infer text source (%s)", async (hasReceipt) => {
    const { backend, eventId, rsvpId, phoneHash } = await fixture();
    const sessionId = await backend.run(async (context) => {
      const rsvp = await context.db.get(rsvpId);
      if (!rsvp) throw new Error("Missing RSVP");
      await context.db.patch(rsvpId, { source: undefined, smsPhoneHash: undefined });
      const sessionId = await context.db.insert("smsRsvpSessions", {
        phoneHash,
        phoneObfuscated: "***6272",
        eventId,
        listKey: "vip",
        sourceKind: "event_code",
        normalizedCode: "yes",
        clerkUserId: rsvp.clerkUserId,
        socialProfiles: [],
        customFieldValues: {},
        missingFields: [],
        status: "completed",
        expiresAt: rsvp.createdAt + 1000,
        createdAt: rsvp.createdAt,
        updatedAt: rsvp.createdAt,
      });
      if (hasReceipt)
        await context.db.insert("smsInboundReceipts", {
          providerMessageId: "successful_receipt",
          phoneHash,
          toPhoneNumber: "+12025550123",
          body: "YES",
          status: "processed",
          outcome: "submitted",
          targetEventId: eventId,
          sessionId,
          receivedAt: rsvp.createdAt,
          createdAt: rsvp.createdAt,
          updatedAt: rsvp.createdAt,
        });
      return sessionId;
    });
    const platform = backend.withIdentity({
      subject: "host",
      org_slug: "coucou",
      role: "org:admin",
    });
    const args = { evidence: "sessions" as const, batchSize: 50 };
    expect(
      (await platform.mutation(api.identityConsolidation.repairTextRsvpAssociations, args)).updates,
    ).toMatchObject([{ rsvpId, associatePhone: true, linkSession: true }]);
    await platform.mutation(api.identityConsolidation.repairTextRsvpAssociations, {
      ...args,
      dryRun: false,
    });
    const state = await backend.run(async (context) => ({
      rsvp: await context.db.get(rsvpId),
      session: await context.db.get(sessionId),
    }));
    expect(state.rsvp?.source).toBe(hasReceipt ? "text" : undefined);
    expect(state.rsvp?.smsPhoneHash).toBe(phoneHash);
    expect(state.session?.destinationRsvpId).toBe(rsvpId);
    expect(
      (
        await platform.mutation(api.identityConsolidation.repairTextRsvpAssociations, {
          ...args,
          dryRun: false,
        })
      ).updates,
    ).toHaveLength(0);
  });

  it("exports the source column optionally, including unknown historical records", async () => {
    const { backend, eventId, rsvpId } = await fixture();
    const platform = backend.withIdentity({
      subject: "host",
      org_slug: "coucou",
      role: "org:admin",
    });
    const withSource = await platform.action(api.exports.exportRsvpsCsv, {
      eventId,
      workspaceSlug: "dojo",
      includePhone: false,
      includeSource: true,
    });
    expect(withSource.csvContent).toContain("Source");
    expect(withSource.csvContent).toContain(",Text,");
    const withoutSource = await platform.action(api.exports.exportRsvpsCsv, {
      eventId,
      workspaceSlug: "dojo",
      includePhone: false,
      includeSource: false,
    });
    expect(withoutSource.csvContent).not.toContain("Source");
    await backend.run(async (context) => await context.db.patch(rsvpId, { source: undefined }));
    const historical = await platform.action(api.exports.exportRsvpsCsv, {
      eventId,
      workspaceSlug: "dojo",
      includePhone: false,
    });
    expect(historical.csvContent).toContain(",Unknown,");
  });
});
