import type { ClerkClient, OrganizationMembershipRole } from "@clerk/backend";

export type WorkspaceOrganizationRole = "admin" | "host" | "door" | "member";

type ClerkOrganizationsApi = ClerkClient["organizations"];

export interface ClerkRoleSynchronizationResult {
  clerkRole: OrganizationMembershipRole;
  usedMemberFallback: boolean;
}

export function normalizeWorkspaceOrganizationRole(role: string): WorkspaceOrganizationRole {
  const normalizedRole = role.replace(/^org:/, "");
  switch (normalizedRole) {
    case "admin":
    case "host":
    case "door":
    case "member":
      return normalizedRole;
    default:
      throw new Error("Invalid role");
  }
}

export function toStoredOrganizationRole(role: string): `org:${WorkspaceOrganizationRole}` {
  return `org:${normalizeWorkspaceOrganizationRole(role)}`;
}

export function resolveRoleAfterClerkSynchronization(
  existingRole: string,
  synchronizedClerkRole: string,
): string {
  const normalizedExistingRole = existingRole.replace(/^org:/, "");
  const normalizedClerkRole = synchronizedClerkRole.replace(/^org:/, "");
  const existingRoleUsesConvexFallback =
    normalizedExistingRole === "host" || normalizedExistingRole === "door";

  return existingRoleUsesConvexFallback && normalizedClerkRole === "member"
    ? existingRole
    : synchronizedClerkRole;
}

async function setClerkOrganizationMembershipRole(
  clerkOrganizations: ClerkOrganizationsApi,
  {
    organizationId,
    userId,
    role,
  }: {
    organizationId: string;
    userId: string;
    role: OrganizationMembershipRole;
  },
): Promise<void> {
  const membershipList = await clerkOrganizations.getOrganizationMembershipList({
    organizationId,
    userId: [userId],
    limit: 1,
  });

  if (membershipList.data.length > 0) {
    await clerkOrganizations.updateOrganizationMembership({
      organizationId,
      userId,
      role,
    });
    return;
  }

  await clerkOrganizations.createOrganizationMembership({
    organizationId,
    userId,
    role,
  });
}

/**
 * Clerk's free organization roles are Admin and Member. Host and Door remain
 * useful application roles even when a tenant has not purchased Clerk custom
 * roles, so a rejected custom role is represented as Member in Clerk while
 * Convex retains the requested role as the authorization source of truth.
 */
export async function synchronizeClerkWorkspaceRole(
  clerkOrganizations: ClerkOrganizationsApi,
  {
    organizationId,
    userId,
    requestedRole,
  }: {
    organizationId: string;
    userId: string;
    requestedRole: string;
  },
): Promise<ClerkRoleSynchronizationResult> {
  const normalizedRole = normalizeWorkspaceOrganizationRole(requestedRole);
  const requestedClerkRole = `org:${normalizedRole}` as OrganizationMembershipRole;

  try {
    await setClerkOrganizationMembershipRole(clerkOrganizations, {
      organizationId,
      userId,
      role: requestedClerkRole,
    });
    return {
      clerkRole: requestedClerkRole,
      usedMemberFallback: false,
    };
  } catch (customRoleError) {
    if (normalizedRole !== "host" && normalizedRole !== "door") {
      throw customRoleError;
    }

    const memberRole: OrganizationMembershipRole = "org:member";
    await setClerkOrganizationMembershipRole(clerkOrganizations, {
      organizationId,
      userId,
      role: memberRole,
    });
    return {
      clerkRole: memberRole,
      usedMemberFallback: true,
    };
  }
}
