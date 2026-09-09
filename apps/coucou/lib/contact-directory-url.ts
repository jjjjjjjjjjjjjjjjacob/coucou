import {
  createDefaultGuestDirectoryFilterState,
  decodeRecipientFilter,
  encodeRecipientFilter,
  type GuestDirectoryFilterState,
} from "./text-blast-filters";

export function readContactDirectoryFilters(
  parameters: URLSearchParams,
): GuestDirectoryFilterState {
  const defaults = createDefaultGuestDirectoryFilterState();
  const values = (key: string) => parameters.getAll(key).filter(Boolean);
  const sort = parameters.get("sort");
  const historyType = parameters.get("history");
  const consent = parameters.get("consent");
  const latest = parameters.get("latest");
  return {
    ...defaults,
    searchText: parameters.get("search") ?? "",
    eventIds: values("event"),
    listKeys: values("event-list"),
    tags: values("tag"),
    defaultListKeys: values("list"),
    recipientFilter: decodeRecipientFilter(parameters.get("segment")),
    recipientHistoryFilter:
      historyType === "received_any" || historyType === "not_received_any"
        ? { type: historyType, textBlastIds: values("blast") }
        : defaults.recipientHistoryFilter,
    smsConsentFilter: consent === "consented" || consent === "not_consented" ? consent : "any",
    rsvpedToLatestEvent: latest === "yes" || latest === "no" ? latest : "any",
    sortBy:
      sort === "latestRsvpAt" || sort === "firstRsvpAt" || sort === "eventCount" ? sort : "name",
    sortDirection: parameters.get("direction") === "desc" ? "desc" : "asc",
  };
}

export function writeContactDirectoryFilters(
  parameters: URLSearchParams,
  filters: GuestDirectoryFilterState,
): void {
  for (const key of [
    "search",
    "event",
    "event-list",
    "tag",
    "list",
    "segment",
    "history",
    "blast",
    "consent",
    "latest",
    "sort",
    "direction",
    "page",
  ])
    parameters.delete(key);
  if (filters.searchText.trim()) parameters.set("search", filters.searchText);
  for (const identifier of filters.eventIds) parameters.append("event", identifier);
  for (const key of filters.listKeys ?? []) parameters.append("event-list", key);
  for (const tag of filters.tags) parameters.append("tag", tag);
  for (const list of filters.defaultListKeys) parameters.append("list", list);
  const segment = encodeRecipientFilter(filters.recipientFilter);
  parameters.set("segment", segment ?? JSON.stringify(filters.recipientFilter));
  if (filters.recipientHistoryFilter.type !== "none") {
    parameters.set("history", filters.recipientHistoryFilter.type);
    for (const identifier of filters.recipientHistoryFilter.textBlastIds)
      parameters.append("blast", identifier);
  }
  if (filters.smsConsentFilter !== "any") parameters.set("consent", filters.smsConsentFilter);
  if (filters.rsvpedToLatestEvent !== "any") parameters.set("latest", filters.rsvpedToLatestEvent);
  parameters.set("sort", filters.sortBy);
  parameters.set("direction", filters.sortDirection);
}
