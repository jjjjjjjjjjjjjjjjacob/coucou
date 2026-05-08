import type { ClerkMiddlewareOptions } from "@clerk/nextjs/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import { fetchQuery } from "convex/nextjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { buildRedirectPathWithSearch } from "@/lib/auth-redirects";
import { siteConfiguration } from "@/lib/site";
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
    primaryBaseUrl: coucouBaseUrl,
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
    primaryBaseUrl: coucouBaseUrl,
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
  return NextResponse.redirect(signInUrl);
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

  // Handle root path - check for featured event and redirect
  if (pathname === "/") {
    try {
      const featuredEvent = await fetchQuery(api.events.getFeaturedEvent, {
        siteKey: siteConfiguration.siteKey,
      });
      if (featuredEvent?._id) {
        const redirectUrl = new URL(`/events/${featuredEvent._id}`, req.url);
        return NextResponse.redirect(redirectUrl);
      }
    } catch (error) {
      console.error("Error checking featured event in middleware:", error);
      // If there's an error, continue to home page
    }
  }

  if (isPublicRoute(req)) {
    return NextResponse.next();
  }

  // Handle event routes with conditional auth
  const eventRoute = parseEventRoute(pathname);
  if (eventRoute.isEvent && eventRoute.eventId) {
    const authObj = (await auth()) as AuthObject;
    const { userId } = authObj;

    // For unauthenticated users, handle different subpaths
    if (!userId) {
      const isMainEventPage = pathname === `/events/${eventRoute.eventId}`;
      const isStatusPage = pathname === `/events/${eventRoute.eventId}/status`;
      const isTicketPage = pathname === `/events/${eventRoute.eventId}/ticket`;

      // If trying to access status or ticket page, redirect to sign-in
      if (isStatusPage || isTicketPage) {
        return redirectToSignIn(req);
      }

      // For other subpaths, redirect to main event page
      if (!isMainEventPage) {
        const redirectUrl = new URL(`/events/${eventRoute.eventId}`, req.url);
        const password = searchParams.get("password");
        if (password) {
          redirectUrl.searchParams.set("password", password);
        }
        return NextResponse.redirect(redirectUrl);
      }
      return NextResponse.next(); // Allow main event page
    }

    // For authenticated users, check RSVP status and route accordingly
    try {
      // Get RSVP status for this user and event
      const status = await fetchQuery(api.rsvps.statusForUserEventServer, {
        eventId: eventRoute.eventId as Id<"events">,
        clerkUserId: userId,
      });

      // Get password from search params
      const password = searchParams.get("password");

      // Determine the correct path based on status
      let correctPath: string;
      if (!status && !password) {
        // No RSVP found - should be on main page to enter password
        correctPath = `/events/${eventRoute.eventId}`;
      } else if (!status && password) {
        correctPath = `/events/${eventRoute.eventId}/rsvp`;
      } else if (status) {
        switch (status.status) {
          case "pending":
            correctPath = `/events/${eventRoute.eventId}/status`;
            break;
          case "denied":
            correctPath = `/events/${eventRoute.eventId}/denied`;
            break;
          case "approved":
          case "attending":
            correctPath = `/events/${eventRoute.eventId}/ticket`;
            break;
          default:
            correctPath = `/events/${eventRoute.eventId}/rsvp`;
        }
      } else {
        // Status is null but password exists - redirect to main event page
        correctPath = `/events/${eventRoute.eventId}`;
      }

      // Redirect if not on the correct page
      if (pathname !== correctPath) {
        const redirectUrl = new URL(correctPath, req.url);
        // Preserve password parameter if it exists
        if (password) {
          redirectUrl.searchParams.set("password", password);
        }
        return NextResponse.redirect(redirectUrl);
      }
    } catch (error) {
      console.error("Error checking RSVP status in middleware:", error);
      // If there's an error, let the page handle it
    }

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
