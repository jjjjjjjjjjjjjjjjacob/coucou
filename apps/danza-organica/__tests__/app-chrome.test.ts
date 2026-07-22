import { describe, expect, it } from "bun:test";
import { resolveContentMaxWidthPx } from "../app/app-chrome";

describe("Danza Organica app chrome", () => {
  it("constrains guest surfaces to the shared editorial column", () => {
    expect(resolveContentMaxWidthPx("/")).toBe(650);
    expect(resolveContentMaxWidthPx("/events/event_123")).toBe(650);
    expect(resolveContentMaxWidthPx("/events/event_123/rsvp")).toBe(650);
    expect(resolveContentMaxWidthPx("/events/event_123/ticket")).toBe(650);
  });

  it("drops the column constraint on wide Clerk-hosted surfaces", () => {
    expect(resolveContentMaxWidthPx("/account")).toBeUndefined();
    expect(resolveContentMaxWidthPx("/profile")).toBeUndefined();
  });
});
