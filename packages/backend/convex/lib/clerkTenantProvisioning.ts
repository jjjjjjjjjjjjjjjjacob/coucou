import type { ClerkClient, Organization, OrganizationInvitation } from "@clerk/backend";

type ClerkOrganizationsApi = ClerkClient["organizations"];

interface TenantOrganizationInput {
  name: string;
  slug: string;
  createdByClerkUserId: string;
}

interface TenantInvitationInput {
  organizationId: string;
  workspaceSlug: string;
  tenantAdminEmail: string;
  inviterClerkUserId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getClerkResponseStatus(error: unknown): number | null {
  if (!isRecord(error)) {
    return null;
  }

  return typeof error.status === "number" ? error.status : null;
}

function describeClerkError(error: unknown, operation: string): string {
  if (!isRecord(error)) {
    return `${operation} failed`;
  }

  const clerkErrors = Array.isArray(error.errors) ? error.errors : [];
  const errorDescriptions = clerkErrors.flatMap((clerkError) => {
    if (!isRecord(clerkError)) {
      return [];
    }

    const longMessage =
      typeof clerkError.longMessage === "string" ? clerkError.longMessage : undefined;
    const message = typeof clerkError.message === "string" ? clerkError.message : undefined;
    const code = typeof clerkError.code === "string" ? clerkError.code : undefined;
    const description = longMessage ?? message ?? code;
    return description ? [description] : [];
  });
  const clerkTraceId =
    typeof error.clerkTraceId === "string" ? ` (Clerk trace: ${error.clerkTraceId})` : "";

  return errorDescriptions.length > 0
    ? `${operation} failed: ${errorDescriptions.join("; ")}${clerkTraceId}`
    : `${operation} failed${clerkTraceId}`;
}

async function findOrganizationBySlug(
  clerkOrganizations: ClerkOrganizationsApi,
  slug: string,
): Promise<Organization | null> {
  try {
    return await clerkOrganizations.getOrganization({ slug });
  } catch (error: unknown) {
    if (getClerkResponseStatus(error) === 404) {
      return null;
    }

    throw new Error(describeClerkError(error, "Clerk organization lookup"));
  }
}

async function requireMatchingTenantOrganization(
  clerkOrganizations: ClerkOrganizationsApi,
  organization: Organization,
  { name, slug, createdByClerkUserId }: TenantOrganizationInput,
): Promise<Organization> {
  const isCoucouTenant = organization.publicMetadata?.coucouTenant === "true";
  const metadataWorkspaceSlug = organization.publicMetadata?.workspaceSlug;

  if (isCoucouTenant && metadataWorkspaceSlug === slug) {
    return organization;
  }

  const hasCoucouTenantMetadata =
    organization.publicMetadata?.coucouTenant !== undefined || metadataWorkspaceSlug !== undefined;
  const hasMatchingName = organization.name.trim().toLowerCase() === name.trim().toLowerCase();
  const wasCreatedByCurrentUser = organization.createdBy === createdByClerkUserId;

  if (hasCoucouTenantMetadata || !hasMatchingName || !wasCreatedByCurrentUser) {
    throw new Error(
      `Clerk organization slug "${slug}" is already in use by another organization`,
    );
  }

  try {
    return await clerkOrganizations.updateOrganizationMetadata(organization.id, {
      publicMetadata: {
        coucouTenant: "true",
        workspaceSlug: slug,
      },
    });
  } catch (error: unknown) {
    throw new Error(describeClerkError(error, "Clerk organization metadata update"));
  }
}

export async function getOrCreateCoucouTenantOrganization(
  clerkOrganizations: ClerkOrganizationsApi,
  { name, slug, createdByClerkUserId }: TenantOrganizationInput,
): Promise<Organization> {
  const existingOrganization = await findOrganizationBySlug(clerkOrganizations, slug);
  if (existingOrganization) {
    return await requireMatchingTenantOrganization(clerkOrganizations, existingOrganization, {
      name,
      slug,
      createdByClerkUserId,
    });
  }

  try {
    return await clerkOrganizations.createOrganization({
      name,
      slug,
      createdBy: createdByClerkUserId,
      publicMetadata: {
        coucouTenant: "true",
        workspaceSlug: slug,
      },
    });
  } catch (error: unknown) {
    // A concurrent or partially completed attempt may have created the organization
    // even though this request did not receive a successful response.
    const organizationCreatedByAnotherAttempt = await findOrganizationBySlug(
      clerkOrganizations,
      slug,
    );
    if (organizationCreatedByAnotherAttempt) {
      return await requireMatchingTenantOrganization(
        clerkOrganizations,
        organizationCreatedByAnotherAttempt,
        { name, slug, createdByClerkUserId },
      );
    }

    throw new Error(describeClerkError(error, "Clerk organization creation"));
  }
}

async function findPendingTenantAdminInvitation(
  clerkOrganizations: ClerkOrganizationsApi,
  organizationId: string,
  workspaceSlug: string,
  tenantAdminEmail: string,
): Promise<OrganizationInvitation | null> {
  const invitationList = await clerkOrganizations.getOrganizationInvitationList({
    organizationId,
    status: ["pending"],
    limit: 100,
  });

  return (
    invitationList.data.find(
      (invitation) =>
        invitation.emailAddress.toLowerCase() === tenantAdminEmail &&
        invitation.role === "org:admin" &&
        invitation.publicMetadata?.workspaceSlug === workspaceSlug,
    ) ?? null
  );
}

export async function getOrCreateTenantAdminInvitation(
  clerkOrganizations: ClerkOrganizationsApi,
  {
    organizationId,
    workspaceSlug,
    tenantAdminEmail,
    inviterClerkUserId,
  }: TenantInvitationInput,
): Promise<OrganizationInvitation> {
  const existingInvitation = await findPendingTenantAdminInvitation(
    clerkOrganizations,
    organizationId,
    workspaceSlug,
    tenantAdminEmail,
  );
  if (existingInvitation) {
    return existingInvitation;
  }

  try {
    return await clerkOrganizations.createOrganizationInvitation({
      organizationId,
      inviterUserId: inviterClerkUserId,
      emailAddress: tenantAdminEmail,
      role: "org:admin",
      redirectUrl: `/workspaces/${workspaceSlug}/dashboard`,
      publicMetadata: {
        workspaceSlug,
      },
    });
  } catch (error: unknown) {
    const invitationCreatedByAnotherAttempt = await findPendingTenantAdminInvitation(
      clerkOrganizations,
      organizationId,
      workspaceSlug,
      tenantAdminEmail,
    );
    if (invitationCreatedByAnotherAttempt) {
      return invitationCreatedByAnotherAttempt;
    }

    throw new Error(describeClerkError(error, "Clerk organization invitation"));
  }
}
