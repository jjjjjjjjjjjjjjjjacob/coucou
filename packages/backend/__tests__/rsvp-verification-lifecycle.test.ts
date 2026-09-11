import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { issueListAccess } from "../convex/lib/listAccess";
import { normalizeAndHashPhoneNumber } from "../convex/lib/phoneHash";
import schema from "../convex/schema";

const clerkUserLookup = vi.hoisted(() => vi.fn());
vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { getUser: clerkUserLookup } }),
}));
vi.mock("svix", () => ({
  Webhook: class {
    verify(payload: string) {
      return JSON.parse(payload);
    }
  },
}));
const modules = import.meta.glob("../convex/**/*.ts");
const aggregateModules = import.meta.glob(
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/**/*.js",
);
const phone = "+13104996272";
let backend: TestConvex<typeof schema>;
let eventId: Id<"events">;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubEnv("DEV_TWILIO_ENABLED", "false");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_mock");
  vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_mock");
  clerkUserLookup.mockReset();
  clerkUserLookup.mockResolvedValue({
    phoneNumbers: [{ phoneNumber: phone, verification: { status: "verified" } }],
  });
  backend = convexTest(schema, modules);
  backend.registerComponent("rsvpAggregate", aggregateComponentSchema, aggregateModules);
  eventId = await backend.run(async (context) => {
    const event = await context.db.insert("events", {
      siteKey: "dojo",
      name: "Dojo Night",
      hosts: ["Dojo Pomodoro"],
      location: "Main Room",
      status: "active",
      eventDate: Date.now() + 86400000,
      maxAttendees: 2,
      rsvpConfirmationMessage: "Your RSVP is submitted.",
      rsvpConfirmationMessageEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await context.db.insert("listCredentials", {
      eventId: event,
      listKey: "ga",
      password: "",
      createdAt: Date.now(),
    });
    return event;
  });
});
afterEach(async () => {
  await backend.finishAllScheduledFunctions(vi.runAllTimers);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
function submission() {
  return {
    eventId,
    siteKey: "dojo",
    listKey: "ga",
    firstName: "Ava",
    lastName: "Green",
    phone,
    shareContact: true,
    smsConsent: true,
    attendees: 2,
    note: "Arriving late",
    customFields: {},
    socialProfiles: [],
  };
}
async function submissionWithAccess() {
  const accessToken = await backend.run(async (context) => {
    const listCredential = await context.db.query("listCredentials").unique();
    if (!listCredential) throw new Error("Expected list credential");
    const access = await issueListAccess(context, listCredential, "no-password");
    if (!access.ok) throw new Error("Expected list access grant");
    return access.accessToken;
  });
  return { ...submission(), accessToken };
}
const authenticated = () => backend.withIdentity({ subject: "verified_guest" });
async function scheduledConfirmations() {
  return await backend.run(async (context) =>
    (await context.db.system.query("_scheduled_functions").collect()).filter(
      (scheduled) => scheduled.name === "notifications:sendRsvpConfirmationSms",
    ),
  );
}
async function accountState() {
  return await backend.run(async (context) => ({
    users: await context.db.query("users").collect(),
    rsvps: await context.db.query("rsvps").collect(),
    preferences: await context.db.query("userSmsOrganizerPreferences").collect(),
  }));
}

describe("verified RSVP completion", () => {
  it("saves only a draft before authentication, then finalizes once with a Clerk-verified phone", async () => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    expect(await accountState()).toEqual({ users: [], rsvps: [], preferences: [] });
    expect(await scheduledConfirmations()).toHaveLength(0);
    const scheduledBeforeAuth = await backend.run(
      async (context) => await context.db.system.query("_scheduled_functions").collect(),
    );
    expect(scheduledBeforeAuth).toHaveLength(0);
    expect(
      await backend.query(api.rsvps.resolveGuestRsvpHandoff, { token: draft.rsvpHandoffToken }),
    ).toMatchObject({ phoneNumber: phone, canAutoSendCode: true });
    const completed = await authenticated().action(api.rsvps.finalizeGuestRequest, {
      token: draft.rsvpHandoffToken,
    });
    expect(clerkUserLookup).toHaveBeenCalledWith("verified_guest");
    const state = await accountState();
    expect(state.users).toHaveLength(1);
    expect(state.rsvps).toHaveLength(1);
    expect(state.rsvps[0]).toMatchObject({
      clerkUserId: "verified_guest",
      listKey: "ga",
      note: "Arriving late",
      attendees: 2,
      smsConsent: true,
    });
    expect(await scheduledConfirmations()).toHaveLength(1);
    expect(
      await authenticated().action(api.rsvps.finalizeGuestRequest, {
        token: draft.rsvpHandoffToken,
      }),
    ).toEqual(completed);
    expect((await accountState()).rsvps).toHaveLength(1);
    expect(await scheduledConfirmations()).toHaveLength(1);
    const handoff = await backend.run(
      async (context) => await context.db.query("rsvpGuestHandoffs").unique(),
    );
    expect(handoff?.submission).toBeUndefined();
    expect(handoff?.usedAt).toBeDefined();
  });
  it("does not finalize unauthenticated or unverified requests, including a matching editable profile phone", async () => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    await expect(
      backend.action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken }),
    ).rejects.toThrow("verify your phone");
    clerkUserLookup.mockResolvedValue({
      phoneNumbers: [{ phoneNumber: phone, verification: { status: "unverified" } }],
    });
    await backend.run(async (context) => {
      await context.db.insert("users", {
        clerkUserId: "verified_guest",
        phone,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await expect(
      authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken }),
    ).rejects.toThrow("phone number on your RSVP");
    expect((await accountState()).rsvps).toHaveLength(0);
    expect(await scheduledConfirmations()).toHaveLength(0);
  });
  it("rejects a verified different phone without consuming the draft", async () => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    clerkUserLookup.mockResolvedValueOnce({
      phoneNumbers: [{ phoneNumber: "+12025550123", verification: { status: "verified" } }],
    });
    await expect(
      authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken }),
    ).rejects.toThrow("phone number on your RSVP");
    expect(await accountState()).toEqual({ users: [], rsvps: [], preferences: [] });
    await authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken });
    expect((await accountState()).rsvps).toHaveLength(1);
  });
  it.each([
    "expired",
    "closed",
    "missing-list",
  ])("rejects a %s draft without confirming", async (condition) => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    await backend.run(async (context) => {
      if (condition === "expired") {
        const stored = await context.db.query("rsvpGuestHandoffs").unique();
        if (stored) await context.db.patch(stored._id, { expiresAt: Date.now() - 1 });
      } else if (condition === "closed")
        await context.db.patch(eventId, { eventEndDate: Date.now() - 1 });
      else {
        const list = await context.db.query("listCredentials").unique();
        if (list) await context.db.delete(list._id);
      }
    });
    await expect(
      authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken }),
    ).rejects.toThrow();
    expect(await accountState()).toEqual({ users: [], rsvps: [], preferences: [] });
    expect(await scheduledConfirmations()).toHaveLength(0);
  });
  it("does not send a confirmation without fresh SMS consent", async () => {
    const draft = await backend.mutation(api.rsvps.prepareGuestRequest, {
      ...(await submissionWithAccess()),
      smsConsent: false,
    });
    await authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken });
    expect((await accountState()).rsvps[0]?.smsConsent).toBe(false);
    expect(await scheduledConfirmations()).toHaveLength(0);
  });
});

