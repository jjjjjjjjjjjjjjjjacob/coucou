import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

type TestBackend = ReturnType<typeof convexTest>;

interface SeedWorkspaceOptions {
  clerkOrganizationId?: string;
  kind?: string;
  name: string;
  slug: string;
}

async function seedWorkspace(
  testBackend: TestBackend,
  { clerkOrganizationId, kind, name, slug }: SeedWorkspaceOptions,
) {
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.insert("workspaces", {
      clerkOrganizationId,
      clerkOrganizationSlug: clerkOrganizationId ? slug : undefined,
      createdAt: 1,
      kind,
      name,
      slug,
      updatedAt: 1,
    });
  });
}

async function seedMembership(
  testBackend: TestBackend,
  clerkUserId: string,
  organizationId: string,
  role: string,
) {
  await testBackend.run(async (databaseContext) => {
    await databaseContext.db.insert("orgMemberships", {
      clerkUserId,
      organizationId,
      role,
      createdAt: 1,
      updatedAt: 1,
    });
  });
}

function createIdentity(
  subject: string,
  organization?: { id: string; role: string; slug: string },
): Partial<UserIdentity> {
  return {
    subject,
    ...(organization
      ? {
          org_id: organization.id,
          org_slug: organization.slug,
          role: organization.role,
        }
      : {}),
  } as unknown as Partial<UserIdentity>;
}

async function seedWorkspaceNavigationFixture(testBackend: TestBackend) {
  await seedWorkspace(testBackend, {
    clerkOrganizationId: "org_coucou",
    kind: "admin",
    name: "Coucou",
    slug: "coucou",
  });
  await seedWorkspace(testBackend, {
    clerkOrganizationId: "org_zebra",
    name: "Zebra Room",
    slug: "zebra-room",
  });
  await seedWorkspace(testBackend, {
    name: "Alpha House",
    slug: "alpha-house",
  });
  await seedWorkspace(testBackend, {
    clerkOrganizationId: "org_internal",
    kind: "admin",
    name: "Internal Tools",
    slug: "internal-tools",
  });
}

describe("workspace navigation access", () => {
  it("returns no workspaces for signed-out users", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspaceNavigationFixture(testBackend);

    await expect(
      testBackend.query(api.workspaces.listAccessibleWorkspaceNavigationForUser, {}),
    ).resolves.toEqual({
      coucouOrganizationId: null,
      hasCoucouOrganizationAccess: false,
      tenantWorkspaces: [],
    });
  });

  it("returns every configured tenant to active Coucou members without tenant memberships", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspaceNavigationFixture(testBackend);
    const platformBackend = testBackend.withIdentity(
      createIdentity("platform_user", {
        id: "org_coucou",
        role: "org:admin",
        slug: "coucou",
      }),
    );

    const navigationAccess = await platformBackend.query(
      api.workspaces.listAccessibleWorkspaceNavigationForUser,
      {},
    );

    expect(navigationAccess.hasCoucouOrganizationAccess).toBe(true);
    expect(
      navigationAccess.tenantWorkspaces.map((workspace) => ({
        membershipRole: workspace.membershipRole,
        name: workspace.name,
        slug: workspace.slug,
      })),
    ).toEqual([
      { membershipRole: "org:admin", name: "Alpha House", slug: "alpha-house" },
      { membershipRole: "org:admin", name: "Zebra Room", slug: "zebra-room" },
    ]);
  });

  it("keeps ordinary users limited to readable workspace memberships", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspaceNavigationFixture(testBackend);
    await seedMembership(testBackend, "tenant_user", "org_zebra", "org:member");
    await seedMembership(testBackend, "tenant_user", "org_internal", "org:billing");
    const tenantBackend = testBackend.withIdentity(createIdentity("tenant_user"));

    const navigationAccess = await tenantBackend.query(
      api.workspaces.listAccessibleWorkspaceNavigationForUser,
      {},
    );

    expect(navigationAccess.hasCoucouOrganizationAccess).toBe(false);
    expect(
      navigationAccess.tenantWorkspaces.map((workspace) => ({
        membershipRole: workspace.membershipRole,
        slug: workspace.slug,
      })),
    ).toEqual([{ membershipRole: "org:member", slug: "zebra-room" }]);
  });

  it("uses platform-wide admin navigation access instead of a lower tenant role", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspaceNavigationFixture(testBackend);
    await seedMembership(testBackend, "platform_user", "org_coucou", "org:member");
    await seedMembership(testBackend, "platform_user", "org_zebra", "org:member");
    const platformBackend = testBackend.withIdentity(
      createIdentity("platform_user", {
        id: "org_zebra",
        role: "org:member",
        slug: "zebra-room",
      }),
    );

    const navigationAccess = await platformBackend.query(
      api.workspaces.listAccessibleWorkspaceNavigationForUser,
      {},
    );

    expect(navigationAccess.hasCoucouOrganizationAccess).toBe(true);
    expect(navigationAccess.tenantWorkspaces).toHaveLength(2);
    expect(
      navigationAccess.tenantWorkspaces.every(
        (workspace) => workspace.membershipRole === "org:admin",
      ),
    ).toBe(true);
  });
});
