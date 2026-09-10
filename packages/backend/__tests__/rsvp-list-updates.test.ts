/// <reference types="vite/client" />

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import aggregateComponentSchema from "../../../node_modules/@convex-dev/aggregate/dist/esm/component/schema.js";
import { api } from "../convex/_generated/api";
import type { Id, TableNames } from "../convex/_generated/dataModel";
import { rsvpAggregate } from "../convex/lib/rsvpAggregate";
import { updateRsvpListKeyRecords } from "../convex/lib/rsvpListKey";
import schema from "../convex/schema";

const convexModules = import.meta.glob("../convex/**/*.ts");
const aggregateModules = import.meta.glob(
  "../../../node_modules/@convex-dev/aggregate/dist/esm/component/**/*.js",
);
const workspaceScope = { siteKey: "dojo", workspaceSlug: "dojo-pomodoro" };

async function setupGuestlist(guestCount = 2) {
  const backend = convexTest(schema, convexModules);
  backend.registerComponent("rsvpAggregate", aggregateComponentSchema, aggregateModules);
  const host = backend.withIdentity({
    subject: "host",
    org_id: "org_dojo",
    role: "org:admin",
  });
  const records = await backend.run(async (context) => {
    await context.db.insert("workspaces", {
      slug: workspaceScope.workspaceSlug,
      name: "Dojo",
      clerkOrganizationId: "org_dojo",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const eventId = await context.db.insert("events", {
      ...workspaceScope,
      name: "Guestlist test",
      location: "Test venue",
      eventDate: Date.now(),
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const rsvpIds: Id<"rsvps">[] = [];
    for (let guestIndex = 0; guestIndex < guestCount; guestIndex++) {
      const clerkUserId = `guest-${guestIndex}`;
      const rsvpId = await context.db.insert("rsvps", {
        eventId,
        clerkUserId,
        listKey: "general",
        status: "approved",
        approvalStatus: "approved",
        ticketStatus: "issued",
        shareContact: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      rsvpIds.push(rsvpId);
      const rsvp = await context.db.get(rsvpId);
      if (!rsvp) throw new Error("Failed to seed RSVP");
      await rsvpAggregate.insertIfDoesNotExist(context, rsvp);
      await context.db.insert("redemptions", {
        eventId,
        clerkUserId,
        listKey: "general",
        code: `ticket-${guestIndex}`,
        unredeemHistory: [],
        createdAt: Date.now(),
      });
      for (const decision of ["denied", "approved"]) {
        await context.db.insert("approvals", {
          eventId,
          rsvpId,
          clerkUserId,
          listKey: "general",
          decision,
          decidedBy: "host",
          decidedAt: Date.now(),
        });
      }
    }
    return { eventId, rsvpIds };
  });
  return { backend, host, ...records };
}

async function readGuestlist(backend: TestConvex<typeof schema>) {
  return await backend.run(async (context) => ({
    rsvps: await context.db.query("rsvps").collect(),
    redemptions: await context.db.query("redemptions").collect(),
    approvals: await context.db.query("approvals").collect(),
    aggregateCount: await rsvpAggregate.count(context),
  }));
}

afterEach(() => vi.restoreAllMocks());

describe("RSVP list updates", () => {
  it("moves 20 guests, their tickets, approval histories, and aggregate counts together", async () => {
    const { backend, host, eventId, rsvpIds } = await setupGuestlist(20);
    const result = await host.mutation(api.rsvps.bulkUpdateListKey, {
      ...workspaceScope,
      updates: rsvpIds.map((rsvpId) => ({ rsvpId, listKey: "vip" })),
    });
    expect(result).toEqual({ success: 20, failed: 0, errors: [] });
    const state = await readGuestlist(backend);
    expect(state.rsvps).toHaveLength(20);
    expect(state.redemptions).toHaveLength(20);
    expect(state.approvals).toHaveLength(40);
    for (const record of [...state.rsvps, ...state.redemptions, ...state.approvals]) {
      expect(record.listKey).toBe("vip");
    }
    for (const rsvp of state.rsvps) {
      expect(rsvp).toMatchObject({ approvalStatus: "approved", ticketStatus: "issued" });
    }
    const counts = await backend.run(async (context) => ({
      general: await rsvpAggregate.count(context, {
        bounds: { prefix: [eventId, "approved", "general"] },
      }),
      vip: await rsvpAggregate.count(context, {
        bounds: { prefix: [eventId, "approved", "vip"] },
      }),
    }));
    expect(counts).toEqual({ general: 0, vip: 20 });
    expect(state.aggregateCount).toBe(20);
  });

  it("uses the RSVP index without scanning unrelated approvals for a list change", async () => {
    const { backend, rsvpIds } = await setupGuestlist();
    await backend.run(async (context) => {
      const rsvp = await context.db.get(rsvpIds[0]);
      if (!rsvp) throw new Error("Missing RSVP");
      const indexedQueries: string[] = [];
      await updateRsvpListKeyRecords(
        {
          ...context,
          db: {
            ...context.db,
            query: <TableName extends TableNames>(tableName: TableName) => {
              const tableQuery = context.db.query(tableName);
              if (tableName === "approvals") {
                const withIndex = tableQuery.withIndex.bind(tableQuery);
                vi.spyOn(tableQuery, "withIndex").mockImplementation((indexName, indexRange) => {
                  indexedQueries.push(String(indexName));
                  return withIndex(indexName, indexRange);
                });
                vi.spyOn(tableQuery, "filter").mockImplementation(() => {
                  throw new Error("An approvals table scan exceeds the bulk read budget");
                });
              }
              return tableQuery;
            },
          },
        },
        rsvp,
        "vip",
      );
      expect(indexedQueries).toEqual(["by_rsvp"]);
    });
    const state = await readGuestlist(backend);
    expect(state.approvals.filter((approval) => approval.rsvpId === rsvpIds[0])).toEqual([
      expect.objectContaining({ listKey: "vip", decision: "denied" }),
      expect.objectContaining({ listKey: "vip", decision: "approved" }),
    ]);
    expect(state.approvals.filter((approval) => approval.rsvpId === rsvpIds[1])).toEqual([
      expect.objectContaining({ listKey: "general" }),
      expect.objectContaining({ listKey: "general" }),
    ]);
  });

  it.each([
    false,
    true,
  ])("recovers a missing aggregate source and permits retries (destination exists: %s)", async (destinationExists) => {
    const { backend, host, rsvpIds } = await setupGuestlist(1);
    await backend.run(async (context) => {
      const rsvp = await context.db.get(rsvpIds[0]);
      if (!rsvp) throw new Error("Missing RSVP");
      await rsvpAggregate.delete(context, rsvp);
      if (destinationExists) {
        await rsvpAggregate.insert(context, { ...rsvp, listKey: "vip" });
      }
    });
    expect(
      await host.mutation(api.rsvps.bulkUpdateListKey, {
        ...workspaceScope,
        updates: [{ rsvpId: rsvpIds[0], listKey: "vip" }],
      }),
    ).toEqual({ success: 1, failed: 0, errors: [] });
    await host.mutation(api.rsvps.updateRsvpListKey, {
      ...workspaceScope,
      rsvpId: rsvpIds[0],
      listKey: "vip",
    });
    const state = await readGuestlist(backend);
    expect(state.aggregateCount).toBe(1);
    for (const record of [...state.rsvps, ...state.redemptions, ...state.approvals]) {
      expect(record.listKey).toBe("vip");
    }
  });

  it("rolls back every record and aggregate write when a later guest update fails", async () => {
    const { backend, host, rsvpIds } = await setupGuestlist();
    const beforeUpdate = await readGuestlist(backend);
    const insertAggregateEntry = rsvpAggregate.insertIfDoesNotExist.bind(rsvpAggregate);
    vi.spyOn(rsvpAggregate, "insertIfDoesNotExist")
      .mockImplementationOnce(insertAggregateEntry)
      .mockRejectedValueOnce(new Error("Aggregate write failed"));
    await expect(
      host.mutation(api.rsvps.bulkUpdateListKey, {
        ...workspaceScope,
        updates: rsvpIds.map((rsvpId) => ({ rsvpId, listKey: "vip" })),
      }),
    ).rejects.toThrow("Aggregate write failed");
    expect(await readGuestlist(backend)).toEqual(beforeUpdate);
  });

  it("reports missing and out-of-scope RSVPs without changing them", async () => {
    const { backend, host, rsvpIds } = await setupGuestlist(3);
    await backend.run(async (context) => {
      await context.db.delete(rsvpIds[1]);
      const otherEventId = await context.db.insert("events", {
        siteKey: "other-site",
        workspaceSlug: "other-workspace",
        name: "Other event",
        location: "Other venue",
        eventDate: Date.now(),
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await context.db.patch(rsvpIds[2], { eventId: otherEventId });
    });
    const result = await host.mutation(api.rsvps.bulkUpdateListKey, {
      ...workspaceScope,
      updates: rsvpIds.map((rsvpId) => ({ rsvpId, listKey: "vip" })),
    });
    expect(result).toEqual({
      success: 1,
      failed: 2,
      errors: [`RSVP ${rsvpIds[1]} not found`, `Failed to update ${rsvpIds[2]}: Event not found`],
    });
    const otherRsvp = await backend.run((context) => context.db.get(rsvpIds[2]));
    expect(otherRsvp?.listKey).toBe("general");
  });

  it("requires host access before writing any list changes", async () => {
    const { backend, rsvpIds } = await setupGuestlist();
    const beforeUpdate = await readGuestlist(backend);
    await expect(
      backend.mutation(api.rsvps.bulkUpdateListKey, {
        ...workspaceScope,
        updates: rsvpIds.map((rsvpId) => ({ rsvpId, listKey: "vip" })),
      }),
    ).rejects.toThrow("Unauthorized");
    expect(await readGuestlist(backend)).toEqual(beforeUpdate);
  });
});
