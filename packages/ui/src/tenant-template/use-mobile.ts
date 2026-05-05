"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT_PX = 720;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

/**
 * Returns true when the viewport is at or below the tenant-template's mobile
 * breakpoint. SSR-safe: returns the default during the first render and
 * settles to the real value after mount.
 */
export function useMobile(defaultValue = false): boolean {
  const [isMobile, setIsMobile] = useState(defaultValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}
