import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { buildEventStatusUrl, resolveEventMessageBaseUrl } from "../convex/lib/publicBaseUrl";
import { formatRsvpConfirmationMessage } from "../convex/lib/rsvpConfirmationMessages";
import { formatApprovalMessage, formatDeferredApprovalMessage } from "../convex/notifications";
import schema from "../convex/schema";

const event = {
  _id: "event_identifier",
  shortId: "night",
  siteKey: "dojo",
  name: "Friday Night",
  eventDate: 1800000000000,
  location: "Main Room",
  rsvpConfirmationMessage: "Request received. Sign in: {{eventStatusUrl}}",
  approvalMessage: "Approved. Sign in: {{eventStatusUrl}}",
};

describe("event status message links", () => {
  it("renders pending, immediate and deferred approval templates without issuing a QR link", () => {
    const statusUrl = "https://dojopomodoro.club/events/night/status";
    expect(formatRsvpConfirmationMessage(event, { firstName: "Ava" })).toContain(statusUrl);
    expect(
      formatApprovalMessage(event, {}, "ticket", "https://dojopomodoro.club", undefined, false),
    ).toContain(statusUrl);
    const deferred = formatDeferredApprovalMessage(event, {});
    expect(deferred).toContain(statusUrl);
    expect(deferred).not.toContain("/redeem/");
    expect(
      formatRsvpConfirmationMessage({ ...event, rsvpConfirmationMessageEnabled: false }, {}),
    ).toBeUndefined();
  });

  it("uses the destination workspace domain and event ID fallback", async () => {
    const backend = convexTest(schema, import.meta.glob("../convex/**/*.ts"));
    const baseUrl = await backend.run(async (context) => {
      const workspaceId = await context.db.insert("workspaces", {
        slug: "custom",
        name: "Custom",
        primaryDomain: "rsvp.example.com",
        createdAt: 1,
        updatedAt: 1,
      });
      await context.db.insert("workspaceSites", {
        workspaceId,
        siteKey: "dojo",
        domain: "old.example.com",
        appKind: "client",
        createdAt: 1,
        updatedAt: 1,
      });
      return await resolveEventMessageBaseUrl(context, { ...event, workspaceSlug: "custom" });
    });
    const statusUrl = buildEventStatusUrl({ ...event, shortId: undefined }, baseUrl);
    expect(statusUrl).toBe("https://rsvp.example.com/events/event_identifier/status");
    expect(formatRsvpConfirmationMessage(event, {}, { publicBaseUrl: baseUrl })).toContain(
      "https://rsvp.example.com/events/night/status",
    );
    expect(formatDeferredApprovalMessage({ ...event, publicBaseUrl: baseUrl }, {})).toContain(
      "https://rsvp.example.com/events/night/status",
    );
  });

  it.each([
    "dojo",
    "club-chlorine",
    "danza-organica",
  ])("creates a protected status route for %s", (siteKey) => {
    const url = new URL(buildEventStatusUrl({ ...event, siteKey }));
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/events/night/status");
    expect(url.search).toBe("");
  });
});
