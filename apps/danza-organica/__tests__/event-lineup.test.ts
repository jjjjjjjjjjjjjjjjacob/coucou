import { describe, expect, it } from "bun:test";

import { formatPublicEventActLabel, getPublicEventActs } from "../lib/event-lineup";
import type { Event } from "../lib/types";

function buildEvent(overrides: Partial<Event>): Event {
  return {
    _id: "event_123" as Event["_id"],
    name: "The Rapture · Blue Velvet",
    hosts: ["Danza Organica"],
    location: "Pool",
    eventDate: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("Danza Organica event lineup", () => {
  it("masks secret guest names and keeps descriptor badges", () => {
    const acts = getPublicEventActs(
      buildEvent({
        acts: [
          {
            name: "Real Hidden Name",
            descriptorBadges: ["DJ"],
            socialUrl: "https://example.com/hidden",
            isSecretGuest: true,
            secretDisplayName: "SPECIAL GUEST",
          },
        ],
      }),
    );

    expect(acts).toEqual([
      {
        displayName: "SPECIAL GUEST",
        descriptorBadges: ["DJ"],
        socialUrl: undefined,
        isSecretGuest: true,
      },
    ]);
    expect(formatPublicEventActLabel(acts[0])).toBe("SPECIAL GUEST (DJ)");
  });

  it("falls back to title-split lineup when acts are not configured", () => {
    const acts = getPublicEventActs(
      buildEvent({
        secondaryTitle: "Something Fun",
      }),
    );

    expect(acts.map((act) => act.displayName)).toEqual([
      "The Rapture",
      "Blue Velvet",
      "Something Fun",
    ]);
  });
});
