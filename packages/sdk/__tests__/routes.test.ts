import { describe, expect, it } from "bun:test";
import { resolveSafeRedirectPath } from "../src/routes";

describe("resolveSafeRedirectPath", () => {
  it("preserves safe internal redirect paths", () => {
    expect(resolveSafeRedirectPath("/events/event_123", "/admin")).toBe(
      "/events/event_123",
    );
    expect(
      resolveSafeRedirectPath(
        "/events/event_123/ticket?from=sign-in#ticket",
        "/admin",
      ),
    ).toBe("/events/event_123/ticket?from=sign-in#ticket");
  });

  it("rejects external redirect targets", () => {
    expect(resolveSafeRedirectPath("https://example.com/admin", "/admin")).toBe(
      "/admin",
    );
    expect(resolveSafeRedirectPath("//example.com/admin", "/admin")).toBe(
      "/admin",
    );
  });

  it("rejects authentication redirect loops", () => {
    expect(resolveSafeRedirectPath("/sign-in", "/admin")).toBe("/admin");
    expect(resolveSafeRedirectPath("/sign-in/phone", "/admin")).toBe(
      "/admin",
    );
    expect(
      resolveSafeRedirectPath("/sign-in?redirect_url=/admin", "/admin"),
    ).toBe("/admin");
    expect(resolveSafeRedirectPath("/admin/login", "/dashboard")).toBe(
      "/dashboard",
    );
    expect(
      resolveSafeRedirectPath(
        "/workspaces/dojo-pomodoro/login",
        "/dashboard",
      ),
    ).toBe("/dashboard");
  });

  it("falls back to root when the fallback is unsafe", () => {
    expect(resolveSafeRedirectPath("https://example.com", "/sign-in")).toBe(
      "/",
    );
  });
});
