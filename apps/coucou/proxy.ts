import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { siteConfigurations } from "@coucou/sdk";
import { resolveSafeRedirectPath, resolveSafeRedirectUrl } from "@coucou/sdk/routes";
import type { SiteKey } from "@coucou/sdk/site-config";
import { NextResponse } from "next/server";
import {
  buildClientAuthAllowedRedirectOrigins,
  resolveSatelliteHomeUrl,
} from "@/lib/client-auth-origins";
import { siteConfiguration } from "@/lib/site";
import type { AuthObject } from "@/lib/types";

const isLegacyClientRoute = createRouteMatcher([
  "/host(.*)",
  "/door(.*)",
  "/events(.*)",
  "/redeem(.*)",
  "/tickets(.*)",
]);

const isPublicRoute = createRouteMatcher([
  "/",
  "/dashboard",
  "/profile",
  "/account",
  "/sign-in(.*)",
  "/clients/(.*)/sign-in",
  "/api/public(.*)",
  "/docs(.*)",
  "/terms",
  "/privacy",
  "/cookies",
  "/data",
]);

const isSignInRoute = createRouteMatcher(["/sign-in(.*)"]);

function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

function isAdminOperationPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

function matchWorkspaceLoginPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspaces\/([^/]+)\/login\/?$/);
  return match?.[1] ?? null;
}

function matchWorkspaceOperationPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspaces\/([^/]+)\/(?:dashboard|host|door)(?:\/|$)/);
  return match?.[1] ?? null;
}

function matchClientAuthPath(pathname: string): SiteKey | null {
  const match = pathname.match(/^\/clients\/([^/]+)\/sign-in\/?$/);
  if (!match) return null;
  const candidate = match[1];
  if (
    candidate !== "dojo" &&
    candidate !== "club-chlorine" &&
    candidate !== "danza-organica" &&
    candidate !== "coucou"
  ) {
    return null;
  }
  if (siteConfigurations[candidate].appKind !== "client") {
    return null;
  }
  return candidate;
}

function buildCurrentPath(req: Request & { nextUrl: URL }): string {
  return `${req.nextUrl.pathname}${req.nextUrl.search}`;
}

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  const workspaceLoginSlug = matchWorkspaceLoginPath(pathname);
  const isAdminLoginRoute = isAdminLoginPath(pathname);
  const clientAuthSiteKey = matchClientAuthPath(pathname);

  if (pathname === "/") {
    const authObj = (await auth()) as AuthObject;
    if (authObj.userId) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (clientAuthSiteKey) {
    // Client/satellite auth handoff: signed-in users always bounce back
    // to the satellite (cross-origin). Allow-list and satellite-home
    // fallback are derived from the inbound request's own signals
    // (redirect_url query origin + Referer) so a localhost satellite
    // round-trips to localhost, a preview satellite to preview, etc. —
    // never to the hard-coded production URL when running in dev.
    const authObj = (await auth()) as AuthObject;
    if (authObj.userId) {
      const redirectUrlParam = req.nextUrl.searchParams.get("redirect_url");
      const refererHeader = req.headers.get("referer");
      const candidateOrigins = [redirectUrlParam, refererHeader];
      const allowedOrigins = buildClientAuthAllowedRedirectOrigins(clientAuthSiteKey, {
        candidateOrigins,
      });
      const satelliteHomeUrl = resolveSatelliteHomeUrl(clientAuthSiteKey, {
        candidateOrigins,
      });
      const resolvedRedirect = resolveSafeRedirectUrl(
        redirectUrlParam,
        satelliteHomeUrl,
        allowedOrigins,
      );
      return NextResponse.redirect(resolvedRedirect);
    }
    return NextResponse.next();
  }

  if (isSignInRoute(req) || isAdminLoginRoute || workspaceLoginSlug) {
    const authObj = (await auth()) as AuthObject;
    if (authObj.userId) {
      const fallbackPath = isAdminLoginRoute
        ? "/admin"
        : workspaceLoginSlug
          ? `/workspaces/${workspaceLoginSlug}/dashboard`
          : siteConfiguration.auth.signInRedirectPath;
      const authenticatedRedirectUrl = new URL(
        resolveSafeRedirectPath(req.nextUrl.searchParams.get("redirect_url"), fallbackPath),
        req.url,
      );
      return NextResponse.redirect(authenticatedRedirectUrl);
    }
    return NextResponse.next();
  }

  // Workspace and admin operation routes have their own client-side access
  // gates. Letting them render avoids server/client Clerk session mismatches
  // bouncing a signed in user between an operation route and its login page.
  if (
    isPublicRoute(req) ||
    isLegacyClientRoute(req) ||
    isAdminOperationPath(pathname) ||
    matchWorkspaceOperationPath(pathname)
  ) {
    return NextResponse.next();
  }

  // For non-event routes, require authentication
  const authObj = (await auth()) as AuthObject;
  const { userId } = authObj;
  if (!userId) {
    const loginPath = pathname.startsWith("/admin") ? "/admin/login" : "/sign-in";
    const signInUrl = new URL(loginPath, req.url);
    signInUrl.searchParams.set("redirect_url", buildCurrentPath(req));
    return NextResponse.redirect(signInUrl);
  }

  // For /host and /door: require sign-in only; pages render request/approval UI when unauthorized.
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/(api|trpc)(.*)"],
};
