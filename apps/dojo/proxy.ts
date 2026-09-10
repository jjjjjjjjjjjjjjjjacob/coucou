import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildRedirectPathWithSearch } from "@/lib/auth-redirects";
import { resolveCoucouBaseUrl, siteConfiguration } from "@/lib/site";
import type { AuthObject } from "@/lib/types";

function buildClerkSatelliteOptions(req: NextRequest): ClerkMiddlewareOptions {
  const primaryTenantSignInUrl = buildTenantPrimarySignInUrl({
    primaryBaseUrl: resolveCoucouBaseUrl(req.nextUrl.origin),
    siteConfiguration,
  });
  return {
    isSatellite: true,
    domain: req.nextUrl.host,
    signInUrl: primaryTenantSignInUrl,
    signUpUrl: primaryTenantSignInUrl,
  };
}

// Public routes do not require auth. Host routes are intentionally not public.
// Note: /events routes need conditional auth handling, so they're not fully public
const isPublicRoute = createRouteMatcher([
  "/",
  "/redeem(.*)",
  "/sign-in(.*)",
  "/api/public(.*)",
  "/terms",
  "/privacy",
  "/cookies",
  "/data",
]);

const isSignInRoute = createRouteMatcher(["/sign-in(.*)"]);

// Helper function to check if it's an event route and extract eventId
function parseEventRoute(pathname: string): {
  isEvent: boolean;
  eventId?: string;
  subpath?: string;
} {
  const match = pathname.match(/^\/events\/([^/]+)(.*)$/);
  if (!match) return { isEvent: false };

  const [, eventId, subpath = ""] = match;
  return { isEvent: true, eventId, subpath };
}

function redirectToSignIn(req: NextRequest): NextResponse {
  const redirectPath = buildRedirectPathWithSearch(req.nextUrl.pathname, req.nextUrl.search);
  const satelliteReturnUrl = buildSatelliteReturnUrl(req.nextUrl.origin, redirectPath);
  const signInUrl = buildTenantPrimarySignInUrl({
    primaryBaseUrl: resolveCoucouBaseUrl(req.nextUrl.origin),
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
  return NextResponse.redirect(signInUrl);
}

function redirectToPrimarySignIn(req: NextRequest): NextResponse {
  const redirectParam = req.nextUrl.searchParams.get("redirect_url");
  const redirectPath = resolveSafeRedirectPath(
    redirectParam,
    siteConfiguration.auth.signInRedirectPath,
  );
  const satelliteReturnUrl = buildSatelliteReturnUrl(req.nextUrl.origin, redirectPath);
  const signInUrl = buildTenantPrimarySignInUrl({
    primaryBaseUrl: resolveCoucouBaseUrl(req.nextUrl.origin),
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
  const destination = new URL(signInUrl);
  const rsvpHandoffToken = req.nextUrl.searchParams.get("rsvp_handoff");
  if (rsvpHandoffToken) destination.searchParams.set("rsvp_handoff", rsvpHandoffToken);
  return NextResponse.redirect(destination);
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
    return redirectToPrimarySignIn(req);
  }

  if (isPublicRoute(req)) return NextResponse.next();

  const eventRoute = parseEventRoute(pathname);
  if (eventRoute.isEvent) {
    // Entry pages decide list access and existing-RSVP navigation after auth syncs.
    // A public list never requires a password or sign-in to view the form.
    if (
      eventRoute.subpath === "" ||
      eventRoute.subpath === "/" ||
      eventRoute.subpath === "/rsvp" ||
      eventRoute.subpath === "/rsvp/"
    ) {
      return NextResponse.next();
    }
    const authentication = await auth();
    if (!authentication.userId) return redirectToSignIn(req);
    // The status page claims guest RSVPs after Convex authentication is ready.
    // Checking status here would redirect newly verified guests before that claim.
    return NextResponse.next();
  }

  // For non-event routes, require authentication
  const authObj = (await auth()) as AuthObject;
  const { userId } = authObj;
  if (!userId) {
    return redirectToSignIn(req);
  }

  // For /host and /door: require sign-in only; pages render request/approval UI when unauthorized.
  return NextResponse.next();
}, buildClerkSatelliteOptions);

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/(api|trpc)(.*)"],
};
