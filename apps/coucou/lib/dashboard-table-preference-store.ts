import type { ColumnSizingState } from "@tanstack/react-table";

export interface BrowserTablePreference {
  columnOrder: string[];
  hiddenColumnIds: string[];
  columnSizing: ColumnSizingState;
}

function parsePreference(value: string | null): BrowserTablePreference | null {
  if (!value) return null;
  try {
    const preference: unknown = JSON.parse(value);
    if (typeof preference !== "object" || preference === null) return null;
    if (
      !("columnOrder" in preference) ||
      !Array.isArray(preference.columnOrder) ||
      !preference.columnOrder.every((identifier) => typeof identifier === "string") ||
      !("hiddenColumnIds" in preference) ||
      !Array.isArray(preference.hiddenColumnIds) ||
      !preference.hiddenColumnIds.every((identifier) => typeof identifier === "string")
    )
      return null;
    const columnSizing: ColumnSizingState = {};
    if (
      "columnSizing" in preference &&
      typeof preference.columnSizing === "object" &&
      preference.columnSizing !== null
    ) {
      for (const [identifier, width] of Object.entries(preference.columnSizing)) {
        if (typeof width === "number" && Number.isFinite(width) && width > 0 && width <= 640) {
          columnSizing[identifier] = width;
        }
      }
    }
    return {
      columnOrder: preference.columnOrder,
      hiddenColumnIds: preference.hiddenColumnIds,
      columnSizing,
    };
  } catch {
    return null;
  }
}

export function createDashboardTablePreferenceStore(storageKey: string) {
  let snapshot: BrowserTablePreference | null = null;
  let hasReadStorage = false;
  let lastStorageValue: string | null | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const readStorage = () => {
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value !== lastStorageValue) {
        lastStorageValue = value;
        snapshot = parsePreference(value);
      }
    } catch {
      // Keep session preferences when browser storage is unavailable.
    }
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== storageKey && event.key !== null) return;
    readStorage();
    notify();
  };
  return {
    getSnapshot: () => {
      if (!hasReadStorage && typeof window !== "undefined") {
        hasReadStorage = true;
        readStorage();
      }
      return snapshot;
    },
    subscribe: (listener: () => void) => {
      if (listeners.size === 0) {
        // Another tab may have edited this layout while neither table was mounted.
        readStorage();
        window.addEventListener("storage", handleStorage);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener("storage", handleStorage);
      };
    },
    set: (preference: BrowserTablePreference) => {
      snapshot = preference;
      hasReadStorage = true;
      try {
        const value = JSON.stringify(preference);
        window.localStorage.setItem(storageKey, value);
        lastStorageValue = value;
      } catch {
        // The shared in-memory snapshot still survives navigation in this session.
      }
      notify();
    },
  };
}

const preferenceStores = new Map<string, ReturnType<typeof createDashboardTablePreferenceStore>>();

export function getDashboardTablePreferenceStore(storageKey: string) {
  let store = preferenceStores.get(storageKey);
  if (!store) {
    store = createDashboardTablePreferenceStore(storageKey);
    preferenceStores.set(storageKey, store);
  }
  return store;
}
