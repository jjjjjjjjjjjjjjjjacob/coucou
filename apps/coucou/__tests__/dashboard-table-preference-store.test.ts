import { describe, expect, it, mock, spyOn } from "bun:test";
import { createDashboardTablePreferenceStore } from "../lib/dashboard-table-preference-store";

const preference = {
  columnOrder: ["select", "socials", "person"],
  hiddenColumnIds: ["tags"],
  columnSizing: { person: 310 },
};

describe("browser table preferences", () => {
  it("writes before unmount and restores order, hidden columns and widths in a fresh session", () => {
    const key = "table-store-reload";
    const store = createDashboardTablePreferenceStore(key);
    const listener = mock(() => undefined);
    const unsubscribe = store.subscribe(listener);
    store.set(preference);
    unsubscribe();
    expect(listener).toHaveBeenCalledOnce();
    expect(createDashboardTablePreferenceStore(key).getSnapshot()).toEqual(preference);
    expect(createDashboardTablePreferenceStore("another-user-workspace").getSnapshot()).toBeNull();
  });

  it("updates subscribers when another tab saves the same layout", () => {
    const key = "table-store-tabs";
    const store = createDashboardTablePreferenceStore(key);
    const listener = mock(() => undefined);
    const unsubscribe = store.subscribe(listener);
    window.localStorage.setItem(key, JSON.stringify(preference));
    window.dispatchEvent(new StorageEvent("storage", { key }));
    expect(store.getSnapshot()).toEqual(preference);
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("ignores malformed storage and invalid widths", () => {
    window.localStorage.setItem("table-store-invalid", '{"columnOrder":[4]}');
    expect(createDashboardTablePreferenceStore("table-store-invalid").getSnapshot()).toBeNull();
    window.localStorage.setItem(
      "table-store-widths",
      JSON.stringify({
        ...preference,
        columnSizing: { person: 310, tags: -1, notes: "wide", socials: 100000 },
      }),
    );
    expect(
      createDashboardTablePreferenceStore("table-store-widths").getSnapshot()?.columnSizing,
    ).toEqual({ person: 310 });
  });

  it("picks up edits from another tab made while the table was closed", () => {
    const key = "table-store-closed";
    const store = createDashboardTablePreferenceStore(key);
    store.set(preference);
    const updated = { ...preference, hiddenColumnIds: ["notes"] };
    window.localStorage.setItem(key, JSON.stringify(updated));
    const unsubscribe = store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual(updated);
    unsubscribe();
  });

  it("keeps edits in memory if browser storage is blocked", () => {
    const readStorage = spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    const writeStorage = spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage blocked");
    });
    try {
      const store = createDashboardTablePreferenceStore("table-store-blocked");
      expect(store.getSnapshot()).toBeNull();
      store.set(preference);
      expect(store.getSnapshot()).toEqual(preference);
    } finally {
      readStorage.mockRestore();
      writeStorage.mockRestore();
    }
  });
});
