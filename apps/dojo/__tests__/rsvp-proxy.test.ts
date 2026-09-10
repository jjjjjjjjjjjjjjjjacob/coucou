import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest, type NextResponse } from "next/server";

type Authentication = () => Promise<{ userId: string | null }>;
type ProxyHandler = (authentication: Authentication, request: NextRequest) => Promise<NextResponse>;
let userId: string | null = null;
let status: { status: "approved" | "pending" | "denied" } | null = null;
const fetchQuery = mock(async () => status);
mock.module("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: ProxyHandler) => handler,
  createRouteMatcher: (patterns: string[]) => (request: NextRequest) =>
    patterns.some((pattern) => new RegExp(`^${pattern}$`).test(request.nextUrl.pathname)),
}));
mock.module("convex/nextjs", () => ({ fetchQuery }));
const { default: middleware } = await import("../proxy");
const handler = middleware as unknown as ProxyHandler;
const request = (pathname: string) =>
  handler(async () => ({ userId }), new NextRequest(`http://localhost:5678${pathname}`));

beforeEach(() => {
  userId = null;
  status = null;
  fetchQuery.mockClear();
});

describe("Dojo RSVP proxy", () => {
  it("leaves the homepage in place for its featured-event presentation", async () => {
    const response = await request("/?ref=friend");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(fetchQuery).not.toHaveBeenCalled();
  });
  for (const identity of [null, "signed_in_guest"]) {
    it(`allows the password-free RSVP entry for ${identity}`, async () => {
      userId = identity;
      const response = await request("/events/dojo-night/rsvp?ref=friend");
      expect(response.status).toBe(200);
      expect(fetchQuery).not.toHaveBeenCalled();
    });
  }
  for (const path of ["status", "ticket", "denied"]) {
    it(`keeps ${path} protected and preserves query state`, async () => {
      const response = await request(`/events/dojo-night/${path}?ref=friend&password=FANCY`);
      const destination = new URL(response.headers.get("location") ?? "");
      expect(destination.pathname).toContain("dojo");
      expect(destination.searchParams.get("redirect_url")).toContain(
        `/${path}?ref=friend&password=FANCY`,
      );
    });
  }
  it("lets newly verified guests reach status before their RSVP is claimed", async () => {
    userId = "signed_in_guest";
    const response = await request("/events/dojo-night/status?ref=friend");
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(fetchQuery).not.toHaveBeenCalled();
  });
  for (const [origin, primaryOrigin] of [
    ["http://localhost:5678", "http://localhost:5680"],
    ["https://dev.dojopomodoro.club", "https://dev.coucou.events"],
    ["https://dojo-preview.vercel.app", "https://dev.coucou.events"],
    ["https://dojopomodoro.club", "https://coucou.events"],
  ]) {
    it(`preserves the auth environment and RSVP handoff on ${origin}`, async () => {
      const searchParameters = new URLSearchParams({
        redirect_url: "/events/dojo-night/status?password=FANCY&ref=friend",
        rsvp_handoff: "handoff_token",
      });
      const response = await handler(
        async () => ({ userId: null }),
        new NextRequest(`${origin}/sign-in?${searchParameters}`),
      );
      const destination = new URL(response.headers.get("location") ?? "");
      expect(destination.origin).toBe(primaryOrigin);
      expect(destination.searchParams.get("rsvp_handoff")).toBe("handoff_token");
      const returnUrl = new URL(destination.searchParams.get("redirect_url") ?? "");
      expect(returnUrl.origin).toBe(origin);
      expect(returnUrl.pathname).toBe("/events/dojo-night/status");
      expect(returnUrl.searchParams.get("password")).toBe("FANCY");
      expect(returnUrl.searchParams.get("ref")).toBe("friend");
    });
  }
});
