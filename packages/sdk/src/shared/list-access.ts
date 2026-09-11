export interface StoredListAccess {
  accessToken: string;
  expiresAt: number;
  listKey: string;
  password: string;
}
const latestRequests = new Map<string, number>();
const memoryAccess = new Map<string, StoredListAccess>();
function storageKey(eventId: string): string {
  return `coucou:list-access:${eventId}`;
}
export function readStoredListAccess(eventId: string): StoredListAccess | undefined {
  const remembered = memoryAccess.get(eventId);
  if (remembered && remembered.expiresAt > Date.now()) return remembered;
  if (typeof window === "undefined") return undefined;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(storageKey(eventId)) ?? "null");
    if (
      typeof value !== "object" ||
      value === null ||
      !("accessToken" in value) ||
      typeof value.accessToken !== "string" ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      value.expiresAt <= Date.now() ||
      !("listKey" in value) ||
      typeof value.listKey !== "string" ||
      !("password" in value) ||
      typeof value.password !== "string"
    )
      return undefined;
    return value as StoredListAccess;
  } catch {
    return undefined;
  }
}
export function storeListAccess(
  eventId: string,
  password: string,
  result: { ok: boolean; accessToken?: string; expiresAt?: number; listKey?: string },
): void {
  if (
    typeof window === "undefined" ||
    !result.ok ||
    !result.accessToken ||
    !result.expiresAt ||
    !result.listKey
  )
    return;
  const previous = readStoredListAccess(eventId);
  const originalPassword =
    previous?.accessToken === result.accessToken
      ? previous.password
      : password.trim().toLowerCase();
  memoryAccess.set(eventId, {
    accessToken: result.accessToken,
    expiresAt: result.expiresAt,
    listKey: result.listKey,
    password: originalPassword,
  });
  try {
    window.sessionStorage.setItem(
      storageKey(eventId),
      JSON.stringify({
        accessToken: result.accessToken,
        expiresAt: result.expiresAt,
        listKey: result.listKey,
        password: originalPassword,
      }),
    );
  } catch {
    /* The current page may still submit the returned token. */
  }
}
export async function resolveRsvpAccess<
  Arguments extends { eventId: string; password: string },
  Result extends { ok: boolean; accessToken?: string; expiresAt?: number; listKey?: string },
>(
  resolve: (args: Arguments & { accessToken?: string }) => Promise<Result>,
  args: Arguments,
): Promise<Result> {
  const requestNumber = (latestRequests.get(args.eventId) ?? 0) + 1;
  latestRequests.set(args.eventId, requestNumber);
  const stored = readStoredListAccess(args.eventId);
  const normalized = args.password.trim().toLowerCase();
  const accessToken =
    stored && (!normalized || normalized === stored.password) ? stored.accessToken : undefined;
  const result = await resolve({ ...args, accessToken });
  if (latestRequests.get(args.eventId) === requestNumber) {
    if (result.ok) storeListAccess(args.eventId, args.password, result);
    else {
      memoryAccess.delete(args.eventId);
      try {
        if (typeof window !== "undefined")
          window.sessionStorage.removeItem(storageKey(args.eventId));
      } catch {
        /* Storage can be disabled. */
      }
    }
  }
  return result;
}
