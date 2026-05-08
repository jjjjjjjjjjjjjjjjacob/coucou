import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import type { QueryCtx } from "../convex/_generated/server";
import {
  type ResolvedWorkspaceAuthScope,
  requireWorkspaceCapabilityForResolvedScope,
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
    query: () => ({
      withIndex: () => ({
        filter: () => ({
          unique: async () => ({
            _id: "membership_123",
            clerkUserId: "user_123",
            organizationId: "org_123",
            role,
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

  it("treats members and door roles as read and door roles only", async () => {
    for (const role of ["org:member", "member", "org:door", "door"]) {
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

  it("uses stored membership when the active organization token omits role", async () => {
    await expect(
      requireWorkspaceCapabilityForResolvedScope(
        createAuthContextWithStoredMembership(createIdentityWithoutRole(), "org:admin"),
        resolvedWorkspaceScope,
        "host",
      ),
    ).resolves.toEqual(resolvedWorkspaceScope);
  });

  it("allows Coucou platform members to access tenant workspace capabilities", async () => {
    for (const capability of ["read", "host", "admin"] as const) {
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
