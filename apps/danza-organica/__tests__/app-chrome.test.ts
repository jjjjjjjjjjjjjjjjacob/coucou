import { describe, expect, it } from "bun:test";
import { isBauhausEventRoute, resolveContentMaxWidthPx } from "../app/app-chrome";

describe("Danza Organica app chrome", () => {
  it("makes landing and exact event details full-bleed for the Bauhaus field", () => {
    expect(isBauhausEventRoute("/")).toBe(true);
    expect(isBauhausEventRoute("/events")).toBe(true);
    expect(isBauhausEventRoute("/events/event_123")).toBe(true);
    expect(resolveContentMaxWidthPx("/")).toBeUndefined();
    expect(resolveContentMaxWidthPx("/events/event_123")).toBeUndefined();
  });

  it("keeps transactional event routes in the editorial column", () => {
    expect(isBauhausEventRoute("/events/event_123/rsvp")).toBe(false);
    expect(resolveContentMaxWidthPx("/events/event_123/rsvp")).toBe(650);
    expect(resolveContentMaxWidthPx("/events/event_123/ticket")).toBe(650);
  });

  it("drops the column constraint on wide Clerk-hosted surfaces", () => {
    expect(resolveContentMaxWidthPx("/account")).toBeUndefined();
    expect(resolveContentMaxWidthPx("/profile")).toBeUndefined();
  });
});
