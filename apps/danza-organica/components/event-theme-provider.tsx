"use client";

import type { CSSProperties } from "react";
import React from "react";
import { useEventBranding } from "@/contexts/event-branding-context";
import { buildEventThemeStyle } from "@/lib/event-theme";
import type { Event } from "@/lib/types";

interface EventThemeProviderProps {
  event:
    | Pick<Event, "themeBackgroundColor" | "themeTextColor" | "themeAccentColor">
    | null
    | undefined;
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
  const themeScopeReference = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const rootElement = document.documentElement;
    const bodyElement = document.body;
    const tenantRootElement = themeScopeReference.current?.closest<HTMLElement>(".tt-root") ?? null;
    const tenantThemeElements = tenantRootElement
      ? [tenantRootElement, ...tenantRootElement.querySelectorAll<HTMLElement>(".tt-root")]
      : [];
    const previousRootVariables = new Map<string, string>();
    const previousBodyVariables = new Map<string, string>();
    const previousTenantVariables = new Map<HTMLElement, Map<string, string>>();
    const previousBodyStyles = new Map<BodyStyleKey, string | null>();

    const applyStyleEntry = (key: string, value: unknown) => {
      if (value === undefined || value === null) return;
      const stringValue = String(value);
      if (key.startsWith("--")) {
        previousRootVariables.set(key, rootElement.style.getPropertyValue(key));
        previousBodyVariables.set(key, bodyElement.style.getPropertyValue(key));
        rootElement.style.setProperty(key, stringValue);
        bodyElement.style.setProperty(key, stringValue);
        tenantThemeElements.forEach((tenantThemeElement) => {
          const previousVariables =
            previousTenantVariables.get(tenantThemeElement) ?? new Map<string, string>();
          previousVariables.set(key, tenantThemeElement.style.getPropertyValue(key));
          previousTenantVariables.set(tenantThemeElement, previousVariables);
          tenantThemeElement.style.setProperty(key, stringValue);
        });
      } else if (BODY_STYLE_KEY_SET.has(key as BodyStyleKey)) {
        const typedKey = key as BodyStyleKey;
        previousBodyStyles.set(typedKey, bodyElement.style[typedKey] as string);
        bodyElement.style[typedKey] = stringValue;
      }
    };

    const resolvedStyle = buildEventThemeStyle(event);
    Object.entries(resolvedStyle).forEach(([key, value]) => applyStyleEntry(key, value));

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
      previousTenantVariables.forEach((previousVariables, tenantThemeElement) => {
        previousVariables.forEach((originalValue, key) => {
          if (originalValue) {
            tenantThemeElement.style.setProperty(key, originalValue);
          } else {
            tenantThemeElement.style.removeProperty(key);
          }
        });
      });
      previousBodyStyles.forEach((originalValue, key) => {
        bodyElement.style[key] = originalValue ?? "";
      });

      delete rootElement.dataset.eventTheme;
      delete bodyElement.dataset.eventTheme;
    };
  }, [event, event?.themeAccentColor, event?.themeBackgroundColor, event?.themeTextColor]);

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

  // Strip the resolved `backgroundColor` / `color` declarations from the
  // outer div so the tenant backdrop behind always shows through. Child
  // shadcn components still pick up the per-event palette via the cascading
  // CSS custom properties (`--background`, `--foreground`, etc.).
  const {
    backgroundColor: _bg,
    color: _fg,
    ...transparentThemeStyle
  } = themeStyle as CSSProperties & {
    backgroundColor?: string;
    color?: string;
  };

  return (
    <div ref={themeScopeReference} style={transparentThemeStyle} data-event-themed="true">
      {children}
    </div>
  );
}
