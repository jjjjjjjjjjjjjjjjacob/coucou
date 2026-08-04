import type { ClerkClient, Organization, OrganizationMembership } from "@clerk/backend";
import { describe, expect, it } from "vitest";
import {
  getOrCreateCoucouTenantOrganization,
  getOrCreateTenantAdminMembership,
} from "../convex/lib/clerkTenantProvisioning";

type ClerkOrganizationsApi = ClerkClient["organizations"];

function createOrganization(
  publicMetadata: Record<string, unknown> = {
    coucouTenant: "true",
    workspaceSlug: "danza-organica",
  },
  createdBy = "user_coucou_admin",
): Organization {
  return {
    id: "org_danza",
    name: "Danza Organica",
    slug: "danza-organica",
    publicMetadata,
    createdBy,
  } as unknown as Organization;
}

function createMembership(role = "org:admin"): OrganizationMembership {
  return {
    id: "orgmem_danza_admin",
    role,
    organization: {
      id: "org_danza",
    },
    publicUserData: {
      userId: "user_coucou_admin",
    },
  } as unknown as OrganizationMembership;
}

function createNotFoundError(): Record<string, unknown> {
  return { status: 404, errors: [{ code: "resource_not_found" }] };
}

describe("Clerk tenant provisioning", () => {
  it("reuses an existing Coucou tenant organization", async () => {
    const existingOrganization = createOrganization();
    let createCallCount = 0;
    const clerkOrganizations = {
      getOrganization: async () => existingOrganization,
      createOrganization: async () => {
        createCallCount += 1;
        return existingOrganization;
      },
    } as unknown as ClerkOrganizationsApi;

    const organization = await getOrCreateCoucouTenantOrganization(clerkOrganizations, {
      name: "Danza Organica",
      slug: "danza-organica",
      createdByClerkUserId: "user_coucou_admin",
    });

    expect(organization).toBe(existingOrganization);
    expect(createCallCount).toBe(0);
  });

  it("creates the organization when its slug is available", async () => {
    const createdOrganization = createOrganization();
    let lookupCallCount = 0;
    let createCallCount = 0;
    const clerkOrganizations = {
      getOrganization: async () => {
        lookupCallCount += 1;
        throw createNotFoundError();
      },
      createOrganization: async () => {
        createCallCount += 1;
        return createdOrganization;
      },
    } as unknown as ClerkOrganizationsApi;

    const organization = await getOrCreateCoucouTenantOrganization(clerkOrganizations, {
      name: "Danza Organica",
      slug: "danza-organica",
      createdByClerkUserId: "user_coucou_admin",
    });

    expect(organization).toBe(createdOrganization);
    expect(lookupCallCount).toBe(1);
    expect(createCallCount).toBe(1);
  });

  it("adopts a matching untagged organization created by the current user", async () => {
    const untaggedOrganization = createOrganization({});
    const taggedOrganization = createOrganization();
    let metadataUpdateCallCount = 0;
    const clerkOrganizations = {
      getOrganization: async () => untaggedOrganization,
      updateOrganizationMetadata: async () => {
        metadataUpdateCallCount += 1;
        return taggedOrganization;
      },
    } as unknown as ClerkOrganizationsApi;

    const organization = await getOrCreateCoucouTenantOrganization(clerkOrganizations, {
      name: "Danza Organica",
      slug: "danza-organica",
      createdByClerkUserId: "user_coucou_admin",
    });

    expect(organization).toBe(taggedOrganization);
    expect(metadataUpdateCallCount).toBe(1);
  });

  it("recovers when another attempt creates the organization concurrently", async () => {
    const createdOrganization = createOrganization();
    let lookupCallCount = 0;
    const clerkOrganizations = {
      getOrganization: async () => {
        lookupCallCount += 1;
        if (lookupCallCount === 1) {
          throw createNotFoundError();
        }
        return createdOrganization;
      },
      createOrganization: async () => {
        throw {
          status: 422,
          errors: [{ code: "form_identifier_exists", message: "Slug already exists" }],
        };
      },
    } as unknown as ClerkOrganizationsApi;

    await expect(
      getOrCreateCoucouTenantOrganization(clerkOrganizations, {
        name: "Danza Organica",
        slug: "danza-organica",
        createdByClerkUserId: "user_coucou_admin",
      }),
    ).resolves.toBe(createdOrganization);
  });

  it("does not reuse a slug owned by an unrelated Clerk organization", async () => {
    const unrelatedOrganization = createOrganization({}, "user_someone_else");
    const clerkOrganizations = {
      getOrganization: async () => unrelatedOrganization,
    } as unknown as ClerkOrganizationsApi;

    await expect(
      getOrCreateCoucouTenantOrganization(clerkOrganizations, {
        name: "Danza Organica",
        slug: "danza-organica",
        createdByClerkUserId: "user_coucou_admin",
      }),
    ).rejects.toThrow("already in use by another organization");
  });

  it("reuses an existing tenant admin membership without sending an invitation", async () => {
    const existingMembership = createMembership();
    let createCallCount = 0;
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({
        data: [existingMembership],
        totalCount: 1,
      }),
      createOrganizationMembership: async () => {
        createCallCount += 1;
        return existingMembership;
      },
    } as unknown as ClerkOrganizationsApi;

    const membership = await getOrCreateTenantAdminMembership(clerkOrganizations, {
      organizationId: "org_danza",
      tenantAdminClerkUserId: "user_coucou_admin",
    });

    expect(membership).toBe(existingMembership);
    expect(createCallCount).toBe(0);
  });

  it("directly creates an admin membership when the user is not yet a member", async () => {
    const createdMembership = createMembership();
    let invitationCallCount = 0;
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({ data: [], totalCount: 0 }),
      createOrganizationMembership: async () => createdMembership,
      createOrganizationInvitation: async () => {
        invitationCallCount += 1;
        throw new Error("Invitation API should not be called");
      },
    } as unknown as ClerkOrganizationsApi;

    const membership = await getOrCreateTenantAdminMembership(clerkOrganizations, {
      organizationId: "org_danza",
      tenantAdminClerkUserId: "user_coucou_admin",
    });

    expect(membership).toBe(createdMembership);
    expect(invitationCallCount).toBe(0);
  });

  it("promotes an existing tenant member directly to admin", async () => {
    const existingMembership = createMembership("org:member");
    const promotedMembership = createMembership();
    let updateCallCount = 0;
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({
        data: [existingMembership],
        totalCount: 1,
      }),
      updateOrganizationMembership: async () => {
        updateCallCount += 1;
        return promotedMembership;
      },
    } as unknown as ClerkOrganizationsApi;

    const membership = await getOrCreateTenantAdminMembership(clerkOrganizations, {
      organizationId: "org_danza",
      tenantAdminClerkUserId: "user_coucou_admin",
    });

    expect(membership).toBe(promotedMembership);
    expect(updateCallCount).toBe(1);
  });
});
