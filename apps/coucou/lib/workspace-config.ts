export type WorkspaceOperationSurface = "dashboard" | "host" | "door";

export interface ClientWorkspaceConfiguration {
  workspaceSlug: string;
  siteKey?: string | null;
  brandName: string;
  primaryDomain?: string | null;
  clerkOrganizationId?: string | null;
  clerkOrganizationSlug?: string | null;
}

export function getCoucouOrganizationSlug(): string {
  return (process.env.NEXT_PUBLIC_COUCOU_CLERK_ORGANIZATION_SLUG ?? "coucou").toLowerCase();
}

export function isCoucouWorkspaceSlug(workspaceSlug: string | null | undefined): boolean {
  return workspaceSlug === getCoucouOrganizationSlug();
}

export function normalizeCoucouBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl ?? "http://localhost:5680").replace(/\/+$/, "");
}

export function buildWorkspaceOperationPath(
  workspaceSlug: string,
  surface: WorkspaceOperationSurface,
  pathname = "",
): string {
  const normalizedPathname = pathname.replace(/^\/+/, "");
  if (surface === "door") {
    const suffix = normalizedPathname ? `/${normalizedPathname}` : "";
    return `/workspaces/${workspaceSlug}/dashboard/door${suffix}`;
  }

  const suffix = normalizedPathname ? `/${normalizedPathname}` : "";
  return `/workspaces/${workspaceSlug}/dashboard${suffix}`;
}

export function buildWorkspaceLoginPath(
  workspaceSlug: string,
  redirectPath?: string | null,
): string {
  const basePath = `/workspaces/${workspaceSlug}/login`;
  if (!redirectPath) {
    return basePath;
  }

  return `${basePath}?redirect_url=${encodeURIComponent(redirectPath)}`;
}

export function buildWorkspaceOperationHref(
  workspaceSlug: string,
  surface: WorkspaceOperationSurface,
  pathname = "",
): string {
  const baseUrl = normalizeCoucouBaseUrl(process.env.NEXT_PUBLIC_COUCOU_BASE_URL);
  return `${baseUrl}${buildWorkspaceOperationPath(workspaceSlug, surface, pathname)}`;
}

export function getWorkspaceSlugFromPathname(pathname: string | null | undefined): string | null {
  const match = pathname?.match(/^\/workspaces\/([^/]+)(?:\/|$)/);
  return match?.[1] ?? null;
}
