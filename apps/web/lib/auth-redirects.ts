export function buildRedirectPathWithSearch(
  pathname: string,
  search: string,
): string {
  let normalizedSearch = "";
  if (search) {
    normalizedSearch = search.startsWith("?") ? search : `?${search}`;
  }
  return `${pathname}${normalizedSearch}`;
}

export function resolveSafeApplicationRedirect(
  redirectUrl: string | undefined,
): string {
  if (!redirectUrl) return "/";
  if (
    !redirectUrl.startsWith("/") ||
    redirectUrl.startsWith("//") ||
    redirectUrl.includes("\\")
  ) {
    return "/";
  }
  return redirectUrl;
}
