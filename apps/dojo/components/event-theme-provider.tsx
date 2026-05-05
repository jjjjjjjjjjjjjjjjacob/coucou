"use client";

import React from "react";
import type { CSSProperties } from "react";
import type { Event } from "@/lib/types";
import { buildEventThemeStyle } from "@/lib/event-theme";
import { useEventBranding } from "@/contexts/event-branding-context";

interface EventThemeProviderProps {
  event: Pick<Event, "themeBackgroundColor" | "themeTextColor"> | null | undefined;
  iconUrl?: string | null;
  brandingSourceId?: string | null;
  children: React.ReactNode;
}

const BODY_STYLE_KEYS = ["backgroundColor", "color"] as const;
type BodyStyleKey = (typeof BODY_STYLE_KEYS)[number];
const BODY_STYLE_KEY_SET = new Set<BodyStyleKey>(BODY_STYLE_KEYS);

export function EventThemeProvider({
  event,
  iconUrl,
  brandingSourceId,
  children,
}: EventThemeProviderProps) {
  const themeStyle: CSSProperties = buildEventThemeStyle(event);
  const { applyBranding, clearBranding } = useEventBranding();

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const rootElement = document.documentElement;
    const bodyElement = document.body;
    const previousRootVariables = new Map<string, string>();
    const previousBodyVariables = new Map<string, string>();
    const previousBodyStyles = new Map<BodyStyleKey, string | null>();

    const applyStyleEntry = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;
      const stringValue = String(value);
      if (key.startsWith("--")) {
        previousRootVariables.set(key, rootElement.style.getPropertyValue(key));
        previousBodyVariables.set(key, bodyElement.style.getPropertyValue(key));
        rootElement.style.setProperty(key, stringValue);
        bodyElement.style.setProperty(key, stringValue);
      } else if (BODY_STYLE_KEY_SET.has(key as BodyStyleKey)) {
        const typedKey = key as BodyStyleKey;
        previousBodyStyles.set(typedKey, bodyElement.style[typedKey] as string);
        bodyElement.style[typedKey] = stringValue;
      }
    };

    const resolvedStyle = buildEventThemeStyle(event);
    Object.entries(resolvedStyle).forEach(([key, value]) =>
      applyStyleEntry(key, value),
    );

    rootElement.dataset.eventTheme = "active";
    bodyElement.dataset.eventTheme = "active";

    return () => {
      previousRootVariables.forEach((originalValue, key) => {
        if (originalValue) {
          rootElement.style.setProperty(key, originalValue);
        } else {
          rootElement.style.removeProperty(key);
        }
      });
      previousBodyVariables.forEach((originalValue, key) => {
        if (originalValue) {
          bodyElement.style.setProperty(key, originalValue);
        } else {
          bodyElement.style.removeProperty(key);
        }
      });
      previousBodyStyles.forEach((originalValue, key) => {
        bodyElement.style[key] = originalValue ?? "";
      });

      delete rootElement.dataset.eventTheme;
      delete bodyElement.dataset.eventTheme;
    };
  }, [event, event?.themeBackgroundColor, event?.themeTextColor]);

  React.useEffect(() => {
    if (!brandingSourceId) return;
    if (iconUrl) {
      applyBranding({ sourceId: brandingSourceId, iconUrl });
      return () => {
        clearBranding(brandingSourceId);
      };
    }
    clearBranding(brandingSourceId);
    return () => {
      clearBranding(brandingSourceId);
    };
  }, [applyBranding, clearBranding, brandingSourceId, iconUrl]);

  return (
    <div style={themeStyle} data-event-themed="true">
      {children}
    </div>
  );
}