describe("Clerk account deletion", () => {
  it("clears account and former guest consent, RSVPs and unfinished drafts and permits fresh signup", async () => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    await authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken });
    await backend.mutation(api.rsvps.prepareGuestRequest, await submissionWithAccess());
    const { phoneHash } = await normalizeAndHashPhoneNumber(phone);
    await backend.run(async (context) => {
      const preference = await context.db.query("userSmsOrganizerPreferences").first();
      if (!preference) throw new Error("Expected consent preference");
      const { _id, _creationTime, ...fields } = preference;
      await context.db.insert("userSmsOrganizerPreferences", {
        ...fields,
        clerkUserId: `guest:${phoneHash}`,
      });
    });
    await backend.mutation(internal.users.deleteFromClerk, { clerkUserId: "verified_guest" });
    await backend.mutation(internal.users.deleteFromClerk, { clerkUserId: "verified_guest" });
    expect(await accountState()).toEqual({ users: [], rsvps: [], preferences: [] });
    expect(
      (await scheduledConfirmations()).every(
        (notification) => notification.state.kind === "canceled",
      ),
    ).toBe(true);
    expect(
      await backend.run(async (context) => await context.db.query("rsvpGuestHandoffs").collect()),
    ).toHaveLength(0);
    const nextDraft = await backend.mutation(api.rsvps.prepareGuestRequest, {
      ...(await submissionWithAccess()),
      smsConsent: false,
    });
    await backend
      .withIdentity({ subject: "new_clerk_account" })
      .action(api.rsvps.finalizeGuestRequest, { token: nextDraft.rsvpHandoffToken });
    expect((await accountState()).rsvps[0]).toMatchObject({
      clerkUserId: "new_clerk_account",
      smsConsent: false,
    });
  });
  it("handles the user.deleted webhook even if the users row was manually removed first", async () => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    await authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken });
    await backend.run(async (context) => {
      const user = await context.db.query("users").unique();
      if (user) await context.db.delete(user._id);
    });
    const response = await backend.fetch("/webhooks/clerk", {
      method: "POST",
      headers: { "svix-id": "test", "svix-timestamp": "test", "svix-signature": "test" },
      body: JSON.stringify({ type: "user.deleted", data: { id: "verified_guest", deleted: true } }),
    });
    expect(response.status).toBe(200);
    expect(await accountState()).toEqual({ users: [], rsvps: [], preferences: [] });
  });
  it("does not erase a different live canonical account when a retired Clerk identity is deleted", async () => {
    const draft = await backend.mutation(
      api.rsvps.prepareGuestRequest,
      await submissionWithAccess(),
    );
    await authenticated().action(api.rsvps.finalizeGuestRequest, { token: draft.rsvpHandoffToken });
    await backend.run(async (context) => {
      const user = await context.db.query("users").unique();
      if (!user) throw new Error("Expected verified user");
      await context.db.insert("userIdentityAliases", {
        aliasClerkUserId: "retired_account",
        canonicalClerkUserId: "verified_guest",
        canonicalUserId: user._id,
        phoneHash: user.phoneHash,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await backend.mutation(internal.users.deleteFromClerk, { clerkUserId: "retired_account" });
    expect((await accountState()).users).toHaveLength(1);
    expect((await accountState()).rsvps).toHaveLength(1);
    expect((await accountState()).preferences[0]?.smsConsent).toBe(true);
  });
});
