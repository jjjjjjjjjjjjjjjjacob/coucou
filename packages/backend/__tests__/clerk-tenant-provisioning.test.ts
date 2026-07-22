import { describe, expect, it } from "bun:test";
import type { ClerkClient, Organization, OrganizationInvitation } from "@clerk/backend";
import {
  getOrCreateCoucouTenantOrganization,
  getOrCreateTenantAdminInvitation,
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

function createInvitation(): OrganizationInvitation {
  return {
    id: "orginv_danza_admin",
    organizationId: "org_danza",
    emailAddress: "events@coucou.events",
    role: "org:admin",
    status: "pending",
    publicMetadata: {
      workspaceSlug: "danza-organica",
    },
  } as unknown as OrganizationInvitation;
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

  it("reuses an existing pending tenant admin invitation", async () => {
    const existingInvitation = createInvitation();
    let createCallCount = 0;
    const clerkOrganizations = {
      getOrganizationInvitationList: async () => ({
        data: [existingInvitation],
        totalCount: 1,
      }),
      createOrganizationInvitation: async () => {
        createCallCount += 1;
        return existingInvitation;
      },
    } as unknown as ClerkOrganizationsApi;

    const invitation = await getOrCreateTenantAdminInvitation(clerkOrganizations, {
      organizationId: "org_danza",
      workspaceSlug: "danza-organica",
      tenantAdminEmail: "events@coucou.events",
      inviterClerkUserId: "user_coucou_admin",
    });

    expect(invitation).toBe(existingInvitation);
    expect(createCallCount).toBe(0);
  });
});
