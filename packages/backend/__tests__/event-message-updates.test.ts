import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/credentials.ts": () => import("../convex/credentials"),
  "../convex/events.ts": () => import("../convex/events"),
  "../convex/eventsNode.ts": () => import("../convex/eventsNode"),
  "../convex/workspaces.ts": () => import("../convex/workspaces"),
};

const workspaceScope = { siteKey: "dojo", workspaceSlug: "dojo-pomodoro" };

async function seedEventWithSentBlast(recipientCount = 1) {
  const testBackend = convexTest(schema, convexModules);
  const hostBackend = testBackend.withIdentity({
    subject: "host_1",
    org_id: "org_dojo",
    role: "org:admin",
  } as Partial<UserIdentity>);
  const eventRecords = await testBackend.run(async (databaseContext) => {
    const createdAt = Date.now() - 60_000;
    await databaseContext.db.insert("workspaces", {
      slug: workspaceScope.workspaceSlug,
      name: "Dojo Pomodoro",
      clerkOrganizationId: "org_dojo",
      createdAt,
      updatedAt: createdAt,
    });
    const eventId = await databaseContext.db.insert("events", {
      ...workspaceScope,
      name: "September Night",
      location: "Main Room",
      eventDate: Date.now() + 86_400_000,
      status: "active",
      lifecycle: "published",
      createdAt,
      updatedAt: createdAt,
    });
    const credentialId = await databaseContext.db.insert("listCredentials", {
      eventId,
      listKey: "guest",
      password: "guest-code",
      passwordNormalized: "guest-code",
      approvalMessage: "Original approval text",
      createdAt,
    });
    await databaseContext.db.insert("smsCodeClaims", {
      normalizedCode: "guest-code",
      kind: "event_list",
      eventId,
      listCredentialId: credentialId,
      status: "active",
      createdAt,
      updatedAt: createdAt,
    });
    const textBlastId = await databaseContext.db.insert("textBlasts", {
      eventId,
      name: "Guest invitation",
      message: "Reply JOIN to RSVP",
      targetLists: ["guest"],
      recipientCount,
      sentCount: recipientCount,
      failedCount: 0,
      sentBy: "host_1",
      status: "sent",
      createdAt,
      updatedAt: createdAt,
    });
    const replyActionId = await databaseContext.db.insert("textBlastReplyActions", {
      textBlastId,
      replyCode: "JOIN",
      replyCodeNormalized: "join",
      targetEventId: eventId,
      targetListKey: "guest",
      isEnabled: true,
      createdAt,
      updatedAt: createdAt,
    });
    for (let recipientIndex = 0; recipientIndex < recipientCount; recipientIndex++) {
      const phoneHash = `recipient-${recipientIndex}`;
      await databaseContext.db.insert("textBlastRecipients", {
        textBlastId,
        phoneHash,
        status: "sent",
        sourceEventIds: [eventId],
        sourceRsvpIds: [],
        sourceListKeys: ["guest"],
        recipientClerkUserIds: [],
        sentAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
      await databaseContext.db.insert("smsCodeClaims", {
        normalizedCode: "join",
        kind: "blast_action",
        eventId,
        replyActionId,
        textBlastId,
        phoneHash,
        status: "active",
        createdAt,
        updatedAt: createdAt,
      });
    }
    return { eventId, credentialId };
  });
  const readClaims = () =>
    testBackend.run((databaseContext) => databaseContext.db.query("smsCodeClaims").collect());
  return { testBackend, hostBackend, readClaims, ...eventRecords };
}

describe("Event message updates", () => {
  it("saves event and list messages without rewriting a large sent blast's SMS claims", async () => {
    const { testBackend, hostBackend, eventId, credentialId, readClaims } =
      await seedEventWithSentBlast(1_100);
    const originalClaims = await readClaims();

    await hostBackend.action(api.eventsNode.update, {
      ...workspaceScope,
      eventId,
      patch: { rsvpConfirmationMessage: "Thanks for your RSVP" },
      lists: [
        {
          id: credentialId,
          listKey: "guest",
          approvalMessage: "You're approved. See you there!",
          autoApproveLimit: 0,
          autoApproveDelayMinutes: 0,
        },
      ],
    });

    const { event, credential } = await testBackend.run(async (databaseContext) => ({
      event: await databaseContext.db.get(eventId),
      credential: await databaseContext.db.get(credentialId),
    }));
    expect(event?.rsvpConfirmationMessage).toBe("Thanks for your RSVP");
    expect(credential?.approvalMessage).toBe("You're approved. See you there!");
    expect(await readClaims()).toEqual(originalClaims);
  });

  it.each([
    api.events.updateListCredential,
    api.events.updateListCredentialWithCascade,
  ])("saves list messages without touching SMS claims when the submitted code is unchanged (%s)", async (updateListCredential) => {
    const { testBackend, hostBackend, credentialId, readClaims } = await seedEventWithSentBlast();
    const originalClaims = await readClaims();

    await hostBackend.mutation(updateListCredential, {
      ...workspaceScope,
      id: credentialId,
      patch: {
        password: " Guest-Code ",
        approvalMessage: "Updated approval text",
        includeTicketLinkOnApproval: false,
      },
    });

    const credential = await testBackend.run((databaseContext) =>
      databaseContext.db.get(credentialId),
    );
    expect(credential?.approvalMessage).toBe("Updated approval text");
    expect(credential?.passwordNormalized).toBe("guest-code");
    expect(await readClaims()).toEqual(originalClaims);
  });

  it.each([
    api.events.updateListCredential,
    api.events.updateListCredentialWithCascade,
  ])("still rejects password edits that conflict with an existing blast code (%s)", async (updateListCredential) => {
    const { testBackend, hostBackend, credentialId, readClaims } = await seedEventWithSentBlast();
    await testBackend.run(async (databaseContext) => {
      const replyAction = await databaseContext.db.query("textBlastReplyActions").first();
      if (!replyAction) throw new Error("Missing test reply action");
      await databaseContext.db.patch(replyAction._id, { targetListKey: "vip" });
    });
    const originalClaims = await readClaims();

    await expect(
      hostBackend.mutation(updateListCredential, {
        ...workspaceScope,
        id: credentialId,
        patch: { password: "JOIN" },
      }),
    ).rejects.toThrow("unavailable");
    const credential = await testBackend.run((databaseContext) =>
      databaseContext.db.get(credentialId),
    );
    expect(credential?.passwordNormalized).toBe("guest-code");
    expect(await readClaims()).toEqual(originalClaims);
  });

  it("still releases blast claims when their target list is renamed", async () => {
    const { hostBackend, credentialId, readClaims } = await seedEventWithSentBlast();
    await hostBackend.mutation(api.events.updateListCredential, {
      ...workspaceScope,
      id: credentialId,
      patch: { listKey: "renamed-guest" },
    });
    expect((await readClaims()).map((claim) => claim.kind)).toEqual(["event_list"]);
  });

  it("still releases and restores claims when the event's RSVP cutoff changes", async () => {
    const { hostBackend, eventId, readClaims } = await seedEventWithSentBlast();
    await hostBackend.mutation(api.events.update, {
      ...workspaceScope,
      eventId,
      eventEndDate: Date.now() - 1_000,
    });
    expect(await readClaims()).toEqual([]);

    await hostBackend.mutation(api.events.update, {
      ...workspaceScope,
      eventId,
      unsetFields: ["eventEndDate"],
    });
    expect((await readClaims()).map((claim) => claim.kind).sort()).toEqual([
      "blast_action",
      "event_list",
    ]);
  });
});
