import type { EventPatch, EventUnsetField } from "./types";

export type EventPatchWithUnsets = EventPatch & {
  updatedAt: number;
};

export function applyEventUnsetFields(
  patch: EventPatch & { updatedAt: number },
  unsetFields: readonly EventUnsetField[] | undefined,
): EventPatchWithUnsets {
  const patchWithUnsets: EventPatchWithUnsets = { ...patch };
  for (const fieldKey of unsetFields ?? []) {
    (patchWithUnsets as Record<EventUnsetField, unknown>)[fieldKey] = undefined;
  }
  return patchWithUnsets;
}
