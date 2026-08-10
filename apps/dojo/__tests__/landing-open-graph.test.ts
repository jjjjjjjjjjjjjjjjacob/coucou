import { describe, expect, it } from "bun:test";
import {
  type LandingOpenGraphEventEntry,
  selectLandingOpenGraphImageUrl,
} from "@/lib/landing-open-graph";

const fallbackImageUrl = "/og-image.png";

function createEventEntry(
  eventDate: number,
  flyerUrl: string | null,
  overrides: Partial<LandingOpenGraphEventEntry["event"]> = {},
): LandingOpenGraphEventEntry {
  return {
    event: {
      eventDate,
      lifecycle: "published",
      status: "active",
      ...overrides,
    },
    flyerUrl,
  };
}

describe("landing page Open Graph image selection", () => {
  it("uses the featured event flyer before a more recent active event", () => {
    const eventEntries = [
      createEventEntry(1_000, "https://example.com/featured.jpg", { isFeatured: true }),
      createEventEntry(2_000, "https://example.com/recent.jpg"),
    ];

    expect(selectLandingOpenGraphImageUrl(eventEntries, fallbackImageUrl)).toBe(
      "https://example.com/featured.jpg",
    );
  });

  it("uses the most recent active published event when none is featured", () => {
    const eventEntries = [
      createEventEntry(1_000, "https://example.com/older.jpg"),
      createEventEntry(2_000, "https://example.com/recent.jpg"),
      createEventEntry(3_000, "https://example.com/draft.jpg", { lifecycle: "draft" }),
      createEventEntry(4_000, "https://example.com/inactive.jpg", { status: "inactive" }),
    ];

    expect(selectLandingOpenGraphImageUrl(eventEntries, fallbackImageUrl)).toBe(
      "https://example.com/recent.jpg",
    );
  });

  it("uses the generic image when the selected event has no flyer", () => {
    const eventEntries = [
      createEventEntry(1_000, "https://example.com/older.jpg"),
      createEventEntry(2_000, null, { isFeatured: true }),
    ];

    expect(selectLandingOpenGraphImageUrl(eventEntries, fallbackImageUrl)).toBe(fallbackImageUrl);
  });
});
