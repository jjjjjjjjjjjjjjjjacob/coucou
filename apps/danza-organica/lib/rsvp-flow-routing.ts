"use client";

import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { buildFullRsvpPath, buildInfoRsvpPath, type QueryStringSource } from "@/lib/rsvp-url-state";

const RSVP_FLOW_ROUTE_FEATURE_FLAG = "rsvp-flow-route";
const RSVP_FLOW_MOBILE_BREAKPOINT_PX = 720;
const RSVP_FLOW_MOBILE_MEDIA_QUERY = `(max-width: ${RSVP_FLOW_MOBILE_BREAKPOINT_PX - 1}px)`;

export type RsvpFlowViewport = "unknown" | "mobile" | "desktop";

export function useRsvpFlowViewport(): RsvpFlowViewport {
  const [rsvpFlowViewport, setRsvpFlowViewport] = useState<RsvpFlowViewport>("unknown");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(RSVP_FLOW_MOBILE_MEDIA_QUERY);
    const handleChange = (event: MediaQueryList | MediaQueryListEvent) => {
      setRsvpFlowViewport(event.matches ? "mobile" : "desktop");
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return rsvpFlowViewport;
}

export function buildRsvpPathForViewport(
  eventRouteId: string,
  source: QueryStringSource,
  rsvpFlowViewport: RsvpFlowViewport,
): string | undefined {
  if (rsvpFlowViewport === "unknown") return undefined;
  if (rsvpFlowViewport === "mobile") return buildInfoRsvpPath(eventRouteId, source);
  return posthog.getFeatureFlag(RSVP_FLOW_ROUTE_FEATURE_FLAG) === "info"
    ? buildInfoRsvpPath(eventRouteId, source)
    : buildFullRsvpPath(eventRouteId, source);
}
