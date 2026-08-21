import type { ClerkClient, OrganizationMembership } from "@clerk/backend";
import { describe, expect, it } from "vitest";
import {
  resolveRoleAfterClerkSynchronization,
  synchronizeClerkWorkspaceRole,
  toStoredOrganizationRole,
} from "../convex/lib/clerkWorkspaceRoles";

type ClerkOrganizationsApi = ClerkClient["organizations"];

function createMembership(role: string): OrganizationMembership {
  return {
    id: "membership_123",
    role,
    organization: { id: "organization_123" },
    publicUserData: { userId: "user_123" },
  } as unknown as OrganizationMembership;
}

describe("Clerk workspace role synchronization", () => {
  it("falls back to Clerk Member when a Host custom role is unavailable", async () => {
    const assignedRoles: string[] = [];
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({
        data: [createMembership("org:member")],
        totalCount: 1,
      }),
      updateOrganizationMembership: async ({ role }: { role: string }) => {
        assignedRoles.push(role);
        if (role === "org:host") {
          throw new Error("Custom role does not exist");
        }
        return createMembership(role);
      },
    } as unknown as ClerkOrganizationsApi;

    await expect(
      synchronizeClerkWorkspaceRole(clerkOrganizations, {
        organizationId: "organization_123",
        userId: "user_123",
        requestedRole: "host",
      }),
    ).resolves.toEqual({
      clerkRole: "org:member",
      usedMemberFallback: true,
    });
    expect(assignedRoles).toEqual(["org:host", "org:member"]);
    expect(toStoredOrganizationRole("host")).toBe("org:host");
  });

  it("creates a Clerk Member while retaining Door as the stored role", async () => {
    const createdRoles: string[] = [];
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({ data: [], totalCount: 0 }),
      createOrganizationMembership: async ({ role }: { role: string }) => {
        createdRoles.push(role);
        if (role === "org:door") {
          throw new Error("Custom role does not exist");
        }
        return createMembership(role);
      },
    } as unknown as ClerkOrganizationsApi;

    await expect(
      synchronizeClerkWorkspaceRole(clerkOrganizations, {
        organizationId: "organization_123",
        userId: "user_123",
        requestedRole: "org:door",
      }),
    ).resolves.toEqual({
      clerkRole: "org:member",
      usedMemberFallback: true,
    });
    expect(createdRoles).toEqual(["org:door", "org:member"]);
    expect(toStoredOrganizationRole("door")).toBe("org:door");
  });

  it("uses Clerk's built-in Member role directly", async () => {
    const createdRoles: string[] = [];
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({ data: [], totalCount: 0 }),
      createOrganizationMembership: async ({ role }: { role: string }) => {
        createdRoles.push(role);
        return createMembership(role);
      },
    } as unknown as ClerkOrganizationsApi;

    await expect(
      synchronizeClerkWorkspaceRole(clerkOrganizations, {
        organizationId: "organization_123",
        userId: "user_123",
        requestedRole: "member",
      }),
    ).resolves.toEqual({
      clerkRole: "org:member",
      usedMemberFallback: false,
    });
    expect(createdRoles).toEqual(["org:member"]);
    expect(toStoredOrganizationRole("member")).toBe("org:member");
  });

  it("does not hide an Admin synchronization error", async () => {
    const clerkOrganizations = {
      getOrganizationMembershipList: async () => ({ data: [], totalCount: 0 }),
      createOrganizationMembership: async () => {
        throw new Error("Clerk unavailable");
      },
    } as unknown as ClerkOrganizationsApi;

    await expect(
      synchronizeClerkWorkspaceRole(clerkOrganizations, {
        organizationId: "organization_123",
        userId: "user_123",
        requestedRole: "admin",
      }),
    ).rejects.toThrow("Clerk unavailable");
  });

  it("preserves Convex Host and Door roles when Clerk webhooks report fallback Member", () => {
    expect(resolveRoleAfterClerkSynchronization("org:host", "org:member")).toBe("org:host");
    expect(resolveRoleAfterClerkSynchronization("org:door", "org:member")).toBe("org:door");
    expect(resolveRoleAfterClerkSynchronization("org:admin", "org:member")).toBe("org:member");
    expect(resolveRoleAfterClerkSynchronization("org:host", "org:admin")).toBe("org:admin");
  });
});
