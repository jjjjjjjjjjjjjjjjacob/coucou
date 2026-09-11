import type { UserIdentity } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const convexModules = {
  "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "../convex/credentials.ts": () => import("../convex/credentials"),
  "../convex/events.ts": () => import("../convex/events"),
  "../convex/eventWrites.ts": () => import("../convex/eventWrites"),
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
  it.each([
    "settings",
    "rename",
    "password",
    "clear-password",
    "remove",
  ])("saves %s despite unrelated historical password and blast conflicts", async (operation) => {
    const { testBackend, hostBackend, eventId, credentialId, readClaims } =
      await seedEventWithSentBlast(1_100);
    const editedCredentialId = await testBackend.run(async (databaseContext) => {
      const createdAt = Date.now();
      const originalEvent = await databaseContext.db.get(eventId);
      if (!originalEvent) throw new Error("Missing test event");
      const conflictingEventId = await databaseContext.db.insert("events", {
        ...workspaceScope,
        name: "Historical conflict",
        location: "Room",
        eventDate: originalEvent.eventDate,
        status: "active",
        lifecycle: "published",
        createdAt,
        updatedAt: createdAt,
      });
      await databaseContext.db.insert("listCredentials", {
        eventId: conflictingEventId,
        listKey: "other",
        password: "guest-code",
        passwordNormalized: "guest-code",
        createdAt,
      });
      const replyAction = await databaseContext.db.query("textBlastReplyActions").first();
      if (!replyAction) throw new Error("Missing reply action");
      await databaseContext.db.insert("textBlastReplyActions", {
        textBlastId: replyAction.textBlastId,
        replyCode: "guest-code",
        replyCodeNormalized: "guest-code",
        targetEventId: eventId,
        targetListKey: "different-list",
        isEnabled: true,
        createdAt,
        updatedAt: createdAt,
      });
      const editedCredentialId = await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "editable",
        password: "editable-code",
        passwordNormalized: "editable-code",
        createdAt,
      });
      await databaseContext.db.insert("smsCodeClaims", {
        eventId,
        normalizedCode: "editable-code",
        kind: "event_list",
        listCredentialId: editedCredentialId,
        status: "active",
        createdAt,
        updatedAt: createdAt,
      });
      return editedCredentialId;
    });
    const originalClaims = await readClaims();
    await hostBackend.action(api.eventsNode.update, {
      ...workspaceScope,
      eventId,
      lists: [
        { id: credentialId, listKey: "guest", approvalMessage: "Original approval text" },
        ...(operation === "remove"
          ? []
          : [
              {
                id: editedCredentialId,
                listKey: operation === "rename" ? "renamed" : "editable",
                ...(operation === "password" ? { password: "replacement-code" } : {}),
                ...(operation === "clear-password" ? { password: "" } : {}),
                ...(operation === "settings" ? { generateQR: true, autoApproveLimit: 12 } : {}),
              },
            ]),
      ],
    });
    const editedCredential = await testBackend.run((databaseContext) =>
      databaseContext.db.get(editedCredentialId),
    );
    const claims = await readClaims();
    expect(claims.filter((claim) => claim.listCredentialId !== editedCredentialId)).toEqual(
      originalClaims.filter((claim) => claim.listCredentialId !== editedCredentialId),
    );
    if (operation === "remove") {
      expect(editedCredential?.archivedAt).toEqual(expect.any(Number));
    } else if (operation === "rename") {
      expect(editedCredential).toMatchObject({ listKey: "editable", displayName: "renamed" });
    } else if (operation === "settings") {
      expect(editedCredential).toMatchObject({ generateQR: true, autoApproveLimit: 12 });
    } else {
      expect(editedCredential?.passwordNormalized).toBe(
        operation === "password" ? "replacement-code" : "",
      );
    }
    const editedClaims = claims.filter((claim) => claim.listCredentialId === editedCredentialId);
    if (operation === "clear-password") {
      expect(editedClaims).toEqual([]);
    } else {
      expect(editedClaims).toHaveLength(1);
      expect(editedClaims[0]?.normalizedCode).toBe(
        operation === "password" ? "replacement-code" : "editable-code",
      );
    }
  });

  it("can remove a password even when that old password is duplicated", async () => {
    const { testBackend, hostBackend, eventId, credentialId } = await seedEventWithSentBlast();
    const duplicateId = await testBackend.run((databaseContext) =>
      databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "duplicate",
        password: "guest-code",
        passwordNormalized: "guest-code",
        createdAt: Date.now(),
      }),
    );
    await hostBackend.action(api.eventsNode.update, {
      ...workspaceScope,
      eventId,
      lists: [
        {
          id: credentialId,
          listKey: "guest",
          password: "",
          approvalMessage: "Original approval text",
        },
        { id: duplicateId, listKey: "duplicate" },
      ],
    });
    expect(
      await testBackend.run((databaseContext) => databaseContext.db.get(credentialId)),
    ).toMatchObject({ password: "", passwordNormalized: "" });
  });

  it.each(["rename", "remove"])("preserves historical claims on %s", async (operation) => {
    const { testBackend, hostBackend, eventId, credentialId, readClaims } =
      await seedEventWithSentBlast(1_100);
    const originalClaims = await readClaims();
    await hostBackend.action(api.eventsNode.update, {
      ...workspaceScope,
      eventId,
      lists:
        operation === "remove"
          ? []
          : [
              {
                id: credentialId,
                listKey: "guest",
                displayName: "renamed",
                approvalMessage: "Original approval text",
              },
            ],
    });
    expect(await readClaims()).toEqual(originalClaims);
    const credential = await testBackend.run((databaseContext) =>
      databaseContext.db.get(credentialId),
    );
    expect(credential?.listKey).toBe("guest");
    if (operation === "remove") expect(credential?.archivedAt).toEqual(expect.any(Number));
    else expect(credential?.displayName).toBe("renamed");
  });

  it.each([
    "fourth-code",
    "",
  ])("adds a fourth list with password %j without rebuilding historical blast routes", async (password) => {
    const { testBackend, hostBackend, eventId, readClaims } = await seedEventWithSentBlast(1_100);
    const existingCredentials = await testBackend.run(async (databaseContext) => {
      const createdAt = Date.now() - 60_000;
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "VIP TXT",
        password: "text-code",
        passwordNormalized: "text-code",
        createdAt,
      });
      await databaseContext.db.insert("listCredentials", {
        eventId,
        listKey: "GA",
        createdAt,
      });
      const replyAction = await databaseContext.db.query("textBlastReplyActions").first();
      if (!replyAction) throw new Error("Missing test reply action");
      // Historical actions overlap recipients and conflict during a full rebuild.
      await databaseContext.db.insert("textBlastReplyActions", {
        textBlastId: replyAction.textBlastId,
        replyCode: "JOIN",
        replyCodeNormalized: "join",
        targetEventId: eventId,
        targetListKey: "GA",
        isEnabled: true,
        createdAt,
        updatedAt: createdAt,
      });
      // A list password may also be the reply code for the same destination.
      await databaseContext.db.insert("textBlastReplyActions", {
        textBlastId: replyAction.textBlastId,
        replyCode: "guest-code",
        replyCodeNormalized: "guest-code",
        targetEventId: eventId,
        targetListKey: "guest",
        isEnabled: true,
        createdAt,
        updatedAt: createdAt,
      });
      return databaseContext.db.query("listCredentials").collect();
    });
    const originalClaims = await readClaims();
    await hostBackend.action(api.eventsNode.update, {
      ...workspaceScope,
      eventId,
      lists: [
        ...existingCredentials.map((credential) => ({
          id: credential._id,
          listKey: credential.listKey,
          approvalMessage: credential.approvalMessage,
        })),
        { listKey: "Guestlist", password },
      ],
    });
    const credentials = await testBackend.run((databaseContext) =>
      databaseContext.db.query("listCredentials").collect(),
    );
    expect(credentials).toHaveLength(4);
    expect(credentials.filter((credential) => credential.listKey !== "Guestlist")).toEqual(
      existingCredentials,
    );
    const addedCredential = credentials.find((credential) => credential.listKey === "Guestlist");
    expect(addedCredential?.passwordNormalized).toBe(password);
    const claims = await readClaims();
    expect(claims.filter((claim) => claim.listCredentialId !== addedCredential?._id)).toEqual(
      originalClaims,
    );
    expect(claims.filter((claim) => claim.listCredentialId === addedCredential?._id)).toHaveLength(
      password ? 1 : 0,
    );
  });

  it("returns a serialized conflict through the update action and rolls back the new list", async () => {
    const { testBackend, hostBackend, eventId, credentialId, readClaims } =
      await seedEventWithSentBlast();
    const originalClaims = await readClaims();
    await expect(
      hostBackend.action(api.eventsNode.update, {
        ...workspaceScope,
        eventId,
        lists: [
          { id: credentialId, listKey: "guest", approvalMessage: "Original approval text" },
          { listKey: "Guestlist", password: "JOIN" },
        ],
      }),
    ).rejects.toThrow("SMS_CODE_CONFLICT");
    expect(
      await testBackend.run((databaseContext) =>
        databaseContext.db.query("listCredentials").collect(),
      ),
    ).toHaveLength(1);
    expect(await readClaims()).toEqual(originalClaims);
  });

  it.each([
    "JOIN",
    "",
  ])("restores a new list's existing blast route with password %j", async (password) => {
    const { testBackend, hostBackend, eventId } = await seedEventWithSentBlast();
    await testBackend.run(async (databaseContext) => {
      const replyAction = await databaseContext.db.query("textBlastReplyActions").first();
      if (!replyAction) throw new Error("Missing test reply action");
      await databaseContext.db.patch(replyAction._id, { targetListKey: "Guestlist" });
      const claims = await databaseContext.db.query("smsCodeClaims").collect();
      for (const claim of claims) {
        expect(claim.kind).toBeDefined();
      }
    });
    await hostBackend.mutation(api.events.addListCredential, {
      ...workspaceScope,
      eventId,
      listKey: "Guestlist",
      password,
    });
    const claims = await testBackend.run((databaseContext) =>
      databaseContext.db.query("smsCodeClaims").collect(),
    );
    expect(claims.filter((claim) => claim.kind === "blast_action")).toHaveLength(1);
    expect(claims.filter((claim) => claim.kind === "event_list")).toHaveLength(password ? 2 : 1);
  });

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
      await databaseContext.db.insert("listCredentials", {
        eventId: replyAction.targetEventId,
        listKey: "vip",
        createdAt: Date.now(),
      });
    });
    const originalClaims = await readClaims();

    await expect(
      hostBackend.mutation(updateListCredential, {
        ...workspaceScope,
        id: credentialId,
        patch: { password: "JOIN" },
      }),
    ).rejects.toThrow("SMS_CODE_CONFLICT");
    const credential = await testBackend.run((databaseContext) =>
      databaseContext.db.get(credentialId),
    );
    expect(credential?.passwordNormalized).toBe("guest-code");
    expect(await readClaims()).toEqual(originalClaims);
  });

  it("preserves blast claims when their target list is renamed", async () => {
    const { hostBackend, credentialId, readClaims } = await seedEventWithSentBlast();
    await hostBackend.mutation(api.events.updateListCredential, {
      ...workspaceScope,
      id: credentialId,
      patch: { listKey: "renamed-guest" },
    });
    expect((await readClaims()).map((claim) => claim.kind)).toEqual(["event_list", "blast_action"]);
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
