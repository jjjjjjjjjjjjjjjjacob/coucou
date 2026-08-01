import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import { eventMatchesSiteScope } from "../convex/lib/siteScope";

describe("eventMatchesSiteScope", () => {
  it("uses legacy siteKey as the workspace slug fallback", () => {
    const event = {
      _id: "event_123" as Id<"events">,
      siteKey: "club-chlorine",
      workspaceSlug: undefined,
    };

    expect(
      eventMatchesSiteScope(event, {
        siteKey: "club-chlorine",
        workspaceSlug: "club-chlorine",
      }),
    ).toBe(true);
  });
});
