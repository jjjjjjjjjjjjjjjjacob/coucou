export function hasWorkspaceWriteAccess(role: string | undefined): boolean {
  return role === "org:admin" || role === "admin" || role === "org:host" || role === "host";
}

export function hasWorkspaceDoorAccess(role: string | undefined): boolean {
  return (
    hasWorkspaceWriteAccess(role) ||
    role === "org:door" ||
    role === "door"
  );
}

export function hasWorkspaceReadAccess(role: string | undefined): boolean {
  return (
    hasWorkspaceDoorAccess(role) ||
    role === "org:member" ||
    role === "member"
  );
}

export function buildRoleAwareDashboardPath(
  workspaceSlug: string,
  role: string | undefined,
): string {
  if (hasWorkspaceWriteAccess(role)) {
    return `/workspaces/${workspaceSlug}/dashboard`;
  }

  return `/workspaces/${workspaceSlug}/dashboard/rsvps`;
}
