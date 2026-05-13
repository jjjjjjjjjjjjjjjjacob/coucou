export const HOST_RSVPS_TABLE_KEY = "host.rsvps";

const HOST_RSVPS_DEFAULT_HIDDEN_COLUMN_IDS = new Set([
  "attendees",
  "attendanceStatus",
  "smsConsent",
  "ticketStatus",
  "ticketViewedAt",
  "noteForHosts",
  "actions",
]);

export interface DashboardTablePreference {
  columnOrder: string[];
  hiddenColumnIds: string[];
  updatedAt?: number;
}

export interface DashboardTablePreferenceMergeInput {
  availableColumnIds: string[];
  defaultVisibleColumnIds: string[];
  savedColumnOrder?: string[];
  hiddenColumnIds?: string[];
  forcedHiddenColumnIds?: string[];
}

export interface DashboardTablePreferenceState {
  columnOrder: string[];
  visibleColumnIds: string[];
  hiddenColumnIds: string[];
}

export interface DashboardTablePreferenceHydrationInput {
  currentPreferenceSignature: string;
  savedPreferenceSignature: string;
  hasLocalPreferenceEdits: boolean;
}

export interface HostRsvpsSavedTablePreferenceResetInput {
  availableColumnIds: string[];
  defaultVisibleColumnIds: string[];
  savedColumnOrder: string[];
  hiddenColumnIds: string[];
  forcedHiddenColumnIds?: string[];
}

export function areDashboardTableColumnIdsEqual(
  firstColumnIds: string[],
  secondColumnIds: string[],
): boolean {
  return (
    firstColumnIds.length === secondColumnIds.length &&
    firstColumnIds.every((columnId, columnIndex) => columnId === secondColumnIds[columnIndex])
  );
}

function uniqueAvailableColumnIds(columnIds: string[], availableColumnIds: Set<string>): string[] {
  const resultColumnIds: string[] = [];
  const seenColumnIds = new Set<string>();

  for (const columnId of columnIds) {
    if (!availableColumnIds.has(columnId) || seenColumnIds.has(columnId)) {
      continue;
    }
    seenColumnIds.add(columnId);
    resultColumnIds.push(columnId);
  }

  return resultColumnIds;
}

export function getDefaultVisibleDashboardTableColumnIds(
  availableColumnIds: string[],
  forcedHiddenColumnIds: string[] = [],
): string[] {
  const forcedHiddenColumnIdSet = new Set(["noteForHosts", ...forcedHiddenColumnIds]);
  return availableColumnIds.filter((columnId) => !forcedHiddenColumnIdSet.has(columnId));
}

function isHostRsvpsDefaultHiddenColumnId(columnId: string): boolean {
  return HOST_RSVPS_DEFAULT_HIDDEN_COLUMN_IDS.has(columnId) || columnId.startsWith("custom_");
}

export function getDefaultVisibleHostRsvpsTableColumnIds(
  availableColumnIds: string[],
  forcedHiddenColumnIds: string[] = [],
): string[] {
  const hiddenColumnIdSet = new Set(forcedHiddenColumnIds);
  return availableColumnIds.filter(
    (columnId) => !hiddenColumnIdSet.has(columnId) && !isHostRsvpsDefaultHiddenColumnId(columnId),
  );
}

function getLegacyHostRsvpsDefaultColumnOrder(availableColumnIds: string[]): string[] {
  const availableColumnIdSet = new Set(availableColumnIds);
  const socialColumnIds = availableColumnIds.filter((columnId) => columnId.startsWith("social_"));
  const customColumnIds = availableColumnIds.filter((columnId) => columnId.startsWith("custom_"));
  const legacyStaticColumnIds = [
    "select",
    "guest",
    "listKey",
    "attendees",
    "smsConsent",
    "invitedByName",
    "referredByName",
    "noteForHosts",
    "createdAt",
    "approvalStatus",
    "attendanceStatus",
    "ticketStatus",
    "ticketViewedAt",
    "actions",
  ];

  return [...legacyStaticColumnIds, ...socialColumnIds, ...customColumnIds].filter((columnId) =>
    availableColumnIdSet.has(columnId),
  );
}

function getLegacyHostRsvpsDefaultHiddenColumnIds(
  availableColumnIds: string[],
  forcedHiddenColumnIds: string[] = [],
): string[] {
  const hiddenColumnIdSet = new Set(["noteForHosts", ...forcedHiddenColumnIds]);
  return availableColumnIds.filter((columnId) => hiddenColumnIdSet.has(columnId));
}

