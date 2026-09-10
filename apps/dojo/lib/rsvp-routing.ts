import type { RSVP } from "@/lib/types";

export function buildRsvpFlowPath(pathname: string, source: { toString(): string } | null): string {
  const searchParameters = new URLSearchParams(source?.toString());
  searchParameters.delete("step");
  const queryString = searchParameters.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function existingRsvpPath(eventRouteId: string, status?: RSVP["status"]): string | null {
  if (status === "approved") return `/events/${eventRouteId}/ticket`;
  if (status === "pending") return `/events/${eventRouteId}/status`;
  if (status === "denied") return `/events/${eventRouteId}/denied`;
  return null;
}
