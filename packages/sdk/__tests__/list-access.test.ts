import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  readStoredListAccess,
  resolveRsvpAccess,
  storeListAccess,
} from "../src/shared/list-access";

const storedValues = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
let eventSequence = 0;
let eventId = "";
beforeEach(() => {
  eventId = `event-${++eventSequence}`;
  storedValues.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      sessionStorage: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
        removeItem: (key: string) => storedValues.delete(key),
      },
    },
  });
});
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});
const grant = (accessToken = "server-issued", listKey = "vip") => ({
  ok: true,
  accessToken,
  listKey,
  expiresAt: Date.now() + 86400000,
});

describe("same-tab RSVP access", () => {
  it("resumes the same grant through blank input and a reload without losing the original password or expiry", async () => {
    const original = grant();
    storeListAccess(eventId, " Old-Password ", original);
    const resolve = mock(
      async (_arguments: { eventId: string; password: string; accessToken?: string }) => original,
    );
    await resolveRsvpAccess(resolve, { eventId, password: "" });
    expect(resolve).toHaveBeenCalledWith({
      eventId,
      password: "",
      accessToken: original.accessToken,
    });
    expect(readStoredListAccess(eventId)).toMatchObject({
      accessToken: original.accessToken,
      password: "old-password",
      expiresAt: original.expiresAt,
    });
    const reloaded: typeof import("../src/shared/list-access") = await import(
      `../src/shared/list-access.ts?reload=${eventId}`
    );
    expect(reloaded.readStoredListAccess(eventId)).toMatchObject({
      accessToken: original.accessToken,
      password: "old-password",
      expiresAt: original.expiresAt,
    });
    await reloaded.resolveRsvpAccess(resolve, { eventId, password: "old-password" });
    expect(resolve).toHaveBeenLastCalledWith({
      eventId,
      password: "old-password",
      accessToken: original.accessToken,
    });
  });

  it("uses a fresh check when a different password is entered", async () => {
    storeListAccess(eventId, "original", grant());
    const resolve = mock(
      async (_arguments: { eventId: string; password: string; accessToken?: string }) =>
        grant("new-token", "guest"),
    );
    await resolveRsvpAccess(resolve, { eventId, password: "another" });
    expect(resolve).toHaveBeenCalledWith({ eventId, password: "another", accessToken: undefined });
    expect(readStoredListAccess(eventId)?.listKey).toBe("guest");
  });

  it("does not let an older response replace a newer verified destination", async () => {
    let finishOld: ((result: ReturnType<typeof grant>) => void) | undefined;
    const olderResult = new Promise<ReturnType<typeof grant>>((resolve) => {
      finishOld = resolve;
    });
    const older = resolveRsvpAccess(() => olderResult, { eventId, password: "old" });
    await resolveRsvpAccess(async () => grant("latest", "guest"), { eventId, password: "new" });
    finishOld?.(grant("older", "vip"));
    await older;
    expect(readStoredListAccess(eventId)).toMatchObject({
      accessToken: "latest",
      listKey: "guest",
    });
  });

  it("rejects expired cached access and clears a rejected token", async () => {
    storeListAccess(eventId, "original", { ...grant(), expiresAt: Date.now() - 1 });
    expect(readStoredListAccess(eventId)).toBeUndefined();
    storeListAccess(eventId, "original", grant());
    await resolveRsvpAccess(async () => ({ ok: false }), { eventId, password: "original" });
    expect(readStoredListAccess(eventId)).toBeUndefined();
  });
});
