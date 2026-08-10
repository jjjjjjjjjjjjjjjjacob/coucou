import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { shouldUseClerkSatelliteModeForHost, siteConfiguration } from "@/lib/site";
import type { AuthObject } from "@/lib/types";

const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);
const primaryTenantSignInUrl = buildTenantPrimarySignInUrl({
  primaryBaseUrl: coucouBaseUrl,
  siteConfiguration,
});

function buildClerkSatelliteOptions(req: NextRequest): ClerkMiddlewareOptions {
  // On the production host (a subdomain of the primary Clerk domain) the
  // primary session cookie is shared, so satellite mode must stay off —
  // see shouldUseClerkSatelliteModeForHost.
  if (!shouldUseClerkSatelliteModeForHost(req.nextUrl.host)) {
    return {
      signInUrl: primaryTenantSignInUrl,
      signUpUrl: primaryTenantSignInUrl,
    };
  }
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
  "/sms",
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

function isDevelopmentBauhausLinePreviewPath(pathname: string): boolean {
  return process.env.NODE_ENV !== "production" && /^\/dev\/bauhaus-line\/?$/.test(pathname);
}

// The RSVP entry route is intentionally accessible to unauthenticated
// visitors so social link previews can read the event-specific OpenGraph
// metadata. The page itself runs a client-side auth gate that bounces
// real users to the coucou.events sign-in surface before they can
// interact, while crawlers and shared-link previewers see the event
// poster + title cards.
function isPublicRsvpEntryPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/rsvp(?:\/.*)?$/.test(pathname);
}

function isProtectedEventPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/(?:status|ticket|denied)(?:\/.*)?$/.test(pathname);
}

function buildRedirectPathWithSearch(pathname: string, search: string): string {
  const normalizedSearch = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${pathname}${normalizedSearch}`;
}

function buildPrimarySignInUrl(req: NextRequest, redirectPath?: string): string {
  const resolvedRedirectPath =
    redirectPath ?? buildRedirectPathWithSearch(req.nextUrl.pathname, req.nextUrl.search);
  const satelliteReturnUrl = buildSatelliteReturnUrl(req.nextUrl.origin, resolvedRedirectPath);
  return buildTenantPrimarySignInUrl({
    primaryBaseUrl: coucouBaseUrl,
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
}

function redirectToPrimarySignIn(req: NextRequest, redirectPath?: string): NextResponse {
  return NextResponse.redirect(buildPrimarySignInUrl(req, redirectPath));
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
    // Satellite never serves its own sign-in surface. Always bounce to
    // coucou.events/workspaces/{slug}/login so the user sees the tenant-
    // branded phone-auth page hosted on the primary domain.
    const redirectPath = resolveSafeRedirectPath(
      searchParams.get("redirect_url"),
      siteConfiguration.auth.signInRedirectPath,
    );
    return redirectToPrimarySignIn(req, redirectPath);
  }

  if (
    isPublicRoute(req) ||
    isPublicEventDetailPath(pathname) ||
    isPublicRsvpEntryPath(pathname) ||
    isDevelopmentBauhausLinePreviewPath(pathname)
  ) {
    return NextResponse.next();
  }

  if (isProtectedEventPath(pathname)) {
    const authObj = (await auth()) as AuthObject;
    if (!authObj.userId) {
      return redirectToPrimarySignIn(req);
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