export function shouldResetHostRsvpsSavedTablePreference({
  availableColumnIds,
  defaultVisibleColumnIds,
  savedColumnOrder,
  hiddenColumnIds,
  forcedHiddenColumnIds = [],
}: HostRsvpsSavedTablePreferenceResetInput): boolean {
  const availableColumnIdSet = new Set(availableColumnIds);
  const normalizedSavedColumnOrder = uniqueAvailableColumnIds(
    savedColumnOrder,
    availableColumnIdSet,
  );
  const normalizedHiddenColumnIdSet = new Set(
    uniqueAvailableColumnIds(hiddenColumnIds, availableColumnIdSet),
  );
  const normalizedHiddenColumnIds = availableColumnIds.filter((columnId) =>
    normalizedHiddenColumnIdSet.has(columnId),
  );
  const legacyDefaultColumnOrder = getLegacyHostRsvpsDefaultColumnOrder(availableColumnIds);
  const legacyDefaultHiddenColumnIds = getLegacyHostRsvpsDefaultHiddenColumnIds(
    availableColumnIds,
    forcedHiddenColumnIds,
  );

  if (
    areDashboardTableColumnIdsEqual(normalizedSavedColumnOrder, legacyDefaultColumnOrder) &&
    areDashboardTableColumnIdsEqual(normalizedHiddenColumnIds, legacyDefaultHiddenColumnIds)
  ) {
    return true;
  }

  const compactLegacyVisibleColumnIds = defaultVisibleColumnIds.filter(
    (columnId) => columnId !== "createdAt",
  );
  const compactLegacyHiddenColumnIds = availableColumnIds.filter(
    (columnId) => !compactLegacyVisibleColumnIds.includes(columnId),
  );
  const savedVisibleColumnIds = availableColumnIds.filter(
    (columnId) => !normalizedHiddenColumnIds.includes(columnId),
  );
  const savedVisibleColumnOrder = normalizedSavedColumnOrder.filter((columnId) =>
    savedVisibleColumnIds.includes(columnId),
  );
  const attendanceLegacyVisibleColumnIds = availableColumnIds.filter(
    (columnId) =>
      defaultVisibleColumnIds.includes(columnId) ||
      (columnId === "attendanceStatus" && availableColumnIdSet.has(columnId)),
  );
  const attendanceLegacyHiddenColumnIds = availableColumnIds.filter(
    (columnId) => !attendanceLegacyVisibleColumnIds.includes(columnId),
  );

  if (
    attendanceLegacyVisibleColumnIds.length > 0 &&
    areDashboardTableColumnIdsEqual(savedVisibleColumnIds, attendanceLegacyVisibleColumnIds) &&
    areDashboardTableColumnIdsEqual(savedVisibleColumnOrder, attendanceLegacyVisibleColumnIds) &&
    areDashboardTableColumnIdsEqual(normalizedHiddenColumnIds, attendanceLegacyHiddenColumnIds)
  ) {
    return true;
  }

  return (
    compactLegacyVisibleColumnIds.length > 0 &&
    areDashboardTableColumnIdsEqual(savedVisibleColumnIds, compactLegacyVisibleColumnIds) &&
    areDashboardTableColumnIdsEqual(savedVisibleColumnOrder, compactLegacyVisibleColumnIds) &&
    areDashboardTableColumnIdsEqual(normalizedHiddenColumnIds, compactLegacyHiddenColumnIds)
  );
}

export function mergeDashboardTablePreferenceState({
  availableColumnIds,
  defaultVisibleColumnIds,
  savedColumnOrder,
  hiddenColumnIds,
  forcedHiddenColumnIds = [],
}: DashboardTablePreferenceMergeInput): DashboardTablePreferenceState {
  const availableColumnIdSet = new Set(availableColumnIds);
  const savedColumnOrderIds = uniqueAvailableColumnIds(
    savedColumnOrder ?? [],
    availableColumnIdSet,
  );
  const missingColumnIds = availableColumnIds.filter(
    (columnId) => !savedColumnOrderIds.includes(columnId),
  );
  const columnOrder = [...savedColumnOrderIds, ...missingColumnIds];
  const forcedHiddenColumnIdSet = new Set(forcedHiddenColumnIds);
  const savedHiddenColumnIds = uniqueAvailableColumnIds(
    hiddenColumnIds ?? [],
    availableColumnIdSet,
  );
  const hiddenColumnIdSet = new Set([...savedHiddenColumnIds, ...forcedHiddenColumnIdSet]);

  if (!hiddenColumnIds) {
    const defaultVisibleColumnIdSet = new Set(defaultVisibleColumnIds);
    for (const columnId of availableColumnIds) {
      if (!defaultVisibleColumnIdSet.has(columnId)) {
        hiddenColumnIdSet.add(columnId);
      }
    }
  }

  const visibleColumnIds = availableColumnIds.filter(
    (columnId) => !hiddenColumnIdSet.has(columnId),
  );
  const normalizedHiddenColumnIds = availableColumnIds.filter((columnId) =>
    hiddenColumnIdSet.has(columnId),
  );

  return {
    columnOrder,
    visibleColumnIds,
    hiddenColumnIds: normalizedHiddenColumnIds,
  };
}

export function serializeDashboardTablePreferenceState(
  columnOrder: string[],
  hiddenColumnIds: string[],
): string {
  return JSON.stringify({ columnOrder, hiddenColumnIds });
}

export function shouldHydrateDashboardTablePreferenceState({
  currentPreferenceSignature,
  savedPreferenceSignature,
  hasLocalPreferenceEdits,
}: DashboardTablePreferenceHydrationInput): boolean {
  return !hasLocalPreferenceEdits || currentPreferenceSignature === savedPreferenceSignature;
}
