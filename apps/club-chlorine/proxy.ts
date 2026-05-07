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
]);

const isSignInRoute = createRouteMatcher(["/sign-in(.*)"]);

function isPublicEventDetailPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/?$/.test(pathname);
}

function isProtectedEventPath(pathname: string): boolean {
  return /^\/events\/[^/]+\/(?:rsvp|status|ticket|denied)(?:\/.*)?$/.test(
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
    return redirectToPrimarySignIn(
      req,
      resolveSafeRedirectPath(
        searchParams.get("redirect_url"),
        siteConfiguration.auth.signInRedirectPath,
      ),
    );
  }

  if (isPublicRoute(req) || isPublicEventDetailPath(pathname)) {
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
