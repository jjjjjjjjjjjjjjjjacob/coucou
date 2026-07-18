import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { api, internal } from "../convex/_generated/api";
import { hashApiClientKey } from "../convex/lib/apiKeys";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/apiClients.ts": () => import("../convex/apiClients"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

const WORKSPACE_SLUG = "dojo-pomodoro";
const CLERK_ORGANIZATION_ID = "org_dojo";

type TestBackend = ReturnType<typeof convexTest>;

function setupTestBackend(): TestBackend {
  return convexTest(schema, convexModules);
}

function createHostIdentity(subject: string): Partial<UserIdentity> {
  return {
    subject,
    org_id: CLERK_ORGANIZATION_ID,
    role: "org:admin",
  } as unknown as Partial<UserIdentity>;
}

async function seedWorkspace(testBackend: TestBackend) {
  return await testBackend.run(async (databaseContext) => {
    return await databaseContext.db.insert("workspaces", {
      slug: WORKSPACE_SLUG,
      name: "Dojo Pomodoro",
      clerkOrganizationId: CLERK_ORGANIZATION_ID,
      clerkOrganizationSlug: WORKSPACE_SLUG,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

describe("apiClients.create", () => {
  it("issues a key once and stores only its hash", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));

    const created = await hostBackend.mutation(api.apiClients.create, {
      workspaceSlug: WORKSPACE_SLUG,
      displayName: "Partner integration",
      scopes: ["events:read", "rsvps:write"],
    });

    expect(created.plaintextKey.startsWith("coucou_sk_")).toBe(true);
    expect(created.keyPrefix).toBe(created.plaintextKey.slice(0, 14));

    const storedApiClient = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db.get(created.apiClientId);
    });
    expect(storedApiClient?.keyHash).toBe(await hashApiClientKey(created.plaintextKey));
    expect(JSON.stringify(storedApiClient)).not.toContain(created.plaintextKey);
  });

  it("rejects callers without host access", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);

    await expect(
      testBackend.mutation(api.apiClients.create, {
        workspaceSlug: WORKSPACE_SLUG,
        displayName: "No auth",
        scopes: ["events:read"],
      }),
    ).rejects.toThrow();
  });
});

describe("apiClients.resolveByKeyHash", () => {
  it("resolves an issued key and stops resolving after revocation", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));

    const created = await hostBackend.mutation(api.apiClients.create, {
      workspaceSlug: WORKSPACE_SLUG,
      displayName: "Partner integration",
      scopes: ["events:read"],
    });

    const keyHash = await hashApiClientKey(created.plaintextKey);
    const resolved = await testBackend.query(internal.apiClients.resolveByKeyHash, { keyHash });
    expect(resolved?.workspaceSlug).toBe(WORKSPACE_SLUG);
    expect(resolved?.apiClient.scopes).toEqual(["events:read"]);
    expect(resolved?.apiClient.revokedAt).toBeUndefined();

    await hostBackend.mutation(api.apiClients.revoke, {
      workspaceSlug: WORKSPACE_SLUG,
      apiClientId: created.apiClientId,
    });

    const resolvedAfterRevoke = await testBackend.query(internal.apiClients.resolveByKeyHash, {
      keyHash,
    });
    expect(resolvedAfterRevoke?.apiClient.revokedAt).toBeDefined();
  });

  it("returns null for unknown hashes", async () => {
    const testBackend = setupTestBackend();
    const resolved = await testBackend.query(internal.apiClients.resolveByKeyHash, {
      keyHash: "0".repeat(64),
    });
    expect(resolved).toBeNull();
  });
});

describe("apiClients.listForWorkspace", () => {
  it("lists keys without exposing hashes", async () => {
    const testBackend = setupTestBackend();
    await seedWorkspace(testBackend);
    const hostBackend = testBackend.withIdentity(createHostIdentity("user_host"));

    await hostBackend.mutation(api.apiClients.create, {
      workspaceSlug: WORKSPACE_SLUG,
      displayName: "Partner integration",
      scopes: ["events:read"],
    });

    const listedApiClients = await hostBackend.query(api.apiClients.listForWorkspace, {
      workspaceSlug: WORKSPACE_SLUG,
    });
    expect(listedApiClients).toHaveLength(1);
    expect(listedApiClients[0].displayName).toBe("Partner integration");
    expect(JSON.stringify(listedApiClients)).not.toContain("keyHash");
  });
});
