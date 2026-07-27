import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StaffGuestSummary } from "@/types";
import {
  createGuestSnapshot,
  GUEST_CACHE_LIFETIME_MILLISECONDS,
  GUEST_CACHE_MAXIMUM_ROWS,
  purgeAllGuestSnapshots,
  purgeWorkspaceGuestSnapshots,
  readGuestSnapshot,
  writeGuestSnapshot,
} from "../cache";

const fullGuest = {
  approvalStatus: "approved",
  attendanceStatus: "yes",
  attendees: 1,
  contact: "••• 0199",
  createdAt: 1,
  entryStatus: "checked_in",
  listKey: "general",
  name: "Avery Chen",
  rsvpId: "rsvp_1",
  ticketStatus: "redeemed",
  updatedAt: 2,
} as StaffGuestSummary;

describe("guest snapshot cache", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("strips contact values from persisted rows", () => {
    const snapshot = createGuestSnapshot(
      "workspace_1",
      "event_1",
      [fullGuest],
      100,
    );
    expect(snapshot.guests[0]?.contact).toBeUndefined();
  });

  it("expires and purges snapshots after 24 hours", async () => {
    const snapshot = createGuestSnapshot(
      "workspace_1",
      "event_1",
      [fullGuest],
      100,
    );
    await writeGuestSnapshot(snapshot);
    expect(
      await readGuestSnapshot(
        "event_1",
        100 + GUEST_CACHE_LIFETIME_MILLISECONDS - 1,
      ),
    ).not.toBeNull();
    expect(
      await readGuestSnapshot(
        "event_1",
        100 + GUEST_CACHE_LIFETIME_MILLISECONDS,
      ),
    ).toBeNull();
  });

  it("caps snapshots at 5,000 compact guest rows", () => {
    const guests = Array.from(
      { length: GUEST_CACHE_MAXIMUM_ROWS + 1 },
      (_, guestIndex): StaffGuestSummary =>
        ({
          ...fullGuest,
          name: `Guest ${guestIndex}`,
          rsvpId: `rsvp_${guestIndex}`,
        }) as StaffGuestSummary,
    );

    const snapshot = createGuestSnapshot(
      "workspace_1",
      "event_1",
      guests,
      100,
    );
    expect(snapshot.guests).toHaveLength(GUEST_CACHE_MAXIMUM_ROWS);
  });

  it("purges inaccessible workspaces and all snapshots on sign-out", async () => {
    await writeGuestSnapshot(
      createGuestSnapshot("workspace_1", "event_1", [fullGuest], 100),
    );
    await writeGuestSnapshot(
      createGuestSnapshot("workspace_2", "event_2", [fullGuest], 100),
    );

    await purgeWorkspaceGuestSnapshots(new Set(["workspace_1"]), 101);
    expect(await readGuestSnapshot("event_1", 101)).not.toBeNull();
    expect(await readGuestSnapshot("event_2", 101)).toBeNull();

    await purgeAllGuestSnapshots();
    expect(await readGuestSnapshot("event_1", 101)).toBeNull();
  });
});
