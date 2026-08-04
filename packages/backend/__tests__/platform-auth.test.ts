import type { UserIdentity } from "convex/server";
import { describe, expect, it } from "vitest";
import type { QueryCtx } from "../convex/_generated/server";
import { requireCoucouPlatformMember } from "../convex/lib/platformAuth";

function createIdentity(claims: Record<string, string>): UserIdentity {
  return {
    subject: "user_123",
    issuer: "https://example.clerk.accounts.dev",
    tokenIdentifier: "token_123",
    ...claims,
  } as unknown as UserIdentity;
}

function createAuthContext(identity: UserIdentity | null) {
  return {
    auth: {
      getUserIdentity: async () => identity,
    },
  };
}

function createAuthContextWithStoredCoucouMembership(identity: UserIdentity | null) {
  const db = {
    query: (tableName: string) => ({
      withIndex: () => ({
        unique: async () => {
          if (tableName === "workspaces") {
            return {
              _id: "workspace_coucou",
              slug: "coucou",
              kind: "admin",
              clerkOrganizationId: "org_coucou",
            };
          }

          if (tableName === "orgMemberships") {
            return {
              _id: "membership_coucou",
              clerkUserId: "user_123",
              organizationId: "org_coucou",
              role: "org:member",
            };
          }

          return null;
        },
        first: async () => null,
        filter: () => ({
          unique: async () => ({
            _id: "membership_coucou",
            clerkUserId: "user_123",
            organizationId: "org_coucou",
            role: "org:member",
          }),
        }),
      }),
    }),
  } as unknown as QueryCtx["db"];

  return {
    ...createAuthContext(identity),
    db,
  };
}

function createActionAuthContext(
  identity: UserIdentity | null,
  hasCoucouOrganizationAccess: boolean,
) {
  let queryCallCount = 0;

  return {
    ...createAuthContext(identity),
    runQuery: async () => {
      queryCallCount += 1;

      if (queryCallCount === 1) {
        return identity?.subject ?? "user_123";
      }

      if (queryCallCount === 2) {
        return hasCoucouOrganizationAccess
          ? [
              {
                organizationId: "org_coucou",
                role: "org:member",
              },
            ]
          : [];
      }

      return {
        hasCoucouOrganizationAccess,
        tenantWorkspaces: [],
      };
    },
  };
}

describe("requireCoucouPlatformMember", () => {
  it("allows active members of the Coucou organization", async () => {
    const identity = createIdentity({ org_slug: "coucou" });

    await expect(requireCoucouPlatformMember(createAuthContext(identity))).resolves.toBe(identity);
  });

  it("rejects users without an active Coucou organization", async () => {
    const identity = createIdentity({ org_slug: "tenant-partner" });

    await expect(requireCoucouPlatformMember(createAuthContext(identity))).rejects.toThrow(
      "Forbidden",
    );
  });

  it("allows synced Coucou members without active Coucou organization", async () => {
    const identity = createIdentity({
      org_id: "org_tenant",
      org_slug: "tenant-partner",
    });

    await expect(
      requireCoucouPlatformMember(createAuthContextWithStoredCoucouMembership(identity)),
    ).resolves.toBe(identity);
  });

  it("allows synced Coucou members from an action context", async () => {
    const identity = createIdentity({
      org_id: "org_tenant",
      org_slug: "tenant-partner",
    });

    await expect(
      requireCoucouPlatformMember(createActionAuthContext(identity, true)),
    ).resolves.toBe(identity);
  });

  it("rejects action callers without synced Coucou membership", async () => {
    const identity = createIdentity({
      org_id: "org_tenant",
      org_slug: "tenant-partner",
    });

    await expect(
      requireCoucouPlatformMember(createActionAuthContext(identity, false)),
    ).rejects.toThrow("Forbidden");
  });

  it("rejects signed-out requests", async () => {
    await expect(requireCoucouPlatformMember(createAuthContext(null))).rejects.toThrow(
      "Unauthorized",
    );
  });
});
