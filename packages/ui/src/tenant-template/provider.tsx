"use client";

import {
  type EventThemeColorSource,
  PRESET_DEFINITIONS,
  type PresetDefinition,
  type PresetKey,
  type ResolvedPreset,
  resolvePreset,
} from "@coucou/sdk";
import {
  type CSSProperties,
  createContext,
  type HTMLAttributes,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { combineClassNames } from "./internal-utils";

interface TenantTemplateContextValue {
  resolved: ResolvedPreset;
  preset: PresetDefinition;
  presetKey: PresetKey;
}

const TenantTemplateContext = createContext<TenantTemplateContextValue | null>(null);

export interface TenantTemplateProviderProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Per-tenant preset stored on the workspace. Optional so callers can pass
   * a possibly-undefined value straight from a Convex query.
   */
  workspacePreset?: string | null;
  /**
   * Per-app preset baked into siteConfiguration. Always present for our apps.
   */
  siteConfigurationPreset?: string | null;
  /**
   * Per-event preset override (reserved for future).
   */
  eventPreset?: string | null;
  /**
   * Per-event color overrides — same shape as Convex `events` doc.
   */
  event?: EventThemeColorSource | null;
  /**
   * When true, also writes the resolved bg/fg to `document.body` so the
   * entire viewport (including overflow areas, dev-tooling badges, and
   * scroll regions) stays on-brand. Defaults to true. Set false when this
   * provider only wraps a sub-region of the page (e.g. an admin row inside
   * a non-themed shell).
   */
  applyToBody?: boolean;
  children: ReactNode;
}

export function TenantTemplateProvider({
  workspacePreset,
  siteConfigurationPreset,
  eventPreset,
  event,
  className,
  style,
  applyToBody = true,
  children,
  ...rest
}: TenantTemplateProviderProps) {
  const resolved = useMemo(
    () =>
      resolvePreset({
        eventPreset,
        workspacePreset,
        siteConfigurationPreset,
        event,
      }),
    [eventPreset, workspacePreset, siteConfigurationPreset, event],
  );

  const contextValue = useMemo<TenantTemplateContextValue>(
    () => ({
      resolved,
      preset: resolved.effective,
      presetKey: resolved.key,
    }),
    [resolved],
  );

  const mergedStyle: CSSProperties = useMemo(
    () => ({
      ...resolved.styleVars,
      fontFamily: "var(--tt-text)",
      ...style,
    }),
    [resolved.styleVars, style],
  );

  // Mirror the preset bg/fg onto <body> and <html> so the entire viewport
  // stays on-brand even when content is shorter than the viewport, when
  // overscroll/rubber-banding reveals the chrome edge, or when portaled
  // dev/extension UIs sit on top of the body backdrop. Restore previous
  // styles on unmount.
  useEffect(() => {
    if (!applyToBody) return;
    if (typeof window === "undefined") return;
    const bodyEl = document.body;
    const rootEl = document.documentElement;
    const previousBodyBg = bodyEl.style.backgroundColor;
    const previousBodyColor = bodyEl.style.color;
    const previousHtmlBg = rootEl.style.backgroundColor;
    bodyEl.style.backgroundColor = resolved.effective.bg;
    bodyEl.style.color = resolved.effective.fg;
    rootEl.style.backgroundColor = resolved.effective.bg;
    return () => {
      bodyEl.style.backgroundColor = previousBodyBg;
      bodyEl.style.color = previousBodyColor;
      rootEl.style.backgroundColor = previousHtmlBg;
    };
  }, [applyToBody, resolved.effective.bg, resolved.effective.fg]);

  return (
    <TenantTemplateContext.Provider value={contextValue}>
      <div
        data-preset={resolved.key}
        className={combineClassNames("tt-root", className)}
        style={mergedStyle}
        {...rest}
      >
        {children}
      </div>
    </TenantTemplateContext.Provider>
  );
}

export function useTenantTemplate(): TenantTemplateContextValue {
  const value = useContext(TenantTemplateContext);
  if (!value) {
    throw new Error("useTenantTemplate must be used inside <TenantTemplateProvider>");
  }
  return value;
}

/**
 * Like useTenantTemplate but tolerant of being rendered outside the provider —
 * useful for previews and isolated documentation.
 */
export function useTenantTemplateOptional(
  fallbackPresetKey: PresetKey = "dojo",
): TenantTemplateContextValue {
  const value = useContext(TenantTemplateContext);
  if (value) return value;
  const fallbackPreset = PRESET_DEFINITIONS[fallbackPresetKey];
  return {
    resolved: {
      key: fallbackPresetKey,
      definition: fallbackPreset,
      effective: fallbackPreset,
      styleVars: {} as CSSProperties,
    },
    preset: fallbackPreset,
    presetKey: fallbackPresetKey,
  };
}
