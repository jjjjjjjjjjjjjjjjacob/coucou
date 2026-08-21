import type { UserIdentity } from "convex/server";
import { describe, expect, it } from "vitest";
import type { Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import {
  type ResolvedWorkspaceAuthScope,
  requireWorkspaceCapabilityForResolvedScope,
  roleHasWorkspaceDoorAccess,
  roleHasWorkspaceReadAccess,
  roleHasWorkspaceWriteAccess,
} from "../convex/lib/workspaceAuth";

function createIdentity(role: string): UserIdentity {
  return {
    subject: "user_123",
    issuer: "https://example.clerk.accounts.dev",
    tokenIdentifier: "token_123",
    org_id: "org_123",
    role,
  } as unknown as UserIdentity;
}

function createIdentityWithoutRole(): UserIdentity {
  return {
    subject: "user_123",
    issuer: "https://example.clerk.accounts.dev",
    tokenIdentifier: "token_123",
    org_id: "org_123",
  } as unknown as UserIdentity;
}

function createCoucouPlatformIdentity(): UserIdentity {
  return {
    subject: "user_123",
    issuer: "https://example.clerk.accounts.dev",
    tokenIdentifier: "token_123",
    org_id: "org_coucou",
    org_slug: "coucou",
    role: "org:admin",
  } as unknown as UserIdentity;
}

function createAuthContext(identity: UserIdentity | null) {
  return {
    auth: {
      getUserIdentity: async () => identity,
    },
  };
}

function createAuthContextWithStoredMembership(identity: UserIdentity | null, role: string) {
  const db = {
    query: (tableName: string) => ({
      withIndex: () => ({
        first: async () => null,
        unique: async () => null,
        filter: () => ({
          unique: async () =>
            tableName === "orgMemberships"
              ? {
                  _id: "membership_123",
                  clerkUserId: "user_123",
                  organizationId: "org_123",
                  role,
                }
              : null,
        }),
      }),
    }),
  } as unknown as QueryCtx["db"];

  return {
    ...createAuthContext(identity),
    db,
  };
}

const resolvedWorkspaceScope: ResolvedWorkspaceAuthScope = {
  workspaceId: "workspace_123" as Id<"workspaces">,
  siteKey: "dojo-pomodoro",
  workspaceSlug: "dojo-pomodoro",
  brandName: "Dojo Pomodoro",
  clerkOrganizationId: "org_123",
  clerkOrganizationSlug: "dojo-pomodoro",
};

describe("workspace role capabilities", () => {
  it("treats admins and hosts as write roles", async () => {
    for (const role of ["org:admin", "admin", "org:host", "host"]) {
      expect(roleHasWorkspaceWriteAccess(role)).toBe(true);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "host",
        ),
      ).resolves.toEqual(resolvedWorkspaceScope);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "admin",
        ),
      ).resolves.toEqual(resolvedWorkspaceScope);
    }
  });

  it("treats door roles as door and read roles without write access", async () => {
    for (const role of ["org:door", "door"]) {
      expect(roleHasWorkspaceDoorAccess(role)).toBe(true);
      expect(roleHasWorkspaceReadAccess(role)).toBe(true);
      expect(roleHasWorkspaceWriteAccess(role)).toBe(false);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "read",
        ),
      ).resolves.toEqual(resolvedWorkspaceScope);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "door",
        ),
      ).resolves.toEqual(resolvedWorkspaceScope);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "host",
        ),
      ).rejects.toThrow("Forbidden");
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "admin",
        ),
      ).rejects.toThrow("Forbidden");
    }
  });

  it("keeps generic members read-only and denies mobile door operations", async () => {
    for (const role of ["org:member", "member"]) {
      expect(roleHasWorkspaceReadAccess(role)).toBe(true);
      expect(roleHasWorkspaceDoorAccess(role)).toBe(false);
      expect(roleHasWorkspaceWriteAccess(role)).toBe(false);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "read",
        ),
      ).resolves.toEqual(resolvedWorkspaceScope);
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createIdentity(role)),
          resolvedWorkspaceScope,
          "door",
        ),
      ).rejects.toThrow("Forbidden");
    }
  });

  it("uses stored membership when the active organization token omits role", async () => {
    await expect(
      requireWorkspaceCapabilityForResolvedScope(
        createAuthContextWithStoredMembership(createIdentityWithoutRole(), "org:admin"),
        resolvedWorkspaceScope,
        "host",
      ),
    ).resolves.toEqual(resolvedWorkspaceScope);
  });

  it("uses a stored Host role when Clerk represents the user as Member", async () => {
    await expect(
      requireWorkspaceCapabilityForResolvedScope(
        createAuthContextWithStoredMembership(createIdentity("org:member"), "org:host"),
        resolvedWorkspaceScope,
        "host",
      ),
    ).resolves.toEqual(resolvedWorkspaceScope);
  });

  it("uses a stored Member demotion ahead of a stale Clerk Admin token", async () => {
    await expect(
      requireWorkspaceCapabilityForResolvedScope(
        createAuthContextWithStoredMembership(createIdentity("org:admin"), "org:member"),
        resolvedWorkspaceScope,
        "host",
      ),
    ).rejects.toThrow("Forbidden");
  });

  it("allows Coucou platform members to access tenant workspace capabilities", async () => {
    for (const capability of ["read", "door", "host", "admin"] as const) {
      await expect(
        requireWorkspaceCapabilityForResolvedScope(
          createAuthContext(createCoucouPlatformIdentity()),
          resolvedWorkspaceScope,
          capability,
        ),
      ).resolves.toEqual(resolvedWorkspaceScope);
    }
  });
});
