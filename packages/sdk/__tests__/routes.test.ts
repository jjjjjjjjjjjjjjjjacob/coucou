import { describe, expect, it } from "bun:test";
import { resolveSafeRedirectPath, resolveSafeRedirectUrl } from "../src/routes";

describe("resolveSafeRedirectPath", () => {
  it("preserves safe internal redirect paths", () => {
    expect(resolveSafeRedirectPath("/events/event_123", "/admin")).toBe("/events/event_123");
    expect(resolveSafeRedirectPath("/events/event_123/ticket?from=sign-in#ticket", "/admin")).toBe(
      "/events/event_123/ticket?from=sign-in#ticket",
    );
  });

  it("rejects external redirect targets", () => {
    expect(resolveSafeRedirectPath("https://example.com/admin", "/admin")).toBe("/admin");
    expect(resolveSafeRedirectPath("//example.com/admin", "/admin")).toBe("/admin");
  });

  it("rejects authentication redirect loops", () => {
    expect(resolveSafeRedirectPath("/sign-in", "/admin")).toBe("/admin");
    expect(resolveSafeRedirectPath("/sign-in/phone", "/admin")).toBe("/admin");
    expect(resolveSafeRedirectPath("/sign-in?redirect_url=/admin", "/admin")).toBe("/admin");
    expect(resolveSafeRedirectPath("/admin/login", "/dashboard")).toBe("/dashboard");
    expect(resolveSafeRedirectPath("/workspaces/dojo-pomodoro/login", "/dashboard")).toBe(
      "/dashboard",
    );
  });

  it("falls back to root when the fallback is unsafe", () => {
    expect(resolveSafeRedirectPath("https://example.com", "/sign-in")).toBe("/");
  });
});

describe("resolveSafeRedirectUrl", () => {
  it("preserves safe internal redirect paths", () => {
    expect(resolveSafeRedirectUrl("/dashboard", "/")).toBe("/dashboard");
  });

  it("allows external redirect targets from configured origins", () => {
    expect(
      resolveSafeRedirectUrl("https://dojopomodoro.club/events/event_123/ticket", "/dashboard", [
        "https://dojopomodoro.club",
      ]),
    ).toBe("https://dojopomodoro.club/events/event_123/ticket");
  });

  it("rejects external redirect targets from unconfigured origins", () => {
    expect(
      resolveSafeRedirectUrl("https://example.com/events/event_123/ticket", "/dashboard", [
        "https://dojopomodoro.club",
      ]),
    ).toBe("/dashboard");
  });

  it("rejects external authentication redirect loops", () => {
    expect(
      resolveSafeRedirectUrl(
        "https://dojopomodoro.club/sign-in?redirect_url=/events/event_123",
        "/dashboard",
        ["https://dojopomodoro.club"],
      ),
    ).toBe("/dashboard");
  });
});
