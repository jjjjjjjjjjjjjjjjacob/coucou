import { describe, expect, it } from "bun:test";
import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/credentials.ts": () => import("../convex/credentials"),
  "../convex/events.ts": () => import("../convex/events"),
  "../convex/eventsNode.ts": () => import("../convex/eventsNode"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

type TestBackend = ReturnType<typeof convexTest>;

const WORKSPACE_SLUG = "dojo-pomodoro";
const SITE_KEY = "dojo";
const CLERK_ORGANIZATION_ID = "org_dojo";

function createWorkspaceIdentity(subject: string): Partial<UserIdentity> {
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

async function getListCredentialsForEvent(testBackend: TestBackend, eventId: Id<"events">) {
  return await testBackend.run(async (databaseContext) => {
    const listCredentials = await databaseContext.db.query("listCredentials").collect();
    return listCredentials.filter((listCredential) => listCredential.eventId === eventId);
  });
}

describe("Events Functions", () => {
  it("publishes a draft after updateAndPublish writes required fields and lists", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspace(testBackend);
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));
    const draftResult = await hostBackend.mutation(api.events.createDraft, {
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "Draft Night",
    });
    const eventDate = Date.now() + 86_400_000;

    await hostBackend.action(api.eventsNode.updateAndPublish, {
      eventId: draftResult.eventId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      patch: {
        name: "Published Night",
        location: "Main Room",
        eventDate,
        eventTimezone: "America/New_York",
        themeBackgroundColor: "#101820",
        themeTextColor: "#FEE715",
      },
      lists: [
        {
          listKey: "press",
          password: "blue-door",
          generateQR: true,
          sendQrOnApproval: true,
          approvalMessage: "Press approved.",
        },
      ],
    });

    const publishedEvent = await hostBackend.query(api.events.get, {
      eventId: draftResult.eventId,
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
    });
    const listCredentials = await getListCredentialsForEvent(testBackend, draftResult.eventId);

    expect(publishedEvent?.lifecycle).toBe("published");
    expect(publishedEvent?.name).toBe("Published Night");
    expect(publishedEvent?.location).toBe("Main Room");
    expect(publishedEvent?.eventDate).toBe(eventDate);
    expect(publishedEvent?.themeBackgroundColor).toBe("#101820");
    expect(publishedEvent?.themeTextColor).toBe("#FEE715");
    expect(listCredentials).toHaveLength(1);
    expect(listCredentials[0]?.listKey).toBe("press");
    expect(listCredentials[0]?.password).toBe("blue-door");
    expect(listCredentials[0]?.generateQR).toBe(true);
    expect(listCredentials[0]?.sendQrOnApproval).toBe(true);
    expect(listCredentials[0]?.approvalMessage).toBe("Press approved.");
  });

  it("keeps publishEvent strict for incomplete drafts", async () => {
    const testBackend = convexTest(schema, convexModules);
    await seedWorkspace(testBackend);
    const hostBackend = testBackend.withIdentity(createWorkspaceIdentity("host_1"));
    const draftResult = await hostBackend.mutation(api.events.createDraft, {
      siteKey: SITE_KEY,
      workspaceSlug: WORKSPACE_SLUG,
      name: "Incomplete Draft",
    });

    await expect(
      hostBackend.mutation(api.events.publishEvent, {
        eventId: draftResult.eventId,
        siteKey: SITE_KEY,
        workspaceSlug: WORKSPACE_SLUG,
      }),
    ).rejects.toThrow("Cannot publish: missing required fields");
  });

  it("should validate event record structure", () => {
    const mockEvent = {
      _id: "event_123",
      name: "Test Event",
      location: "Test Location",
      eventDate: Date.now(),
      password: "testpass",
      customFields: [],
      organizationId: "org_123",
      createdBy: "user_123",
      status: "active",
    };

    expect(mockEvent).toHaveProperty("name");
    expect(mockEvent).toHaveProperty("location");
    expect(mockEvent).toHaveProperty("eventDate");
    expect(mockEvent).toHaveProperty("password");
    expect(mockEvent).toHaveProperty("customFields");
    expect(Array.isArray(mockEvent.customFields)).toBe(true);
    expect(typeof mockEvent.eventDate).toBe("number");
  });

  it("should validate custom field structure", () => {
    const mockCustomField = {
      id: "field_123",
      name: "Dietary Requirements",
      type: "text",
      required: false,
      options: undefined,
    };

    expect(mockCustomField).toHaveProperty("id");
    expect(mockCustomField).toHaveProperty("name");
    expect(mockCustomField).toHaveProperty("type");
    expect(mockCustomField).toHaveProperty("required");
    expect(typeof mockCustomField.required).toBe("boolean");
  });

  it("should validate password strength requirements", () => {
    const validatePassword = (password: string) => {
      return password.length >= 6 && password.length <= 50;
    };

    expect(validatePassword("short")).toBe(false);
    expect(validatePassword("validpass")).toBe(true);
    expect(validatePassword("a".repeat(51))).toBe(false);
    expect(validatePassword("123456")).toBe(true);
  });

  it("should validate event date logic", () => {
    const now = Date.now();
    const tomorrow = now + 86400000; // 24 hours
    const yesterday = now - 86400000;

    const isValidEventDate = (eventDate: number) => {
      return eventDate > now;
    };

    expect(isValidEventDate(tomorrow)).toBe(true);
    expect(isValidEventDate(yesterday)).toBe(false);
    expect(isValidEventDate(now + 1000)).toBe(true);
  });

  it("should validate event status values", () => {
    const validStatuses = ["active", "inactive", "draft", "cancelled"];

    validStatuses.forEach((status) => {
      expect(typeof status).toBe("string");
      expect(status.length).toBeGreaterThan(0);
    });

    expect(validStatuses).toContain("active");
    expect(validStatuses).toContain("inactive");
  });
});
