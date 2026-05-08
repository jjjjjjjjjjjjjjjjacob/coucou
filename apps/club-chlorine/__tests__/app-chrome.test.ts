import { describe, expect, it } from "bun:test";
import {
  isExactEventDetailPath,
  resolveChlorineAppShellMode,
  shouldSkipChlorineAppShellIntro,
} from "../app/app-chrome";

describe("Club Chlorine app chrome", () => {
  it("uses split chrome for the landing page and exact event detail routes", () => {
    expect(resolveChlorineAppShellMode("/")).toBe("expanded");
    expect(resolveChlorineAppShellMode("/events/event_123")).toBe("expanded");
    expect(resolveChlorineAppShellMode("/events/event_123/")).toBe("expanded");
  });

  it("keeps nested event routes collapsed", () => {
    expect(isExactEventDetailPath("/events/event_123/rsvp")).toBe(false);
    expect(resolveChlorineAppShellMode("/events/event_123/rsvp")).toBe("collapsed");
    expect(resolveChlorineAppShellMode("/events/event_123/status")).toBe("collapsed");
    expect(resolveChlorineAppShellMode("/events/event_123/ticket")).toBe("collapsed");
    expect(resolveChlorineAppShellMode("/events/event_123/denied")).toBe("collapsed");
  });

  it("lets direct event detail mounts play the viewport-centered intro", () => {
    expect(shouldSkipChlorineAppShellIntro("/")).toBe(false);
    expect(shouldSkipChlorineAppShellIntro("/events/event_123")).toBe(false);
    expect(shouldSkipChlorineAppShellIntro("/events/event_123/ticket")).toBe(true);
  });
});
