"use client";

import React from "react";

export interface EventBrandingDetails {
  sourceId: string;
  iconUrl: string | null;
}

interface EventBrandingContextValue {
  branding: EventBrandingDetails | null;
  applyBranding: (details: EventBrandingDetails) => void;
  clearBranding: (sourceId: string) => void;
}

const EventBrandingContext = React.createContext<EventBrandingContextValue | undefined>(undefined);

function collectIconElements(): HTMLLinkElement[] {
  if (typeof document === "undefined") {
    return [];
  }
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    ),
  );
}

export function EventBrandingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [branding, setBranding] = React.useState<EventBrandingDetails | null>(
    null,
  );
  const defaultIconSnapshotRef = React.useRef<
    Array<{ element: HTMLLinkElement; href: string }>
  >([]);
  const hasCapturedDefaultsRef = React.useRef(false);

  const captureDefaultIcons = React.useCallback(() => {
    if (hasCapturedDefaultsRef.current) {
      return;
    }
    const iconElements = collectIconElements();
    defaultIconSnapshotRef.current = iconElements.map((element) => ({
      element,
      href: element.href,
    }));
    hasCapturedDefaultsRef.current = true;
  }, []);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    captureDefaultIcons();
  }, [captureDefaultIcons]);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const iconElements = collectIconElements();
    if (!hasCapturedDefaultsRef.current) {
      defaultIconSnapshotRef.current = iconElements.map((element) => ({
        element,
        href: element.href,
      }));
      hasCapturedDefaultsRef.current = true;
    }

    const iconUrl = branding?.iconUrl;
    if (iconUrl) {
      iconElements.forEach((element) => {
        if (!element.dataset.defaultIconHref) {
          element.dataset.defaultIconHref = element.href;
        }
        element.href = iconUrl;
        element.setAttribute("data-event-icon", "override");
      });
    } else {
      iconElements.forEach((element) => {
        const fallbackHref =
          element.dataset.defaultIconHref ||
          defaultIconSnapshotRef.current.find(
            (snapshot) => snapshot.element === element,
          )?.href ||
          element.href;
        element.href = fallbackHref;
        element.removeAttribute("data-event-icon");
      });
    }
  }, [branding?.iconUrl]);

  const applyBranding = React.useCallback((details: EventBrandingDetails) => {
    setBranding((current) => {
      if (
        current &&
        current.sourceId === details.sourceId &&
        current.iconUrl === details.iconUrl
      ) {
        return current;
      }
      return details;
    });
  }, []);

  const clearBranding = React.useCallback((sourceId: string) => {
    setBranding((current) => {
      if (current && current.sourceId === sourceId) {
        return null;
      }
      return current;
    });
  }, []);

  const value = React.useMemo<EventBrandingContextValue>(
    () => ({
      branding,
      applyBranding,
      clearBranding,
    }),
    [branding, applyBranding, clearBranding],
  );

  return (
    <EventBrandingContext.Provider value={value}>
      {children}
    </EventBrandingContext.Provider>
  );
}

export function useEventBranding(): EventBrandingContextValue {
  const context = React.useContext(EventBrandingContext);
  if (!context) {
    throw new Error("useEventBranding must be used within EventBrandingProvider");
  }
  return context;
}
