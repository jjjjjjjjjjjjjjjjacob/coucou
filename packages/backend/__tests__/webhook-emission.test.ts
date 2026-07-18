import { describe, expect, it } from "bun:test";
import type { Doc } from "../convex/_generated/dataModel";
import {
  determineEventWebhookEventType,
  determineRsvpWebhookEventType,
} from "../convex/lib/webhookEmission";

function buildRsvp(overrides: Partial<Doc<"rsvps">> = {}): Doc<"rsvps"> {
  return {
    _id: "rsvp1",
    _creationTime: 0,
    eventId: "event1",
    clerkUserId: "user_1",
    listKey: "ga",
    status: "pending",
    approvalStatus: "pending",
    shareContact: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Doc<"rsvps">;
}

function buildEvent(overrides: Partial<Doc<"events">> = {}): Doc<"events"> {
  return {
    _id: "event1",
    _creationTime: 0,
    name: "Event",
    location: "Venue",
    eventDate: 0,
    workspaceSlug: "dojo-pomodoro",
    lifecycle: "published",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Doc<"events">;
}

describe("determineRsvpWebhookEventType", () => {
  it("maps inserts and deletes", () => {
    expect(
      determineRsvpWebhookEventType({ operation: "insert", oldDoc: null, newDoc: buildRsvp() }),
    ).toBe("rsvp.created");
    expect(
      determineRsvpWebhookEventType({ operation: "delete", oldDoc: buildRsvp(), newDoc: null }),
    ).toBe("rsvp.deleted");
  });

  it("maps approval transitions ahead of other changes", () => {
    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ approvalStatus: "pending", attendanceStatus: "yes" }),
        newDoc: buildRsvp({
          approvalStatus: "approved",
          status: "approved",
          attendanceStatus: "maybe",
        }),
      }),
    ).toBe("rsvp.approved");

    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp(),
        newDoc: buildRsvp({ approvalStatus: "denied", status: "denied" }),
      }),
    ).toBe("rsvp.denied");
  });

  it("resolves the legacy attending status as approved (no false transitions)", () => {
    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ approvalStatus: undefined, status: "attending" }),
        newDoc: buildRsvp({ approvalStatus: "approved", status: "approved" }),
      }),
    ).toBeNull();
  });

  it("maps attendance changes", () => {
    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ attendanceStatus: "yes" }),
        newDoc: buildRsvp({ attendanceStatus: "no" }),
      }),
    ).toBe("rsvp.attendance_updated");
  });

  it("maps listKey, attendees, name, and guest-claim changes to rsvp.updated", () => {
    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ listKey: "ga" }),
        newDoc: buildRsvp({ listKey: "vip" }),
      }),
    ).toBe("rsvp.updated");

    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ clerkUserId: "guest:abc" }),
        newDoc: buildRsvp({ clerkUserId: "user_real" }),
      }),
    ).toBe("rsvp.updated");
  });

  it("ignores internal-only changes", () => {
    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ ticketStatus: "not-issued", updatedAt: 0 }),
        newDoc: buildRsvp({ ticketStatus: "issued", updatedAt: 5, ticketViewedAt: 5 }),
      }),
    ).toBeNull();

    expect(
      determineRsvpWebhookEventType({
        operation: "update",
        oldDoc: buildRsvp({ smsConsent: false }),
        newDoc: buildRsvp({ smsConsent: true }),
      }),
    ).toBeNull();
  });
});

describe("determineEventWebhookEventType", () => {
  it("maps publish and unpublish transitions", () => {
    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ lifecycle: "draft" }),
        newDoc: buildEvent({ lifecycle: "published" }),
      }),
    ).toBe("event.published");

    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ lifecycle: "published" }),
        newDoc: buildEvent({ lifecycle: "draft" }),
      }),
    ).toBe("event.unpublished");
  });

  it("emits event.published for inserted published events but not drafts", () => {
    expect(
      determineEventWebhookEventType({
        operation: "insert",
        oldDoc: null,
        newDoc: buildEvent({ lifecycle: "published" }),
      }),
    ).toBe("event.published");

    expect(
      determineEventWebhookEventType({
        operation: "insert",
        oldDoc: null,
        newDoc: buildEvent({ lifecycle: "draft" }),
      }),
    ).toBeNull();
  });

  it("maps public-facing field changes to event.updated", () => {
    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ eventDate: 100 }),
        newDoc: buildEvent({ eventDate: 200 }),
      }),
    ).toBe("event.updated");

    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ location: "Old Venue" }),
        newDoc: buildEvent({ location: "New Venue" }),
      }),
    ).toBe("event.updated");
  });

  it("ignores theming/config-only changes and draft edits", () => {
    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ themeBackgroundColor: "#000" }),
        newDoc: buildEvent({ themeBackgroundColor: "#fff", updatedAt: 5 }),
      }),
    ).toBeNull();

    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ lifecycle: "draft", eventDate: 100 }),
        newDoc: buildEvent({ lifecycle: "draft", eventDate: 200 }),
      }),
    ).toBeNull();
  });

  it("treats legacy events without lifecycle as published", () => {
    expect(
      determineEventWebhookEventType({
        operation: "update",
        oldDoc: buildEvent({ lifecycle: undefined, name: "Old" }),
        newDoc: buildEvent({ lifecycle: undefined, name: "New" }),
      }),
    ).toBe("event.updated");
  });

  it("maps deletes", () => {
    expect(
      determineEventWebhookEventType({
        operation: "delete",
        oldDoc: buildEvent(),
        newDoc: null,
      }),
    ).toBe("event.deleted");
  });
});
