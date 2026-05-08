import { describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import {
  getEventLifecycleActionLabel,
  runEventLifecycleAction,
} from "../lib/event-lifecycle-actions";

describe("event lifecycle menu actions", () => {
  const workspaceScope = {
    queryArgs: {
      siteKey: "club-chlorine",
      workspaceSlug: "club-chlorine",
    },
  };

  it("publishes draft events through the lifecycle action", async () => {
    const publishEvent = mock(async () => {});
    const unpublishEvent = mock(async () => {});

    await expect(
      runEventLifecycleAction({
        eventId: "event_123" as Id<"events">,
        isDraft: true,
        workspaceScope,
        publishEvent,
        unpublishEvent,
      }),
    ).resolves.toBe("published");

    expect(getEventLifecycleActionLabel(true)).toBe("Publish");
    expect(publishEvent).toHaveBeenCalledWith({
      eventId: "event_123",
      siteKey: "club-chlorine",
      workspaceSlug: "club-chlorine",
    });
    expect(unpublishEvent).not.toHaveBeenCalled();
  });

  it("unpublishes published events through the lifecycle action", async () => {
    const publishEvent = mock(async () => {});
    const unpublishEvent = mock(async () => {});

    await expect(
      runEventLifecycleAction({
        eventId: "event_123" as Id<"events">,
        isDraft: false,
        workspaceScope,
        publishEvent,
        unpublishEvent,
      }),
    ).resolves.toBe("unpublished");

    expect(getEventLifecycleActionLabel(false)).toBe("Unpublish");
    expect(unpublishEvent).toHaveBeenCalledWith({
      eventId: "event_123",
      siteKey: "club-chlorine",
      workspaceSlug: "club-chlorine",
    });
    expect(publishEvent).not.toHaveBeenCalled();
  });
});
