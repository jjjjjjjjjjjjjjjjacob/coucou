import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/exports.ts": () => import("../convex/exports"),
  "../convex/exportsQueries.ts": () => import("../convex/exportsQueries"),
  "../convex/mobileStaff.ts": () => import("../convex/mobileStaff"),
  "../convex/orgMemberships.ts": () => import("../convex/orgMemberships"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

type TestBackend = ReturnType<typeof convexTest>;

interface SeededMobileFixture {
  currentEventId: Id<"events">;
  otherEventId: Id<"events">;
  rsvpId: Id<"rsvps">;
}

function workspaceIdentity(
  role: string,
  subject: string = "staff_1",
): Partial<UserIdentity> {
  return {
    org_id: "org_venue",
    role,
    subject,
  } as unknown as Partial<UserIdentity>;
}

async function seedMobileFixture(
  testBackend: TestBackend,
): Promise<SeededMobileFixture> {
  return await testBackend.run(async (databaseContext) => {
    const now = Date.now();
    const workspaceId = await databaseContext.db.insert("workspaces", {
      clerkOrganizationId: "org_venue",
      clerkOrganizationSlug: "venue",
      createdAt: now,
      name: "Venue",
      slug: "venue",
      updatedAt: now,
    });
    await databaseContext.db.insert("workspaceSites", {
      appKind: "coucou",
      createdAt: now,
      domain: "venue.example.com",
      siteKey: "venue",
      updatedAt: now,
      workspaceId,
    });
    const currentEventId = await databaseContext.db.insert("events", {
      createdAt: now,
      eventDate: now,
      location: "Main room",
      name: "Current Night",
      siteKey: "venue",
      updatedAt: now,
      workspaceSlug: "venue",
    });
    const otherEventId = await databaseContext.db.insert("events", {
      createdAt: now,
      eventDate: now + 86_400_000,
      location: "Main room",
      name: "Tomorrow Night",
      siteKey: "venue",
      updatedAt: now,
      workspaceSlug: "venue",
    });
    const rsvpId = await databaseContext.db.insert("rsvps", {
      approvalStatus: "approved",
      attendanceStatus: "yes",
      attendees: 1,
      clerkUserId: "guest_1",
      createdAt: now,
      eventId: currentEventId,
      listKey: "general",
      shareContact: false,
      status: "approved",
      ticketStatus: "issued",
      updatedAt: now,
      userName: "Avery Chen",
    });
    await databaseContext.db.insert("redemptions", {
      clerkUserId: "guest_1",
      code: "AB12CD34",
      createdAt: now,
      eventId: currentEventId,
      listKey: "general",
      unredeemHistory: [],
    });
    await databaseContext.db.insert("rsvps", {
      approvalStatus: "approved",
      attendanceStatus: "yes",
      clerkUserId: "guest_2",
      createdAt: now,
      eventId: otherEventId,
      listKey: "general",
      shareContact: false,
      status: "approved",
      ticketStatus: "issued",
      updatedAt: now,
      userName: "Jordan Lee",
    });
    await databaseContext.db.insert("redemptions", {
      clerkUserId: "guest_2",
      code: "ZX98YU76",
      createdAt: now,
      eventId: otherEventId,
      listKey: "general",
      unredeemHistory: [],
    });

    return { currentEventId, otherEventId, rsvpId };
  });
}

describe("mobile staff façade", () => {
  it("denies generic members from scanning", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const memberBackend = testBackend.withIdentity(
      workspaceIdentity("org:member"),
    );

    await expect(
      memberBackend.mutation(api.mobileStaff.scanTicket, {
        code: "AB12CD34",
        eventId: fixture.currentEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      }),
    ).rejects.toThrow("Forbidden");
  });

  it("redeems once, remains idempotent, and preserves the first operator", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const firstDoorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door", "door_1"),
    );
    const secondDoorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door", "door_2"),
    );

    const [firstResult, secondResult] = await Promise.all([
      firstDoorBackend.mutation(api.mobileStaff.scanTicket, {
        code: "AB12CD34",
        eventId: fixture.currentEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      }),
      secondDoorBackend.mutation(api.mobileStaff.scanTicket, {
        code: "AB12CD34",
        eventId: fixture.currentEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      }),
    ]);

    expect(
      [firstResult.outcome, secondResult.outcome].sort(),
    ).toEqual(["already_redeemed", "redeemed"]);
    const redemption = await testBackend.run(async (databaseContext) => {
      return await databaseContext.db
        .query("redemptions")
        .withIndex("by_code", (queryBuilder) =>
          queryBuilder.eq("code", "AB12CD34"),
        )
        .unique();
    });
    expect(["door_1", "door_2"]).toContain(
      redemption?.redeemedByClerkUserId,
    );
    expect(redemption?.redeemedAt).toBeDefined();
  });

  it("returns wrong_event for another event in the same workspace", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const doorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door"),
    );

    const result = await doorBackend.mutation(api.mobileStaff.scanTicket, {
      code: "ZX98YU76",
      eventId: fixture.currentEventId,
      siteKey: "venue",
      workspaceSlug: "venue",
    });
    expect(result).toEqual({
      eventId: fixture.otherEventId,
      eventName: "Tomorrow Night",
      outcome: "wrong_event",
    });
  });

  it("appends undo history and restores an issued ticket", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const doorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door"),
    );
    await doorBackend.mutation(api.mobileStaff.scanTicket, {
      code: "AB12CD34",
      eventId: fixture.currentEventId,
      siteKey: "venue",
      workspaceSlug: "venue",
    });

    const undoResult = await doorBackend.mutation(api.mobileStaff.undoScan, {
      code: "AB12CD34",
      eventId: fixture.currentEventId,
      reason: "Accidental scan",
      siteKey: "venue",
      workspaceSlug: "venue",
    });
    expect(undoResult.outcome).toBe("undone");

    const records = await testBackend.run(async (databaseContext) => {
      const redemption = await databaseContext.db
        .query("redemptions")
        .withIndex("by_code", (queryBuilder) =>
          queryBuilder.eq("code", "AB12CD34"),
        )
        .unique();
      const rsvp = await databaseContext.db.get(fixture.rsvpId);
      return { redemption, rsvp };
    });
    expect(records.redemption?.redeemedAt).toBeUndefined();
    expect(records.redemption?.unredeemHistory).toHaveLength(1);
    expect(records.redemption?.unredeemHistory[0]?.reason).toBe(
      "Accidental scan",
    );
    expect(records.rsvp?.ticketStatus).toBe("issued");
  });

  it("limits immediate undo to the operator who performed the scan", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const scanningDoorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door", "door_1"),
    );
    const otherDoorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door", "door_2"),
    );
    await scanningDoorBackend.mutation(api.mobileStaff.scanTicket, {
      code: "AB12CD34",
      eventId: fixture.currentEventId,
      siteKey: "venue",
      workspaceSlug: "venue",
    });

    const result = await otherDoorBackend.mutation(
      api.mobileStaff.undoScan,
      {
        code: "AB12CD34",
        eventId: fixture.currentEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      },
    );
    expect(result.outcome).toBe("invalid");
  });

  it("rejects pending and disabled tickets without mutating them", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const doorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door"),
    );

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(fixture.rsvpId, {
        approvalStatus: "pending",
        status: "pending",
      });
    });
    const pendingResult = await doorBackend.mutation(
      api.mobileStaff.scanTicket,
      {
        code: "AB12CD34",
        eventId: fixture.currentEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      },
    );
    expect(pendingResult.outcome).toBe("not_eligible");

    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(fixture.rsvpId, {
        approvalStatus: "approved",
        status: "approved",
      });
      const redemption = await databaseContext.db
        .query("redemptions")
        .withIndex("by_code", (queryBuilder) =>
          queryBuilder.eq("code", "AB12CD34"),
        )
        .unique();
      if (redemption) {
        await databaseContext.db.patch(redemption._id, {
          disabledAt: Date.now(),
        });
      }
    });
    const disabledResult = await doorBackend.mutation(
      api.mobileStaff.scanTicket,
      {
        code: "AB12CD34",
        eventId: fixture.currentEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      },
    );
    expect(disabledResult.outcome).toBe("disabled");
  });

  it("blocks cross-workspace event scope", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedMobileFixture(testBackend);
    const outsideEventId = await testBackend.run(async (databaseContext) => {
      const now = Date.now();
      return await databaseContext.db.insert("events", {
        createdAt: now,
        eventDate: now,
        location: "Elsewhere",
        name: "Outside Event",
        siteKey: "outside",
        updatedAt: now,
        workspaceSlug: "outside",
      });
    });
    const doorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door"),
    );
    await expect(
      doorBackend.mutation(api.mobileStaff.scanTicket, {
        code: "AB12CD34",
        eventId: outsideEventId,
        siteKey: "venue",
        workspaceSlug: "venue",
      }),
    ).rejects.toThrow("Event not found");
  });

  it("allows Host and Admin manual entry changes while denying Door", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    const doorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door"),
    );
    await expect(
      doorBackend.mutation(api.mobileStaff.setEntryStatus, {
        checkedIn: true,
        rsvpId: fixture.rsvpId,
        siteKey: "venue",
        workspaceSlug: "venue",
      }),
    ).rejects.toThrow("Forbidden");

    const hostBackend = testBackend.withIdentity(
      workspaceIdentity("org:host", "host_1"),
    );
    const checkedIn = await hostBackend.mutation(
      api.mobileStaff.setEntryStatus,
      {
        checkedIn: true,
        rsvpId: fixture.rsvpId,
        siteKey: "venue",
        workspaceSlug: "venue",
      },
    );
    expect(checkedIn.outcome).toBe("redeemed");

    const adminBackend = testBackend.withIdentity(
      workspaceIdentity("org:admin", "admin_1"),
    );
    const checkedOut = await adminBackend.mutation(
      api.mobileStaff.setEntryStatus,
      {
        checkedIn: false,
        rsvpId: fixture.rsvpId,
        siteKey: "venue",
        workspaceSlug: "venue",
      },
    );
    expect(checkedOut.outcome).toBe("undone");
  });

  it("limits CSV export to Host/Admin and includes escaped operational statuses", async () => {
    const testBackend = convexTest(schema, convexModules);
    const fixture = await seedMobileFixture(testBackend);
    await testBackend.run(async (databaseContext) => {
      await databaseContext.db.patch(fixture.rsvpId, {
        userName: "Chen, Avery",
      });
    });
    const exportArguments = {
      eventId: fixture.currentEventId,
      exportTimestamp: "2026-07-23T20:00:00.000Z",
      includeCustomFields: false,
      includeInvitedBy: false,
      includeNote: false,
      includePhone: false,
      includePrimaryFields: false,
      siteKey: "venue",
      workspaceSlug: "venue",
    };
    const doorBackend = testBackend.withIdentity(
      workspaceIdentity("org:door"),
    );
    await expect(
      doorBackend.action(api.exports.exportRsvpsCsv, exportArguments),
    ).rejects.toThrow("Forbidden");

    const hostBackend = testBackend.withIdentity(
      workspaceIdentity("org:host"),
    );
    const exportResult = await hostBackend.action(
      api.exports.exportRsvpsCsv,
      exportArguments,
    );
    expect(exportResult.csvContent).toContain(
      "Name,Approval Status,Attendance Status,Ticket Status,Entry Status",
    );
    expect(exportResult.csvContent).toContain(
      '"Chen, Avery",approved,yes,issued,not-checked-in',
    );
  });
});
