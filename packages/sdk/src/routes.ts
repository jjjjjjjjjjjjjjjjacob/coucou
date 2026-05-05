export const ORGANIZER_DASHBOARD_PATH_PREFIX = "/admin";
export const LEGACY_HOST_DASHBOARD_PATH_PREFIX = "/host";

const INTERNAL_URL_ORIGIN = "https://coucou.local";
const ROOT_REDIRECT_PATH = "/";

export function toAdminPath(pathname: string): string {
  if (pathname === LEGACY_HOST_DASHBOARD_PATH_PREFIX) {
    return ORGANIZER_DASHBOARD_PATH_PREFIX;
  }

  if (pathname.startsWith(`${LEGACY_HOST_DASHBOARD_PATH_PREFIX}/`)) {
    return pathname.replace(
      LEGACY_HOST_DASHBOARD_PATH_PREFIX,
      ORGANIZER_DASHBOARD_PATH_PREFIX,
    );
  }

  return pathname;
}

function isAuthenticationPath(pathname: string): boolean {
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return true;
  }
  if (/^\/workspaces\/[^/]+\/login(?:\/)?$/.test(pathname)) {
    return true;
  }
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

function normalizeSafeInternalPath(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  if (!trimmedValue || !trimmedValue.startsWith("/") || trimmedValue.startsWith("//")) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedValue, INTERNAL_URL_ORIGIN);
    if (
      parsedUrl.origin !== INTERNAL_URL_ORIGIN ||
      isAuthenticationPath(parsedUrl.pathname)
    ) {
      return null;
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return null;
  }
}

export function resolveSafeRedirectPath(
  redirectPath: string | null | undefined,
  fallbackPath = ROOT_REDIRECT_PATH,
): string {
  const safeFallbackPath =
    normalizeSafeInternalPath(fallbackPath) ?? ROOT_REDIRECT_PATH;

  return normalizeSafeInternalPath(redirectPath) ?? safeFallbackPath;
}

export function buildSignInPath(redirectPath?: string | null): string {
  if (!redirectPath) {
    return "/sign-in";
  }

  return `/sign-in?redirect_url=${encodeURIComponent(redirectPath)}`;
}
