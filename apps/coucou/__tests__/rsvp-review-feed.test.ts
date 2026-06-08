import { describe, expect, it } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import {
  buildRsvpReviewFeedSearchParams,
  getInstagramEmbedUrl,
  getRsvpReviewFeedDiffs,
  getRsvpReviewFeedInstagramProfile,
  getRsvpReviewFeedSelectedIds,
} from "../lib/rsvp-review-feed";
import type { Event, HostRsvp } from "../lib/types";

function createHostRsvp(overrides: Partial<HostRsvp> = {}): HostRsvp {
  return {
    id: "rsvp_1" as Id<"rsvps">,
    clerkUserId: "user_1",
    name: "Ada Lovelace",
    firstName: "Ada",
    lastName: "Lovelace",
    listKey: "ga",
    status: "pending",
    approvalStatus: "pending",
    attendanceStatus: "yes",
    ticketStatus: "not-issued",
    socialProfiles: [
      { platformKey: "instagram", handle: "@ada.codes", normalizedHandle: "ada.codes" },
    ],
    redemptionStatus: "none",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    _id: "event_1" as Id<"events">,
    name: "Review Night",
    hosts: ["Coucou"],
    location: "Main Room",
    eventDate: 1_700_000_000_000,
    primaryFieldConfig: {
      socialPlatforms: [
        {
          platformKey: "instagram",
          label: "Instagram",
          profileUrlPrefix: "https://instagram.com/",
        },
      ],
    },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("RSVP review feed helpers", () => {
  it("builds and parses selected RSVP IDs in order", () => {
    const searchParams = buildRsvpReviewFeedSearchParams({
      eventId: "event_1",
      rsvpIds: ["rsvp_3", "rsvp_1", "rsvp_2"],
    });

    expect(searchParams.get("eventId")).toBe("event_1");
    expect(searchParams.getAll("rsvpId")).toEqual(["rsvp_3", "rsvp_1", "rsvp_2"]);
    expect(getRsvpReviewFeedSelectedIds(searchParams)).toEqual(["rsvp_3", "rsvp_1", "rsvp_2"]);
  });

  it("deduplicates repeated and comma-separated RSVP IDs without changing first-seen order", () => {
    const searchParams = new URLSearchParams();
    searchParams.append("rsvpId", "rsvp_2");
    searchParams.append("rsvpId", "rsvp_1");
    searchParams.set("rsvpIds", "rsvp_2,rsvp_3");

    expect(getRsvpReviewFeedSelectedIds(searchParams)).toEqual(["rsvp_2", "rsvp_1", "rsvp_3"]);
  });

  it("computes staged list and approval diffs separately", () => {
    const diffs = getRsvpReviewFeedDiffs(
      [
        { rsvpId: "rsvp_1", listKey: "ga", approvalStatus: "pending" },
        { rsvpId: "rsvp_2", listKey: "vip", approvalStatus: "approved" },
      ],
      {
        rsvp_1: { listKey: "vip", approvalStatus: "approved" },
        rsvp_2: { listKey: "vip", approvalStatus: "denied" },
      },
    );

    expect(diffs.listUpdates).toEqual([{ rsvpId: "rsvp_1", listKey: "vip" }]);
    expect(diffs.approvalUpdates).toEqual([
      { rsvpId: "rsvp_1", approvalStatus: "approved" },
      { rsvpId: "rsvp_2", approvalStatus: "denied" },
    ]);
  });

  it("normalizes Instagram handles and returns an embeddable profile URL", () => {
    const instagramProfile = getRsvpReviewFeedInstagramProfile(createHostRsvp(), createEvent());

    expect(instagramProfile).toEqual({
      handle: "ada.codes",
      profileUrl: "https://instagram.com/ada.codes",
      embedUrl: "https://www.instagram.com/ada.codes/embed",
    });
  });

  it("builds Instagram embed URLs for profiles and media URLs", () => {
    expect(getInstagramEmbedUrl("https://instagram.com/ada.codes")).toBe(
      "https://www.instagram.com/ada.codes/embed",
    );
    expect(getInstagramEmbedUrl("https://www.instagram.com/p/ABC123/?igsh=example")).toBe(
      "https://www.instagram.com/p/ABC123/embed",
    );
    expect(getInstagramEmbedUrl("https://www.instagram.com/reel/DEF456/")).toBe(
      "https://www.instagram.com/reel/DEF456/embed",
    );
    expect(getInstagramEmbedUrl("https://example.com/ada.codes")).toBeNull();
    expect(getInstagramEmbedUrl("https://instagram.com/stories/ada.codes/123")).toBeNull();
  });

  it("joins Instagram prefixes that are missing a trailing slash", () => {
    const instagramProfile = getRsvpReviewFeedInstagramProfile(
      createHostRsvp(),
      createEvent({
        primaryFieldConfig: {
          socialPlatforms: [
            {
              platformKey: "instagram",
              label: "Instagram",
              profileUrlPrefix: "https://instagram.com",
            },
          ],
        },
      }),
    );

    expect(instagramProfile?.profileUrl).toBe("https://instagram.com/ada.codes");
  });

  it("returns null when the RSVP has no Instagram profile", () => {
    expect(
      getRsvpReviewFeedInstagramProfile(
        createHostRsvp({
          socialProfiles: [{ platformKey: "tiktok", handle: "ada", normalizedHandle: "ada" }],
        }),
        createEvent(),
      ),
    ).toBeNull();
  });
});
