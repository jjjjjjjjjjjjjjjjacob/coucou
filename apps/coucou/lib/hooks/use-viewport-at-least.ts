"use client";

import React from "react";

/**
 * Whether the viewport is at least the given width. Returns false until
 * mounted so server and first client render agree.
 */
export function useIsViewportAtLeast(minWidthPx: number): boolean {
  const [isViewportAtLeast, setIsViewportAtLeast] = React.useState(false);

  React.useEffect(() => {
    const mediaQueryList = window.matchMedia(`(min-width: ${minWidthPx}px)`);
    const updateMatchState = () => {
      setIsViewportAtLeast(mediaQueryList.matches);
    };
    updateMatchState();
    mediaQueryList.addEventListener("change", updateMatchState);
    return () => mediaQueryList.removeEventListener("change", updateMatchState);
  }, [minWidthPx]);

  return isViewportAtLeast;
}
