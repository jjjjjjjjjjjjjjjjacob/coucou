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
