import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";
import { AuthObject } from "@/lib/types";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import { siteConfiguration } from "@/lib/site";
import {
  buildSatelliteReturnUrl,
  buildTenantPrimarySignInUrl,
} from "@coucou/sdk";

const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");
const primaryTenantSignInUrl = buildTenantPrimarySignInUrl({
  primaryBaseUrl: coucouBaseUrl,
  siteConfiguration,
});

function buildClerkSatelliteOptions(
  req: NextRequest,
): ClerkMiddlewareOptions {
  return {
    isSatellite: true,
    domain: req.nextUrl.host,
    signInUrl: primaryTenantSignInUrl,
    signUpUrl: primaryTenantSignInUrl,
  };
}

const isPublicRoute = createRouteMatcher([
  "/",
  "/events",
  "/redeem(.*)",
  "/sign-in(.*)",
  "/api/public(.*)",
  "/terms",
  "/privacy",
  "/cookies",
  "/data",
  // Next.js metadata file convention routes — Twitter/Facebook/etc. crawlers
  // fetch these directly when rendering link previews, so they must bypass
  // Clerk auth or the social card falls back to a generic redirect page.
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/icon(.*)",
  "/apple-icon(.*)",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

const isSignInRoute = createRouteMatcher(["/sign-in(.*)"]);

function isPublicEventDetailPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/?$/.test(pathname);
}

// The RSVP entry route is intentionally accessible to unauthenticated
// visitors so social link previews can read the event-specific OpenGraph
// metadata. The page itself runs a client-side auth gate that bounces
// real users to /sign-in before they can interact, while crawlers and
// shared-link previewers see the event poster + title cards.
function isPublicRsvpEntryPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/rsvp(?:\/.*)?$/.test(pathname);
}

function isProtectedEventPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/(?:status|ticket|denied)(?:\/.*)?$/.test(
    pathname,
  );
}

function buildRedirectPathWithSearch(pathname: string, search: string): string {
  const normalizedSearch = search
    ? search.startsWith("?")
      ? search
      : `?${search}`
    : "";
  return `${pathname}${normalizedSearch}`;
}

function buildPrimarySignInUrl(req: NextRequest, redirectPath?: string): string {
  const resolvedRedirectPath =
    redirectPath ??
    buildRedirectPathWithSearch(req.nextUrl.pathname, req.nextUrl.search);
  const satelliteReturnUrl = buildSatelliteReturnUrl(
    req.nextUrl.origin,
    resolvedRedirectPath,
  );
  return buildTenantPrimarySignInUrl({
    primaryBaseUrl: coucouBaseUrl,
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
}

function redirectToPrimarySignIn(
  req: NextRequest,
  redirectPath?: string,
): NextResponse {
  return NextResponse.redirect(buildPrimarySignInUrl(req, redirectPath));
}

function redirectToLocalSignIn(
  req: NextRequest,
  redirectPath?: string,
): NextResponse {
  const target = new URL("/sign-in", req.url);
  const intendedRedirect =
    redirectPath ??
    buildRedirectPathWithSearch(req.nextUrl.pathname, req.nextUrl.search);
  if (intendedRedirect) {
    target.searchParams.set("redirect_url", intendedRedirect);
  }
  return NextResponse.redirect(target);
}

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  const searchParams = req.nextUrl.searchParams;

  if (isSignInRoute(req)) {
    const authObj = (await auth()) as AuthObject;
    if (authObj.userId) {
      const authenticatedRedirectUrl = new URL(
        resolveSafeRedirectPath(
          searchParams.get("redirect_url"),
          siteConfiguration.auth.signInRedirectPath,
        ),
        req.url,
      );
      return NextResponse.redirect(authenticatedRedirectUrl);
    }
    // Render the local /sign-in page (Phone OTP) inside the Club Chlorine
    // chrome instead of bouncing to the primary Coucou tenant. Clerk's
    // satellite handshake still ferries the session cookie via the primary
    // domain when needed.
    return NextResponse.next();
  }

  if (
    isPublicRoute(req) ||
    isPublicEventDetailPath(pathname) ||
    isPublicRsvpEntryPath(pathname)
  ) {
    return NextResponse.next();
  }

  if (isProtectedEventPath(pathname)) {
    const authObj = (await auth()) as AuthObject;
    if (!authObj.userId) {
      return redirectToLocalSignIn(req);
    }
    return NextResponse.next();
  }

  // For non-event routes, require authentication
  const authObj = (await auth()) as AuthObject;
  const { userId } = authObj;
  if (!userId) {
    return redirectToPrimarySignIn(req);
  }

  // For /host and /door: require sign-in only; pages render request/approval UI when unauthorized.
  return NextResponse.next();
}, buildClerkSatelliteOptions);

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/(api|trpc)(.*)"],
};
