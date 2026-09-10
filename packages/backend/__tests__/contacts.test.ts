import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../convex/_generated/server";
import { prepareBatch } from "../convex/contactAudiences";
import { readContactPage } from "../convex/lib/contactQueries";
import {
  ensureContact,
  refreshContactProfile,
  syncContactRsvp,
} from "../convex/lib/contactRecords";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const deliverMessage = vi.hoisted(() => vi.fn(async () => ({ sid: "SM_test", status: "queued" })));
vi.mock("twilio", () => ({ default: () => ({ messages: { create: deliverMessage } }) }));

const modules = import.meta.glob("../convex/**/*.ts");
const scope = { workspaceSlug: "dojo-pomodoro" };
type Backend = ReturnType<typeof convexTest>;

beforeEach(() => {
  vi.useFakeTimers();
  deliverMessage.mockClear();
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function setup() {
  const backend = convexTest(schema, modules);
  const identifiers = await backend.run(async ({ db }) => {
    const workspaceId = await db.insert("workspaces", {
      slug: scope.workspaceSlug,
      name: "Dojo",
      clerkOrganizationId: "org_dojo",
      createdAt: 1,
      updatedAt: 1,
    });
    await db.insert("orgMemberships", {
      organizationId: "org_dojo",
      clerkUserId: "host",
      role: "org:admin",
      createdAt: 1,
      updatedAt: 1,
    });
    const eventId = await db.insert("events", {
      workspaceSlug: scope.workspaceSlug,
      siteKey: "dojo",
      name: "Dojo Pomodoro",
      eventDate: Date.now() + 86400000,
      location: "Dojo",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const stateId = await db.insert("contactDirectoryState", {
      workspaceId,
      status: "ready",
      phase: "messages",
      processed: 0,
      updatedAt: 1,
    });
    return { workspaceId, eventId, stateId };
  });
  // Stored membership is sufficient: no organization or role claims in the session.
  const host = backend.withIdentity({ subject: "host" } as Partial<UserIdentity>);
  return { backend, host, ...identifiers };
}

async function seedContact(
  backend: Backend,
  workspaceId: Id<"workspaces">,
  overrides: Partial<Doc<"workspaceContacts">> = {},
) {
  return backend.run(async ({ db }) =>
    db.insert("workspaceContacts", {
      workspaceId,
      personKey: "phone:test",
      phoneHash: "test",
      phoneNumber: "+14155550101",
      clerkUserIds: ["guest:test"],
      name: "Ada Guest",
      normalizedName: "ada guest",
      searchText: "ada guest +14155550101 14155550101",
      tags: [],
      invitedByNames: [],
      smsConsent: true,
      consentUpdatedAt: 1,
      hasOptedOut: false,
      eventCount: 0,
      eventsAttendedCount: 0,
      receivedTextCount: 0,
      firstRsvpAt: 0,
      latestRsvpAt: 0,
      createdAt: 1,
      updatedAt: 1,
      ...overrides,
    }),
  );
}

async function finishPreview(backend: Backend, previewId: Id<"contactAudiencePreviews">) {
  for (let batch = 0; batch < 500; batch++) {
    const preview = await backend.run(({ db }) => db.get(previewId));
    if (preview?.status !== "building") return preview;
    await backend.mutation(internal.contactAudiences.prepareBatch, { previewId });
  }
  throw new Error("Preview did not finish in bounded batches");
}

function countReads(context: Pick<QueryCtx, "db">) {
  const usage = { operations: 0, documents: 0, unboundedCollections: 0 };
  function wrapQuery(target: object): object {
    return new Proxy(target, {
      get(query, property) {
        const method: unknown = Reflect.get(query, property);
        if (typeof method !== "function") return method;
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(method, query, args);
          if (["take", "first", "unique", "paginate", "collect"].includes(String(property))) {
            usage.operations++;
            if (property === "collect") usage.unboundedCollections++;
            return Promise.resolve(result).then((value: unknown) => {
              usage.documents += Array.isArray(value)
                ? value.length
                : value && typeof value === "object" && "page" in value && Array.isArray(value.page)
                  ? value.page.length
                  : value
                    ? 1
                    : 0;
              return value;
            });
          }
          return result && typeof result === "object" ? wrapQuery(result) : result;
        };
      },
    });
  }
  const database = new Proxy(context.db, {
    get(target, property) {
      if (property === "query")
        return (...args: unknown[]) => wrapQuery(Reflect.apply(target.query, target, args));
      if (property === "get")
        return (...args: unknown[]) => {
          usage.operations++;
          return Reflect.apply(target.get, target, args).then((value: unknown) => {
            if (value) usage.documents++;
            return value;
          });
        };
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { context: { db: database }, usage };
}

describe("contact directory and frozen audiences", () => {
  it("shows current account and RSVP-only socials across linked identities without leaking other workspaces", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    const contactId = await seedContact(backend, workspaceId, {
      clerkUserIds: ["account", "guest:test"],
    });
    await backend.run(async ({ db }) => {
      for (const [platformKey, handle] of [
        ["instagram", "old_account"],
        ["linkedin", "ada"],
      ]) {
        await db.insert("userSocialProfiles", {
          clerkUserId: "account",
          platformKey,
          handle,
          normalizedHandle: handle,
          createdAt: 1,
          updatedAt: 10,
        });
      }
      const otherWorkspaceId = await db.insert("workspaces", {
        slug: "other",
        name: "Other",
        createdAt: 1,
        updatedAt: 1,
      });
      // The useful snapshot predates the three events included in the table preview.
      for (let position = 0; position < 5; position++) {
        const rsvpId = await db.insert("rsvps", {
          eventId,
          clerkUserId: "guest:test",
          listKey: "main",
          status: "approved",
          shareContact: false,
          createdAt: position,
          updatedAt: position,
        });
        await db.insert("contactEvents", {
          workspaceId: position === 4 ? otherWorkspaceId : workspaceId,
          contactId,
          eventId,
          rsvpId,
          clerkUserId: "guest:test",
          eventName: "Dojo",
          eventDate: position,
          approvalStatus: "approved",
          rsvpCreatedAt: position,
          consentUpdatedAt: 0,
          hasAttended: false,
          hasApprovalSms: false,
          hasQrCode: false,
          customFieldKeys: [],
          missingCustomFieldKeys: [],
        });
        if (position === 0 || position === 4) {
          for (const platformKey of ["instagram", "tiktok"]) {
            const handle = position === 4 ? "other_workspace" : "guest_ada";
            await db.insert("rsvpSocialProfiles", {
              eventId,
              rsvpId,
              clerkUserId: "guest:test",
              platformKey,
              handle,
              normalizedHandle: handle,
              createdAt: 1,
              updatedAt: position === 4 ? 100 : 20,
            });
          }
        }
      }
    });
    const result = await host.query(api.contacts.list, scope);
    expect(result.people[0].socialProfiles).toEqual([
      { platformKey: "instagram", handle: "guest_ada", normalizedHandle: "guest_ada" },
      { platformKey: "linkedin", handle: "ada", normalizedHandle: "ada" },
      { platformKey: "tiktok", handle: "guest_ada", normalizedHandle: "guest_ada" },
    ]);
    const detail = await host.query(api.contacts.get, { ...scope, contactId });
    expect(detail.socialProfiles).toEqual(result.people[0].socialProfiles);
  });

  it("shows profiles and all RSVP statuses, but never global accounts alone", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    await backend.run(async (context) => {
      await context.db.insert("users", {
        clerkUserId: "global_only",
        firstName: "Global",
        createdAt: 1,
        updatedAt: 1,
      });
      for (const status of ["pending", "denied", "approved"] as const) {
        const rsvpId = await context.db.insert("rsvps", {
          eventId,
          listKey: "main",
          clerkUserId: status,
          userName: status,
          status,
          approvalStatus: status,
          smsConsent: false,
          shareContact: false,
          createdAt: 1,
          updatedAt: 1,
        });
        await syncContactRsvp(context, rsvpId);
      }
      await context.db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "profile_only",
        tags: ["friend"],
        notes: "Met at lunch",
        createdAt: 1,
        updatedAt: 1,
      });
      const contact = await ensureContact(context, workspaceId, {
        clerkUserId: "profile_only",
        name: "Profile Person",
      });
      await refreshContactProfile(context, contact._id);
    });
    const result = await host.query(api.contacts.list, scope);
    expect(result.people).toHaveLength(4);
    expect(result.people.map((person) => person.name)).toEqual([
      "approved",
      "denied",
      "pending",
      "Profile Person",
    ]);
    expect(result.people.every((person) => !person.smsConsent)).toBe(true);
    expect(
      (await host.query(api.contacts.list, { ...scope, searchText: "lunch" })).people[0].name,
    ).toBe("Profile Person");
  });

  it("indexes historical RSVP names and social handles on one atomic contact", async () => {
    const { backend, host, eventId } = await setup();
    await backend.run(async (context) => {
      await context.db.insert("users", {
        clerkUserId: "renamed_person",
        firstName: "Current",
        lastName: "Profile",
        createdAt: 1,
        updatedAt: 2,
      });
      const rsvpId = await context.db.insert("rsvps", {
        eventId,
        clerkUserId: "renamed_person",
        listKey: "main",
        userName: "Jacob Stein",
        status: "approved",
        shareContact: false,
        smsConsent: true,
        createdAt: 1,
        updatedAt: 1,
      });
      await context.db.insert("rsvpSocialProfiles", {
        eventId,
        rsvpId,
        clerkUserId: "renamed_person",
        platformKey: "instagram",
        handle: "night.owl",
        normalizedHandle: "night.owl",
        createdAt: 1,
        updatedAt: 1,
      });
      await context.db.insert("userSocialProfiles", {
        clerkUserId: "renamed_person",
        platformKey: "tiktok",
        handle: "contact.level",
        normalizedHandle: "contact.level",
        createdAt: 1,
        updatedAt: 2,
      });
      await syncContactRsvp(context, rsvpId);
    });

    const currentNameResult = await host.query(api.contacts.list, {
      ...scope,
      searchText: "Current Profile",
    });
    const historicalNameResult = await host.query(api.contacts.list, {
      ...scope,
      searchText: "Jacob Stein",
    });
    const socialHandleResult = await host.query(api.contacts.list, {
      ...scope,
      searchText: "@night.owl",
    });
    expect(currentNameResult.people.map((person) => person.name)).toEqual(["Current Profile"]);
    expect(historicalNameResult.people.map((person) => person.name)).toEqual(["Current Profile"]);
    expect(socialHandleResult.people.map((person) => person.name)).toEqual(["Current Profile"]);
    expect(
      (await host.query(api.contacts.list, { ...scope, searchText: "j_a_c" })).people.map(
        (person) => person.name,
      ),
    ).toEqual(["Current Profile"]);
    expect(
      (await host.query(api.contacts.list, { ...scope, searchText: "curr" })).people.map(
        (person) => person.name,
      ),
    ).toEqual(["Current Profile"]);
    expect(
      (await host.query(api.contacts.list, { ...scope, searchText: "cont" })).people.map(
        (person) => person.name,
      ),
    ).toEqual(["Current Profile"]);
    expect(
      (await host.query(api.contacts.list, { ...scope, searchText: "tact.l" })).people.map(
        (person) => person.name,
      ),
    ).toEqual(["Current Profile"]);
    expect(
      (await host.query(api.contacts.list, { ...scope, searchText: "ight.o" })).people.map(
        (person) => person.name,
      ),
    ).toEqual(["Current Profile"]);
  });

  it("deduplicates guest/account phones and preserves annotations and selected aliases after an identity merge", async () => {
    const { backend, host, workspaceId } = await setup();
    const phone = await normalizeAndHashPhoneNumber("+14155550102");
    const retiredId = await backend.run(async (context) => {
      const canonicalUserId = await context.db.insert("users", {
        clerkUserId: "account",
        firstName: "Account",
        phone: "+14155550102",
        createdAt: 1,
        updatedAt: 1,
      });
      await context.db.insert("guestContacts", {
        phoneHash: phone.phoneHash,
        phoneNumber: phone.normalizedPhoneNumber,
        createdAt: 1,
        updatedAt: 1,
      });
      await context.db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "old_account",
        notes: "Keep this note",
        tags: ["friend"],
        createdAt: 1,
        updatedAt: 1,
      });
      const oldContact = await ensureContact(context, workspaceId, {
        clerkUserId: "old_account",
        name: "Old Account",
      });
      const guest = await ensureContact(context, workspaceId, {
        clerkUserId: `guest:${phone.phoneHash}`,
        guestPhoneHash: phone.phoneHash,
        name: "Guest",
      });
      const account = await ensureContact(context, workspaceId, { clerkUserId: "account" });
      expect(account._id).toBe(guest._id);
      await context.db.insert("userIdentityAliases", {
        aliasClerkUserId: "old_account",
        canonicalClerkUserId: "account",
        canonicalUserId,
        createdAt: 1,
        updatedAt: 1,
      });
      const merged = await ensureContact(context, workspaceId, { clerkUserId: "old_account" });
      await refreshContactProfile(context, merged._id);
      return oldContact._id;
    });
    const result = await host.query(api.contacts.list, scope);
    expect(result.people).toHaveLength(1);
    expect(result.people[0].notes).toBe("Keep this note");
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: { type: "contacts", contactIds: [retiredId, result.people[0].contactId] },
    });
    const preview = await finishPreview(backend, previewId);
    expect(preview?.excludedCount).toBe(1);
    expect(preview?.eligibleCount).toBe(0);
  });

  it("does not interpret an empty selection as everybody; reports unique exclusions and isolates workspaces", async () => {
    const { backend, host, workspaceId } = await setup();
    await expect(
      host.mutation(api.contactAudiences.prepare, {
        ...scope,
        audience: { type: "contacts", contactIds: [] },
      }),
    ).rejects.toThrow("Select contacts");
    const reachable = await seedContact(backend, workspaceId);
    const missingPhone = await seedContact(backend, workspaceId, {
      personKey: "user:no_phone",
      phoneHash: undefined,
      phoneNumber: undefined,
      name: "No phone",
    });
    const noConsent = await seedContact(backend, workspaceId, {
      personKey: "phone:no_consent",
      phoneHash: "no_consent",
      smsConsent: false,
    });
    const optedOut = await seedContact(backend, workspaceId, {
      personKey: "phone:opted",
      phoneHash: "opted",
    });
    await backend.run(({ db }) =>
      db.insert("smsOptOuts", { phoneNumber: "opted", optedOutAt: 1, reason: "user_request" }),
    );
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: {
        type: "contacts",
        contactIds: [reachable, missingPhone, noConsent, optedOut, missingPhone],
      },
    });
    const preview = await finishPreview(backend, previewId);
    expect(preview).toMatchObject({
      status: "ready",
      eligibleCount: 1,
      excludedCount: 3,
      exclusionCounts: { missing_phone: 1, no_consent: 1, opted_out: 1 },
    });
    const foreignWorkspace = await backend.run(({ db }) =>
      db.insert("workspaces", { slug: "foreign", name: "Foreign", createdAt: 1, updatedAt: 1 }),
    );
    const foreignContact = await seedContact(backend, foreignWorkspace);
    await expect(
      host.query(api.contacts.history, { ...scope, contactId: foreignContact }),
    ).rejects.toThrow("Contact not found");
    const foreignPreview = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: { type: "contacts", contactIds: [foreignContact] },
    });
    expect((await finishPreview(backend, foreignPreview))?.status).toBe("failed");
  });

  it("uses workspace consent and rechecks changed consent and phones against the reviewed snapshot", async () => {
    const { backend, host, workspaceId } = await setup();
    const contactId = await seedContact(backend, workspaceId);
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: { type: "contacts", contactIds: [contactId] },
    });
    await finishPreview(backend, previewId);
    const blastId = await host.mutation(api.contactBlasts.save, {
      ...scope,
      name: "General",
      message: "Hello {{firstName}}",
      audience: { type: "contacts", contactIds: [contactId] },
      previewId,
      includeQrCodes: false,
    });
    expect(await backend.run(({ db }) => db.get(blastId))).toMatchObject({ workspaceId });
    expect((await backend.run(({ db }) => db.get(blastId)))?.eventId).toBeUndefined();
    await backend.run(({ db }) =>
      db.insert("userSmsOrganizerPreferences", {
        clerkUserId: "guest:test",
        organizerKey: `workspace:${workspaceId}`,
        smsConsent: false,
        createdAt: 2,
        updatedAt: 2,
      }),
    );
    expect(
      await backend.query(internal.contactBlasts.recheckDelivery, { contactId, phoneHash: "test" }),
    ).toBe(false);
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    const member = await backend.run(({ db }) => db.query("contactAudienceMembers").first());
    if (!member) throw new Error("Missing snapshot member");
    const prepared = await backend.mutation(internal.contactBlasts.prepareDelivery, {
      blastId,
      memberId: member._id,
      sendAttempt: 1,
    });
    expect(prepared.type === "prepared" && prepared.exclusion).toBeTruthy();
    expect(
      (
        await backend.mutation(internal.contactBlasts.prepareDelivery, {
          blastId,
          memberId: member._id,
          sendAttempt: 1,
        })
      ).type,
    ).toBe("uncertain");
    expect(deliverMessage).not.toHaveBeenCalled();
  });

  it("requires an event for event variables and excludes people without tickets from QR previews", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    const contactId = await seedContact(backend, workspaceId);
    const audience = { type: "contacts" as const, contactIds: [contactId] };
    await expect(
      host.mutation(api.contactBlasts.save, {
        ...scope,
        name: "Event",
        message: "{{eventName}}",
        audience,
        includeQrCodes: false,
      }),
    ).rejects.toThrow("Choose a message event");
    await expect(
      host.mutation(api.contactAudiences.prepare, { ...scope, audience, includeQrCodes: true }),
    ).rejects.toThrow("Choose a message event");
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience,
      messageEventId: eventId,
      includeQrCodes: true,
    });
    expect(await finishPreview(backend, previewId)).toMatchObject({
      eligibleCount: 0,
      excludedCount: 1,
      exclusionCounts: { missing_ticket: 1 },
    });
  });

  it("keeps the correct ticket owner after phone deduplication and rechecks disabled tickets", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    const contactId = await seedContact(backend, workspaceId, {
      clerkUserIds: ["guest:no-ticket", "guest:ticket-owner"],
    });
    const redemptionId = await backend.run(async ({ db }) => {
      await db.insert("rsvps", {
        eventId,
        clerkUserId: "guest:ticket-owner",
        listKey: "main",
        userName: "Ada",
        status: "approved",
        shareContact: false,
        smsConsent: true,
        createdAt: 1,
        updatedAt: 1,
      });
      return db.insert("redemptions", {
        eventId,
        clerkUserId: "guest:ticket-owner",
        listKey: "main",
        code: "reviewed-ticket",
        createdAt: 1,
        unredeemHistory: [],
      });
    });
    const audience = { type: "contacts" as const, contactIds: [contactId] };
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience,
      messageEventId: eventId,
      includeQrCodes: true,
    });
    expect(await finishPreview(backend, previewId)).toMatchObject({
      eligibleCount: 1,
      excludedCount: 0,
      status: "ready",
    });
    const blastId = await host.mutation(api.contactBlasts.save, {
      ...scope,
      audience,
      previewId,
      messageEventId: eventId,
      includeQrCodes: true,
      name: "Tickets",
      message: "{{qrCodeUrl}}",
    });
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    const member = await backend.run(({ db }) => db.query("contactAudienceMembers").first());
    if (!member) throw new Error("Missing snapshot member");
    const prepared = await backend.mutation(internal.contactBlasts.prepareDelivery, {
      blastId,
      memberId: member._id,
      sendAttempt: 1,
    });
    expect(prepared.type === "prepared" && prepared.redemptionClerkUserId).toBe(
      "guest:ticket-owner",
    );
    expect(
      await backend.query(internal.contactBlasts.recheckDelivery, {
        contactId,
        phoneHash: "test",
        messageEventId: eventId,
        includeQrCodes: true,
        redemptionCode: "reviewed-ticket",
      }),
    ).toBe(true);
    await backend.run(({ db }) => db.patch(redemptionId, { disabledAt: Date.now() }));
    expect(
      await backend.query(internal.contactBlasts.recheckDelivery, {
        contactId,
        phoneHash: "test",
        messageEventId: eventId,
        includeQrCodes: true,
        redemptionCode: "reviewed-ticket",
      }),
    ).toBe(false);
    expect(deliverMessage).not.toHaveBeenCalled();
  });

  it("exposes backfill/error state explicitly instead of returning an empty ready directory", async () => {
    const { backend, host, stateId } = await setup();
    await backend.run(({ db }) =>
      db.patch(stateId, { status: "failed", error: "Retry this batch" }),
    );
    expect(await host.query(api.contacts.list, scope)).toMatchObject({
      directoryStatus: "failed",
      isDone: false,
    });
    await host.mutation(api.contactSync.startBackfill, scope);
    expect(await host.query(api.contacts.list, scope)).toMatchObject({
      directoryStatus: "building",
      isDone: false,
    });
  });

  it("backfills in resumable batches and keeps counts correct when RSVP records change", async () => {
    const { backend, host, workspaceId, eventId, stateId } = await setup();
    const rsvpIds = await backend.run(async ({ db }) => {
      const identifiers: Id<"rsvps">[] = [];
      for (let position = 0; position < 95; position++)
        identifiers.push(
          await db.insert("rsvps", {
            eventId,
            clerkUserId: `person_${position}`,
            listKey: "main",
            userName: `Person ${position}`,
            shareContact: false,
            smsConsent: position % 2 === 0,
            status: "pending",
            createdAt: position + 1,
            updatedAt: position + 1,
          }),
        );
      await db.patch(stateId, { status: "failed", phase: "rsvps", processed: 0 });
      await db.insert("workspaceGuestProfiles", {
        workspaceId,
        clerkUserId: "profile_only",
        notes: "A profile without an RSVP",
        createdAt: 1,
        updatedAt: 1,
      });
      return identifiers;
    });
    await host.mutation(api.contactSync.startBackfill, scope);
    await backend.mutation(internal.contactSync.backfillBatch, { stateId });
    expect((await backend.run(({ db }) => db.get(stateId)))?.processed).toBe(40);
    expect((await backend.run(({ db }) => db.get(stateId)))?.status).toBe("building");
    for (let batch = 0; batch < 20; batch++) {
      if ((await backend.run(({ db }) => db.get(stateId)))?.status === "ready") break;
      await backend.mutation(internal.contactSync.backfillBatch, { stateId });
    }
    expect((await backend.run(({ db }) => db.get(stateId)))?.status).toBe("ready");
    expect(await backend.run(({ db }) => db.query("workspaceContacts").collect())).toHaveLength(96);
    await host.mutation(api.contactSync.startBackfill, scope);
    await backend.mutation(internal.contactSync.syncRsvp, { rsvpId: rsvpIds[0] });
    await backend.mutation(internal.contactSync.syncRsvp, { rsvpId: rsvpIds[0] });
    const relationship = await backend.run(({ db }) =>
      db
        .query("contactEvents")
        .withIndex("by_rsvp", (builder) => builder.eq("rsvpId", rsvpIds[0]))
        .first(),
    );
    if (!relationship) throw new Error("Missing backfilled relationship");
    expect((await backend.run(({ db }) => db.get(relationship.contactId)))?.eventCount).toBe(1);
    await backend.run(({ db }) => db.delete(rsvpIds[0]));
    await backend.mutation(internal.contactSync.syncRsvp, { rsvpId: rsvpIds[0] });
    expect(await backend.run(({ db }) => db.get(relationship.contactId))).toMatchObject({
      eventCount: 0,
      smsConsent: false,
      firstRsvpAt: 0,
      latestRsvpAt: 0,
    });
  });

  it("searches the complete indexed contact directory and invalidates mismatched previews", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    for (let position = 0; position < 45; position++)
      await seedContact(backend, workspaceId, {
        personKey: `phone:${position}`,
        phoneHash: `${position}`,
        name: `Name ${position}`,
        normalizedName: `name ${String(position).padStart(2, "0")}`,
        searchText:
          position === 44
            ? "zelda jacob +14155550144 14155550144 friend met at dinner invited by casey"
            : `name ${position}`,
        tags: position === 44 ? ["friend"] : [],
        notes: position === 44 ? "Met at dinner" : undefined,
      });
    const filters = {
      searchText: "(415) 555-0144",
      tags: ["friend"],
      smsConsentFilter: "consented" as const,
    };
    const page = await host.query(api.contacts.list, { ...scope, ...filters });
    expect(page.people.map((person) => person.name)).toEqual(["Name 44"]);
    expect(page.nextCursor).toBeNull();
    const nameSearchPage = await host.query(api.contacts.list, {
      ...scope,
      searchText: "Jacob",
    });
    expect(nameSearchPage.people.map((person) => person.name)).toEqual(["Name 44"]);
    expect(nameSearchPage.nextCursor).toBeNull();
    const combinedSearchPage = await host.query(api.contacts.list, {
      ...scope,
      searchText: "dinner casey",
    });
    expect(combinedSearchPage.people.map((person) => person.name)).toEqual(["Name 44"]);
    const audience = { type: "filter" as const, filters: { searchText: "dinner casey" } };
    const previewId = await host.mutation(api.contactAudiences.prepare, { ...scope, audience });
    expect(await finishPreview(backend, previewId)).toMatchObject({
      eligibleCount: 1,
      status: "ready",
    });
    await expect(
      host.mutation(api.contactBlasts.save, {
        ...scope,
        name: "Changed",
        message: "Hello",
        audience,
        previewId,
        messageEventId: eventId,
        includeQrCodes: false,
      }),
    ).rejects.toThrow("Prepare a new audience preview");
    await expect(
      host.mutation(api.contactBlasts.save, {
        ...scope,
        name: "Changed",
        message: "Hello",
        audience: { type: "filter", filters: {} },
        previewId,
        includeQrCodes: false,
      }),
    ).rejects.toThrow("Prepare a new audience preview");
  });

  it("fills a filtered UI page across internal candidate batches", async () => {
    const { backend, host, workspaceId } = await setup();
    for (let position = 0; position < 95; position++)
      await seedContact(backend, workspaceId, {
        personKey: `phone:sparse-${position}`,
        phoneHash: `sparse-${position}`,
        name: `Sparse ${String(position).padStart(2, "0")}`,
        normalizedName: `sparse ${String(position).padStart(2, "0")}`,
        searchText: `sparse ${position}`,
        smsConsent: position >= 80,
      });

    const page = await host.query(api.contacts.list, {
      ...scope,
      pageSize: 20,
      smsConsentFilter: "consented",
    });

    expect(page.people).toHaveLength(15);
    expect(page.people[0].name).toBe("Sparse 80");
    expect(page.people[14].name).toBe("Sparse 94");
    expect(page.nextCursor).toBeNull();
    expect(page.isDone).toBe(true);
  });

  it("sends an eventless snapshot through the workspace sender and never resends a successful delivery", async () => {
    vi.stubEnv("DEV_TWILIO_ENABLED", "true");
    const { backend, host, workspaceId } = await setup();
    await backend.run(({ db }) =>
      db.insert("twilioCredentials", {
        workspaceId,
        accountSid: "AC00000000000000000000000000000001",
        authToken: "test-token",
        fromPhoneNumber: "+14155550999",
        updatedByClerkUserId: "host",
        createdAt: 1,
        updatedAt: 1,
      }),
    );
    const contactId = await seedContact(backend, workspaceId);
    const audience = { type: "contacts" as const, contactIds: [contactId] };
    const previewId = await host.mutation(api.contactAudiences.prepare, { ...scope, audience });
    await finishPreview(backend, previewId);
    const blastId = await host.mutation(api.contactBlasts.save, {
      ...scope,
      name: "General",
      message: "Hello {{firstName}}",
      audience,
      previewId,
      includeQrCodes: false,
    });
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    await backend.action(internal.contactBlasts.sendBatch, { blastId, sendAttempt: 1 });
    expect(deliverMessage).toHaveBeenCalledOnce();
    expect(deliverMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "+14155550999",
        to: "+14155550101",
        body: expect.stringContaining("Hello Ada"),
      }),
    );
    expect(await backend.run(({ db }) => db.get(blastId))).toMatchObject({
      status: "sent",
      sentCount: 1,
      failedCount: 0,
    });
    const delivery = await backend.run(({ db }) => db.query("textBlastRecipients").first());
    const thread = await backend.run(({ db }) => db.query("smsConversationThreads").first());
    expect(thread?.workspaceId).toBe(workspaceId);
    expect(thread?.eventId).toBeUndefined();
    if (!delivery) throw new Error("Missing delivery");
    await backend.mutation(internal.contactSync.syncDelivery, { deliveryId: delivery._id });
    await backend.mutation(internal.contactSync.syncDelivery, { deliveryId: delivery._id });
    expect((await backend.run(({ db }) => db.get(contactId)))?.receivedTextCount).toBe(1);
    // Delivery history belongs to the contact even after their phone changes.
    await backend.run(({ db }) =>
      db.patch(contactId, { phoneHash: "changed", phoneNumber: "+14155550199" }),
    );
    const history = await host.query(api.contacts.messageHistory, { ...scope, contactId });
    expect(history.page).toHaveLength(1);
    const filtered = await host.query(api.contacts.list, {
      ...scope,
      recipientHistoryFilter: { type: "received_any", textBlastIds: [blastId] },
    });
    expect(filtered.people.map((person) => person.contactId)).toEqual([contactId]);
    // Simulate an interruption after provider success but before the send job checkpoint.
    await backend.run(({ db }) => db.patch(blastId, { status: "failed" }));
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    await backend.action(internal.contactBlasts.sendBatch, { blastId, sendAttempt: 2 });
    expect(deliverMessage).toHaveBeenCalledOnce();
    expect((await backend.run(({ db }) => db.get(blastId)))?.sentCount).toBe(1);
  });

  it("resumes long contact histories without losing matches, order, or legacy RSVP constraints", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    const contactId = await seedContact(backend, workspaceId, { eventCount: 1 });
    const rsvpIds = await backend.run(async ({ db }) => {
      const identifiers: Id<"rsvps">[] = [];
      for (let position = 0; position < 85; position++) {
        const rsvpId = await db.insert("rsvps", {
          eventId,
          clerkUserId: `guest:history-${position}`,
          listKey: "vip",
          userName: "Ada",
          status: "approved",
          shareContact: false,
          smsConsent: true,
          createdAt: position,
          updatedAt: position,
        });
        identifiers.push(rsvpId);
        await db.insert("contactEvents", {
          workspaceId,
          contactId,
          eventId,
          rsvpId,
          clerkUserId: `guest:history-${position}`,
          eventName: "Dojo",
          eventDate: position,
          listKey: "vip",
          approvalStatus: "approved",
          rsvpCreatedAt: position,
          smsConsent: true,
          consentUpdatedAt: position,
          hasAttended: false,
          hasApprovalSms: false,
          hasQrCode: false,
          customFieldKeys: ["answer"],
          missingCustomFieldKeys: position === 84 ? ["answer"] : [],
        });
      }
      return identifiers;
    });
    const recipientFilter = JSON.stringify({ type: "custom_field_missing", fieldKey: "answer" });
    let cursor: string | undefined;
    let found = false;
    for (let iteration = 0; iteration < 5; iteration++) {
      const result = await host.query(api.contacts.list, {
        ...scope,
        eventIds: [eventId],
        recipientFilter,
        cursor,
      });
      found ||= result.people.some((person) => person.contactId === contactId);
      if (result.isDone) break;
      cursor = result.nextCursor ?? undefined;
    }
    expect(found).toBe(true);
    let historyCursor: string | undefined;
    const historyIds: Id<"rsvps">[] = [];
    do {
      const history = await host.query(api.contacts.history, {
        ...scope,
        contactId,
        cursor: historyCursor,
      });
      historyIds.push(...history.page.map((entry) => entry.rsvpId));
      historyCursor = history.nextCursor ?? undefined;
    } while (historyCursor);
    expect(new Set(historyIds).size).toBe(85);
    const legacyAudience = {
      type: "legacy_events" as const,
      eventIds: [eventId],
      targetLists: ["vip"],
      selectedRsvpIds: [rsvpIds[0]],
      recipientFilter,
    };
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: legacyAudience,
    });
    // The selected RSVP has the field filled in. A different RSVP cannot make it match.
    expect(await finishPreview(backend, previewId)).toMatchObject({
      status: "ready",
      eligibleCount: 0,
    });
  });

  it("preserves retired RSVP selections and excludes other contacts from legacy drafts", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    const retiredRsvpId = await backend.run(async (context) => {
      const phone = await normalizeAndHashPhoneNumber("+14155550188");
      await context.db.insert("guestContacts", {
        phoneHash: phone.phoneHash,
        phoneNumber: phone.normalizedPhoneNumber,
        createdAt: 1,
        updatedAt: 1,
      });
      const rsvp = {
        eventId,
        clerkUserId: `guest:${phone.phoneHash}`,
        listKey: "main",
        userName: "Claimed guest",
        status: "approved",
        shareContact: false,
        smsConsent: true,
        createdAt: 1,
        updatedAt: 1,
      };
      const retired = await context.db.insert("rsvps", rsvp);
      const canonical = await context.db.insert("rsvps", rsvp);
      await context.db.delete(retired);
      await context.db.insert("rsvpIdentityAliases", {
        retiredRsvpId: retired,
        canonicalRsvpId: canonical,
        retiredClerkUserId: "retired",
        canonicalClerkUserId: rsvp.clerkUserId,
        createdAt: 1,
        updatedAt: 1,
      });
      await syncContactRsvp(context, canonical);
      return retired;
    });
    await seedContact(backend, workspaceId);
    const previewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: {
        type: "legacy_events",
        eventIds: [eventId],
        targetLists: ["main"],
        selectedRsvpIds: [retiredRsvpId],
      },
    });
    expect(await finishPreview(backend, previewId)).toMatchObject({
      status: "ready",
      eligibleCount: 1,
      excludedCount: 0,
    });
  });

  it("leases send batches exclusively and makes interrupted jobs retryable", async () => {
    const { backend, host, workspaceId } = await setup();
    const contactId = await seedContact(backend, workspaceId);
    const audience = { type: "contacts" as const, contactIds: [contactId] };
    const previewId = await host.mutation(api.contactAudiences.prepare, { ...scope, audience });
    await finishPreview(backend, previewId);
    const blastId = await host.mutation(api.contactBlasts.save, {
      ...scope,
      audience,
      previewId,
      name: "Lease",
      message: "Hello",
      includeQrCodes: false,
    });
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    expect(
      await backend.mutation(internal.contactBlasts.claimSendBatch, {
        blastId,
        sendAttempt: 1,
        leaseToken: "first",
      }),
    ).toBe(true);
    expect(
      await backend.mutation(internal.contactBlasts.claimSendBatch, {
        blastId,
        sendAttempt: 1,
        leaseToken: "second",
      }),
    ).toBe(false);
    await backend.mutation(internal.contactBlasts.expireSendLease, {
      blastId,
      sendAttempt: 1,
      leaseToken: "first",
    });
    expect((await backend.run(({ db }) => db.get(blastId)))?.status).toBe("sending");
    vi.setSystemTime(Date.now() + 720001);
    await backend.mutation(internal.contactBlasts.expireSendLease, {
      blastId,
      sendAttempt: 1,
      leaseToken: "first",
    });
    expect((await backend.run(({ db }) => db.get(blastId)))?.status).toBe("failed");
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    expect(
      await backend.mutation(internal.contactBlasts.claimSendBatch, {
        blastId,
        sendAttempt: 1,
        leaseToken: "stale",
      }),
    ).toBe(false);
    expect(
      await backend.mutation(internal.contactBlasts.claimSendBatch, {
        blastId,
        sendAttempt: 2,
        leaseToken: "retry",
      }),
    ).toBe(true);
    expect(deliverMessage).not.toHaveBeenCalled();
  });

  it("keeps directory, filtering, preview, and send preparation bounded with 4,200 contacts and 33,600 RSVPs", async () => {
    const { backend, host, workspaceId, eventId } = await setup();
    const eventIds = await backend.run(async ({ db }) => {
      const identifiers = [eventId];
      for (let position = 1; position < 8; position++)
        identifiers.push(
          await db.insert("events", {
            workspaceSlug: scope.workspaceSlug,
            name: `Event ${position}`,
            eventDate: position,
            location: "Dojo",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          }),
        );
      return identifiers;
    });
    for (let start = 0; start < 4200; start += 200) {
      await backend.run(async ({ db }) => {
        for (let position = start; position < start + 200; position++) {
          const name = `Contact ${String(position).padStart(4, "0")}`;
          const phoneHash = `scale-${position}`;
          const contactId = await db.insert("workspaceContacts", {
            workspaceId,
            personKey: `phone:${phoneHash}`,
            phoneHash,
            phoneNumber: `+141555${String(position).padStart(5, "0")}`,
            clerkUserIds: [],
            name,
            normalizedName: name.toLowerCase(),
            searchText: name.toLowerCase(),
            tags: [],
            invitedByNames: [],
            smsConsent: true,
            consentUpdatedAt: 1,
            hasOptedOut: false,
            eventCount: 8,
            eventsAttendedCount: 0,
            receivedTextCount: 0,
            firstRsvpAt: 1,
            latestRsvpAt: 8,
            createdAt: 1,
            updatedAt: 1,
          });
          for (const [eventPosition, selectedEventId] of eventIds.entries()) {
            const rsvpId = await db.insert("rsvps", {
              eventId: selectedEventId,
              clerkUserId: phoneHash,
              listKey: eventPosition % 2 ? "vip" : "main",
              userName: name,
              status: "approved",
              shareContact: false,
              smsConsent: true,
              createdAt: eventPosition,
              updatedAt: eventPosition,
            });
            await db.insert("contactEvents", {
              workspaceId,
              contactId,
              eventId: selectedEventId,
              rsvpId,
              clerkUserId: phoneHash,
              eventName: `Event ${eventPosition}`,
              eventDate: eventPosition,
              listKey: eventPosition % 2 ? "vip" : "main",
              approvalStatus: "approved",
              rsvpCreatedAt: eventPosition,
              smsConsent: true,
              consentUpdatedAt: 1,
              hasAttended: false,
              hasApprovalSms: false,
              hasQrCode: false,
              customFieldKeys: [],
              missingCustomFieldKeys: [],
            });
          }
        }
      });
    }
    const first = await host.query(api.contacts.list, scope);
    expect(first.people).toHaveLength(20);
    expect(first.people[0].name).toBe("Contact 0000");
    expect(first.people[0].eventCount).toBe(8);
    expect(first.people[0].events).toHaveLength(3);
    expect(first.people[0].phoneObfuscated).not.toBe("+14155500000");
    const second = await host.query(api.contacts.list, {
      ...scope,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.people[0].name).toBe("Contact 0020");
    await backend.run(async (context) => {
      const measured = countReads(context);
      const result = await readContactPage(measured.context, {
        workspaceId,
        ...scope,
        filters: { eventIds: [eventIds[7]], listKeys: ["vip"], smsConsentFilter: "consented" },
      });
      expect(result.contacts).toHaveLength(20);
      expect(measured.usage.operations).toBeLessThan(1000);
      expect(measured.usage.documents).toBeLessThan(1000);
      expect(measured.usage.unboundedCollections).toBe(0);
    });
    const audience = { type: "filter" as const, filters: { searchText: "contact" } };
    const previewId = await host.mutation(api.contactAudiences.prepare, { ...scope, audience });
    const prepareHandler = (
      prepareBatch as unknown as {
        _handler: (
          context: MutationCtx,
          args: { previewId: Id<"contactAudiencePreviews"> },
        ) => Promise<void>;
      }
    )._handler;
    let preview = await backend.run(({ db }) => db.get(previewId));
    let batches = 0;
    while (preview?.status === "building" && batches < 2) {
      await backend.run(async (context) => {
        const measured = countReads(context);
        await prepareHandler(
          { ...context, db: measured.context.db as MutationCtx["db"] },
          { previewId },
        );
        expect(measured.usage.operations).toBeLessThan(1000);
        expect(measured.usage.documents).toBeLessThan(1000);
        expect(measured.usage.unboundedCollections).toBe(0);
      });
      preview = await backend.run(({ db }) => db.get(previewId));
      if (++batches > 200) throw new Error("Preview failed to make progress");
    }
    expect(preview).toMatchObject({ status: "building", eligibleCount: 80, excludedCount: 0 });
    expect(preview?.cursor).toBeTruthy();
    const sendAudience = {
      type: "contacts" as const,
      contactIds: first.people.map((person) => person.contactId),
    };
    const sendPreviewId = await host.mutation(api.contactAudiences.prepare, {
      ...scope,
      audience: sendAudience,
    });
    expect(await finishPreview(backend, sendPreviewId)).toMatchObject({
      status: "ready",
      eligibleCount: 20,
    });
    const blastId = await host.mutation(api.contactBlasts.save, {
      ...scope,
      name: "Scale",
      message: "Hello",
      audience: sendAudience,
      previewId: sendPreviewId,
      includeQrCodes: false,
    });
    await host.mutation(api.contactBlasts.send, { ...scope, blastId });
    const batch = await backend.query(internal.contactBlasts.readSendBatch, {
      blastId,
      sendAttempt: 1,
    });
    expect(batch?.members).toHaveLength(20);
    expect(batch?.nextCursor).toBeTruthy();
    expect(deliverMessage).not.toHaveBeenCalled();
  }, 90000);
});
