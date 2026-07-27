import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CachedGuestSnapshot, StaffGuestSummary } from "@/types";

export const GUEST_CACHE_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1000;
export const GUEST_CACHE_MAXIMUM_ROWS = 5_000;
const CACHE_KEY_PREFIX = "coucou-staff:guest-snapshot:";

function cacheKey(eventId: string): string {
  return `${CACHE_KEY_PREFIX}${eventId}`;
}

export function createGuestSnapshot(
  workspaceId: string,
  eventId: string,
  guests: StaffGuestSummary[],
  storedAt: number = Date.now(),
): CachedGuestSnapshot {
  const compactGuests = guests
    .slice(0, GUEST_CACHE_MAXIMUM_ROWS)
    .map(
      (guest): StaffGuestSummary => ({
        rsvpId: guest.rsvpId,
        name: guest.name,
        listKey: guest.listKey,
        approvalStatus: guest.approvalStatus,
        attendanceStatus: guest.attendanceStatus,
        attendees: guest.attendees,
        ticketStatus: guest.ticketStatus,
        entryStatus: guest.entryStatus,
        createdAt: guest.createdAt,
        updatedAt: guest.updatedAt,
      }),
    );

  return {
    version: 1,
    workspaceId,
    eventId,
    storedAt,
    expiresAt: storedAt + GUEST_CACHE_LIFETIME_MILLISECONDS,
    guests: compactGuests,
  };
}

export async function writeGuestSnapshot(
  snapshot: CachedGuestSnapshot,
): Promise<void> {
  await AsyncStorage.setItem(cacheKey(snapshot.eventId), JSON.stringify(snapshot));
}

export async function readGuestSnapshot(
  eventId: string,
  now: number = Date.now(),
): Promise<CachedGuestSnapshot | null> {
  const serializedSnapshot = await AsyncStorage.getItem(cacheKey(eventId));
  if (!serializedSnapshot) {
    return null;
  }

  try {
    const snapshot = JSON.parse(serializedSnapshot) as CachedGuestSnapshot;
    if (
      snapshot.version !== 1 ||
      snapshot.eventId !== eventId ||
      snapshot.expiresAt <= now ||
      !Array.isArray(snapshot.guests)
    ) {
      await AsyncStorage.removeItem(cacheKey(eventId));
      return null;
    }
    return snapshot;
  } catch {
    await AsyncStorage.removeItem(cacheKey(eventId));
    return null;
  }
}

export async function purgeAllGuestSnapshots(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const guestSnapshotKeys = keys.filter((key) =>
    key.startsWith(CACHE_KEY_PREFIX),
  );
  if (guestSnapshotKeys.length > 0) {
    await AsyncStorage.multiRemove(guestSnapshotKeys);
  }
}

export async function purgeWorkspaceGuestSnapshots(
  accessibleWorkspaceIds: Set<string>,
  now: number = Date.now(),
): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
    key.startsWith(CACHE_KEY_PREFIX),
  );
  const snapshots = await AsyncStorage.multiGet(keys);
  const inaccessibleKeys = snapshots.flatMap(([key, serializedSnapshot]) => {
    if (!serializedSnapshot) {
      return [key];
    }
    try {
      const snapshot = JSON.parse(serializedSnapshot) as CachedGuestSnapshot;
      return accessibleWorkspaceIds.has(snapshot.workspaceId) &&
        snapshot.expiresAt > now
        ? []
        : [key];
    } catch {
      return [key];
    }
  });
  if (inaccessibleKeys.length > 0) {
    await AsyncStorage.multiRemove(inaccessibleKeys);
  }
}
