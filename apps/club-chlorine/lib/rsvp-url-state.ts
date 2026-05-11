export const rsvpStepQueryValues = ["info", "details", "final"] as const;

export type RsvpStepQueryValue = (typeof rsvpStepQueryValues)[number];
export type RsvpStepNumber = 1 | 2 | 3;

type QueryStringSource = string | { toString: () => string } | null | undefined;

const rsvpStepNumberToQueryValue: Record<RsvpStepNumber, RsvpStepQueryValue> = {
  1: "info",
  2: "details",
  3: "final",
};

const rsvpStepQueryValueToNumber: Record<RsvpStepQueryValue, RsvpStepNumber> = {
  info: 1,
  details: 2,
  final: 3,
};

function createSearchParameters(source: QueryStringSource): URLSearchParams {
  if (!source) return new URLSearchParams();
  return new URLSearchParams(typeof source === "string" ? source : source.toString());
}

export function getRsvpStepQueryValue(step: RsvpStepNumber): RsvpStepQueryValue {
  return rsvpStepNumberToQueryValue[step];
}

export function parseRsvpStepQueryValue(value: string | null | undefined): RsvpStepNumber {
  if (value === "details" || value === "final" || value === "info") {
    return rsvpStepQueryValueToNumber[value];
  }
  return 1;
}

export function buildQueryStringWithRsvpStep(
  source: QueryStringSource,
  step: RsvpStepNumber,
): string {
  const searchParameters = createSearchParameters(source);
  searchParameters.set("step", getRsvpStepQueryValue(step));
  return searchParameters.toString();
}

export function buildQueryStringWithoutKeys(
  source: QueryStringSource,
  excludedQueryKeys: string[],
): string {
  const searchParameters = createSearchParameters(source);
  for (const queryKey of excludedQueryKeys) {
    searchParameters.delete(queryKey);
  }
  return searchParameters.toString();
}

export function buildPathWithQueryString(pathname: string, queryString: string): string {
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function buildPathWithPreservedQuery(
  pathname: string,
  source: QueryStringSource,
  excludedQueryKeys: string[] = [],
): string {
  const queryString = buildQueryStringWithoutKeys(source, excludedQueryKeys);
  return buildPathWithQueryString(pathname, queryString);
}

export function buildRsvpPathWithStep(
  eventId: string,
  source: QueryStringSource,
  step: RsvpStepNumber,
): string {
  const queryString = buildQueryStringWithRsvpStep(source, step);
  return buildPathWithQueryString(`/events/${eventId}/rsvp`, queryString);
}

export function buildFullRsvpPath(eventId: string, source: QueryStringSource): string {
  return buildPathWithPreservedQuery(`/events/${eventId}/rsvp/full`, source, ["step"]);
}

export function buildInfoRsvpPath(eventId: string, source: QueryStringSource): string {
  const queryString = buildQueryStringWithRsvpStep(source, 1);
  return buildPathWithQueryString(`/events/${eventId}/rsvp/info`, queryString);
}

export function buildEventDetailPathWithPreservedQuery(
  eventId: string,
  source: QueryStringSource,
): string {
  return buildPathWithPreservedQuery(`/events/${eventId}`, source, ["step"]);
}
