import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AuthObject } from "@/lib/types";
import { siteConfiguration } from "@/lib/site";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";

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
  "/api/public(.*)",
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
  const match = pathname.match(
    /^\/workspaces\/([^/]+)\/(?:dashboard|host|door)(?:\/|$)/,
  );
  return match?.[1] ?? null;
}

function buildCurrentPath(req: Request & { nextUrl: URL }): string {
  return `${req.nextUrl.pathname}${req.nextUrl.search}`;
}

export default clerkMiddleware(async (auth, req) => {
  const pathname = req.nextUrl.pathname;
  const workspaceLoginSlug = matchWorkspaceLoginPath(pathname);
  const isAdminLoginRoute = isAdminLoginPath(pathname);

  if (pathname === "/") {
    const authObj = (await auth()) as AuthObject;
    if (authObj.userId) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
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
        resolveSafeRedirectPath(
          req.nextUrl.searchParams.get("redirect_url"),
          fallbackPath,
        ),
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
    const loginPath = pathname.startsWith("/admin")
      ? "/admin/login"
      : "/sign-in";
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
