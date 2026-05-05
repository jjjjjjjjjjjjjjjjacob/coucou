import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
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

function createAuthContextWithStoredCoucouMembership(
  identity: UserIdentity | null,
) {
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

describe("requireCoucouPlatformMember", () => {
  it("allows active members of the Coucou organization", async () => {
    const identity = createIdentity({ org_slug: "coucou" });

    await expect(
      requireCoucouPlatformMember(createAuthContext(identity)),
    ).resolves.toBe(identity);
  });

  it("rejects users without an active Coucou organization", async () => {
    const identity = createIdentity({ org_slug: "tenant-house" });

    await expect(
      requireCoucouPlatformMember(createAuthContext(identity)),
    ).rejects.toThrow("Forbidden");
  });

  it("allows synced Coucou members without active Coucou organization", async () => {
    const identity = createIdentity({
      org_id: "org_tenant",
      org_slug: "tenant-house",
    });

    await expect(
      requireCoucouPlatformMember(
        createAuthContextWithStoredCoucouMembership(identity),
      ),
    ).resolves.toBe(identity);
  });

  it("rejects signed-out requests", async () => {
    await expect(
      requireCoucouPlatformMember(createAuthContext(null)),
    ).rejects.toThrow("Unauthorized");
  });
});
