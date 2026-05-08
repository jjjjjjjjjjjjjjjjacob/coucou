"use client";

import { PRESET_DEFINITIONS, type PresetKey, resolvePreset } from "@coucou/sdk";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEY = "dojo:club-chlorine:dev-color-tweak";
const STYLE_ELEMENT_ID = "dev-color-tweak-overrides";
const HEX_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

interface ColorTweakState {
  background: string;
  foreground: string;
  enabled: boolean;
}

interface QuickPreset {
  label: string;
  background: string;
  foreground: string;
}

const CHLORINE_DEFAULT = PRESET_DEFINITIONS.chlorine;

const QUICK_PRESETS: QuickPreset[] = [
  {
    label: "chlorine",
    background: CHLORINE_DEFAULT.bg,
    foreground: CHLORINE_DEFAULT.fg,
  },
  { label: "inverted", background: "#1E3CFF", foreground: "#000000" },
  { label: "lava", background: "#0A0A0A", foreground: "#FF4D14" },
  { label: "matcha", background: "#0E1A0A", foreground: "#9CFF6B" },
  { label: "rose", background: "#160409", foreground: "#FF6FA3" },
  { label: "paper", background: "#F4EFE6", foreground: "#1F2A1A" },
];

function expandShortHex(hex: string): string {
  const stripped = hex.replace("#", "");
  if (stripped.length !== 3) return `#${stripped.toUpperCase()}`;
  const expanded = stripped
    .split("")
    .map((character) => character + character)
    .join("");
  return `#${expanded.toUpperCase()}`;
}

function normalizeHex(value: string): string | null {
  const trimmedValue = value.trim();
  if (!HEX_PATTERN.test(trimmedValue)) return null;
  return expandShortHex(trimmedValue.startsWith("#") ? trimmedValue : `#${trimmedValue}`);
}

function readPersistedState(): ColorTweakState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ColorTweakState>;
    const background = normalizeHex(parsed.background ?? "");
    const foreground = normalizeHex(parsed.foreground ?? "");
    if (!background || !foreground) return null;
    return {
      background,
      foreground,
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}

function persistState(state: ColorTweakState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / private-mode failures — purely a convenience feature.
  }
}

function clearPersistedState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore — clearing best-effort.
  }
}

// Card / popover tokens stay on the app's white-default surface even while
// the rest of the takeover goes dark — this matches the app-level rule in
// `lib/event-theme.ts` so dropdowns and cards never inherit a tinted
// background from a tweak preview.
const NEUTRAL_SURFACE_VARIABLES = new Set([
  "--card",
  "--card-foreground",
  "--popover",
  "--popover-foreground",
]);

function buildOverrideStylesheet(background: string, foreground: string): string {
  const resolved = resolvePreset({
    siteConfigurationPreset: "chlorine",
    event: {
      themeBackgroundColor: background,
      themeTextColor: foreground,
    },
  });
  const variableEntries = Object.entries(resolved.styleVars).filter(
    ([key]) => key.startsWith("--") && !NEUTRAL_SURFACE_VARIABLES.has(key),
  ) as Array<[string, string]>;
  const variableLines = variableEntries
    .map(([key, value]) => `  ${key}: ${value} !important;`)
    .join("\n");

  return [
    `:root, .tt-root {\n${variableLines}\n}`,
    `html { background-color: ${resolved.effective.bg} !important; }`,
    `body { background-color: ${resolved.effective.bg} !important; color: ${resolved.effective.fg} !important; }`,
  ].join("\n");
}

function applyStylesheet(content: string): void {
  if (typeof document === "undefined") return;
  let styleElement = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = STYLE_ELEMENT_ID;
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = content;
  // The chlorine wordmark is rendered into a WebGL canvas that caches its
  // resolved fill color (see ChlorineRippleSurface.uploadContent). It only
  // re-reads the foreground color when its ResizeObserver fires or a window
  // `resize` event arrives. Dispatching one nudges the surface into
  // re-uploading content with the freshly tweaked --tt-fg.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("resize"));
  }
}

function removeStylesheet(): void {
  if (typeof document === "undefined") return;
  const styleElement = document.getElementById(STYLE_ELEMENT_ID);
  if (!styleElement) return;
  styleElement.remove();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("resize"));
  }
}

function useShouldRender(): boolean {
  const [shouldRender, setShouldRender] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocalDev = process.env.NODE_ENV !== "production";
    const vercelEnvironment = process.env.NEXT_PUBLIC_VERCEL_ENV;
    const isVercelNonProduction =
      typeof vercelEnvironment === "string" &&
      vercelEnvironment.length > 0 &&
      vercelEnvironment !== "production";
    const queryParameters = new URLSearchParams(window.location.search);
    const hasTweakQueryFlag = queryParameters.get("tweak") !== null;
    setShouldRender(isLocalDev || isVercelNonProduction || hasTweakQueryFlag);
  }, []);
  return shouldRender;
}

export function shouldExpandDevColorTweakPanelInitially(search: string): boolean {
  const queryParameters = new URLSearchParams(search);
  return (
    queryParameters.get("tweak") !== null ||
    queryParameters.get("bg") !== null ||
    queryParameters.get("fg") !== null
  );
}

export function DevColorTweakPanel() {
  const shouldRender = useShouldRender();
  const [colorState, setColorState] = useState<ColorTweakState>(() => ({
    background: CHLORINE_DEFAULT.bg,
    foreground: CHLORINE_DEFAULT.fg,
    enabled: false,
  }));
  const [isExpanded, setIsExpanded] = useState(false);
  const [backgroundHexInput, setBackgroundHexInput] = useState(CHLORINE_DEFAULT.bg);
  const [foregroundHexInput, setForegroundHexInput] = useState(CHLORINE_DEFAULT.fg);
  const initialPersistLoadedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!shouldExpandDevColorTweakPanelInitially(window.location.search)) return;
    setIsExpanded(true);
  }, []);

  // Hydrate from localStorage once on mount.
  useEffect(() => {
    if (initialPersistLoadedRef.current) return;
    initialPersistLoadedRef.current = true;
    const persisted = readPersistedState();
    if (persisted) {
      setColorState(persisted);
      setBackgroundHexInput(persisted.background);
      setForegroundHexInput(persisted.foreground);
    }
  }, []);

  // Apply overrides when state changes.
  useEffect(() => {
    if (!shouldRender) return;
    if (!colorState.enabled) {
      removeStylesheet();
      return;
    }
    const stylesheet = buildOverrideStylesheet(colorState.background, colorState.foreground);
    applyStylesheet(stylesheet);
    return () => {
      // Don't remove on every render — only on unmount or when disabled.
    };
  }, [colorState.enabled, colorState.background, colorState.foreground, shouldRender]);

  // Persist on change.
  useEffect(() => {
    if (!initialPersistLoadedRef.current) return;
    persistState(colorState);
  }, [colorState]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      removeStylesheet();
    };
  }, []);

  const derivedPreview = useMemo(() => {
    const resolved = resolvePreset({
      siteConfigurationPreset: "chlorine",
      event: {
        themeBackgroundColor: colorState.background,
        themeTextColor: colorState.foreground,
      },
    });
    return resolved.effective;
  }, [colorState.background, colorState.foreground]);

  const handleBackgroundColorChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value.toUpperCase();
    setBackgroundHexInput(nextValue);
    setColorState((previous) => ({
      ...previous,
      background: nextValue,
      enabled: true,
    }));
  }, []);

  const handleForegroundColorChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value.toUpperCase();
    setForegroundHexInput(nextValue);
    setColorState((previous) => ({
      ...previous,
      foreground: nextValue,
      enabled: true,
    }));
  }, []);

  const handleBackgroundHexInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    setBackgroundHexInput(rawValue);
    const normalized = normalizeHex(rawValue);
    if (normalized) {
      setColorState((previous) => ({
        ...previous,
        background: normalized,
        enabled: true,
      }));
    }
  }, []);

  const handleForegroundHexInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    setForegroundHexInput(rawValue);
    const normalized = normalizeHex(rawValue);
    if (normalized) {
      setColorState((previous) => ({
        ...previous,
        foreground: normalized,
        enabled: true,
      }));
    }
  }, []);

  const handleSwap = useCallback(() => {
    setColorState((previous) => {
      const next = {
        background: previous.foreground,
        foreground: previous.background,
        enabled: true,
      };
      setBackgroundHexInput(next.background);
      setForegroundHexInput(next.foreground);
      return next;
    });
  }, []);

  const handleApplyPreset = useCallback((preset: QuickPreset) => {
    setColorState({
      background: preset.background,
      foreground: preset.foreground,
      enabled: true,
    });
    setBackgroundHexInput(preset.background);
    setForegroundHexInput(preset.foreground);
  }, []);

  const handleApplyPresetKey = useCallback((presetKey: PresetKey) => {
    const preset = PRESET_DEFINITIONS[presetKey];
    setColorState({
      background: preset.bg,
      foreground: preset.fg,
      enabled: true,
    });
    setBackgroundHexInput(preset.bg);
    setForegroundHexInput(preset.fg);
  }, []);

  const handleReset = useCallback(() => {
    setColorState({
      background: CHLORINE_DEFAULT.bg,
      foreground: CHLORINE_DEFAULT.fg,
      enabled: false,
    });
    setBackgroundHexInput(CHLORINE_DEFAULT.bg);
    setForegroundHexInput(CHLORINE_DEFAULT.fg);
    clearPersistedState();
    removeStylesheet();
  }, []);

  const handleCopyHex = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const payload = `bg: ${colorState.background}\nfg: ${colorState.foreground}`;
    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      // Silently ignore clipboard failures.
    }
  }, [colorState.background, colorState.foreground]);

  const handleCopyShareUrl = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.clipboard) return;
    const url = new URL(window.location.href);
    url.searchParams.set("tweak", "1");
    url.searchParams.set("bg", colorState.background.replace("#", ""));
    url.searchParams.set("fg", colorState.foreground.replace("#", ""));
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      // Silently ignore clipboard failures.
    }
  }, [colorState.background, colorState.foreground]);

  // Honor URL params on first load (before applying persisted state wins).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const queryParameters = new URLSearchParams(window.location.search);
    const backgroundParameter = queryParameters.get("bg");
    const foregroundParameter = queryParameters.get("fg");
    if (!backgroundParameter && !foregroundParameter) return;
    const nextBackground = backgroundParameter ? normalizeHex(backgroundParameter) : null;
    const nextForeground = foregroundParameter ? normalizeHex(foregroundParameter) : null;
    if (!nextBackground && !nextForeground) return;
    setColorState((previous) => {
      const next = {
        background: nextBackground ?? previous.background,
        foreground: nextForeground ?? previous.foreground,
        enabled: true,
      };
      setBackgroundHexInput(next.background);
      setForegroundHexInput(next.foreground);
      return next;
    });
  }, []);

  if (!shouldRender) return null;

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        aria-label="Open color tweak panel"
        style={collapsedTriggerStyle}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: colorState.foreground,
            border: `1px solid ${colorState.background}`,
            boxShadow: "0 0 0 1px color-mix(in srgb, currentColor 25%, transparent)",
          }}
        />
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>tweak</span>
      </button>
    );
  }

  return (
    <div role="dialog" aria-label="Color tweak panel" style={panelStyle}>
      <header style={headerStyle}>
        <span style={titleStyle}>color tweak</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            onClick={() =>
              setColorState((previous) => ({
                ...previous,
                enabled: !previous.enabled,
              }))
            }
            aria-pressed={colorState.enabled}
            style={{
              ...iconButtonStyle,
              opacity: colorState.enabled ? 1 : 0.5,
            }}
            title={colorState.enabled ? "Disable overrides" : "Enable overrides"}
          >
            {colorState.enabled ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            aria-label="Collapse panel"
            style={iconButtonStyle}
            title="Collapse"
          >
            ×
          </button>
        </div>
      </header>

      <section style={sectionStyle}>
        <ColorRow
          label="background"
          colorValue={colorState.background}
          hexInputValue={backgroundHexInput}
          onColorPickerChange={handleBackgroundColorChange}
          onHexInputChange={handleBackgroundHexInput}
        />
        <ColorRow
          label="foreground"
          colorValue={colorState.foreground}
          hexInputValue={foregroundHexInput}
          onColorPickerChange={handleForegroundColorChange}
          onHexInputChange={handleForegroundHexInput}
        />
        <button type="button" onClick={handleSwap} style={swapButtonStyle}>
          ⇅ swap
        </button>
      </section>

      <section style={sectionStyle}>
        <div style={subLabelStyle}>derived</div>
        <div style={derivedRowStyle}>
          <DerivedSwatch label="bg2" value={derivedPreview.bg2} />
          <DerivedSwatch label="dim" value={derivedPreview.fgDim} />
          <DerivedSwatch label="mute" value={derivedPreview.fgMute} />
          <DerivedSwatch label="rule" value={derivedPreview.rule} />
          <DerivedSwatch label="rule+" value={derivedPreview.ruleStrong} />
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={subLabelStyle}>quick</div>
        <div style={presetGridStyle}>
          {QUICK_PRESETS.map((preset) => {
            const isActive =
              colorState.background.toLowerCase() === preset.background.toLowerCase() &&
              colorState.foreground.toLowerCase() === preset.foreground.toLowerCase();
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                style={{
                  ...presetButtonStyle,
                  outline: isActive
                    ? "1px solid color-mix(in srgb, currentColor 85%, transparent)"
                    : "1px solid color-mix(in srgb, currentColor 15%, transparent)",
                }}
                title={preset.label}
              >
                <span
                  style={{
                    ...presetSwatchStyle,
                    background: preset.background,
                  }}
                >
                  <span
                    style={{
                      ...presetForegroundDotStyle,
                      background: preset.foreground,
                    }}
                  />
                </span>
                <span style={presetLabelStyle}>{preset.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <div style={subLabelStyle}>presets</div>
        <div style={presetKeyRowStyle}>
          {(Object.keys(PRESET_DEFINITIONS) as PresetKey[]).map((presetKey) => (
            <button
              key={presetKey}
              type="button"
              onClick={() => handleApplyPresetKey(presetKey)}
              style={presetKeyButtonStyle}
              title={`apply ${PRESET_DEFINITIONS[presetKey].name}`}
            >
              <span
                style={{
                  ...presetSwatchStyle,
                  background: PRESET_DEFINITIONS[presetKey].bg,
                }}
              >
                <span
                  style={{
                    ...presetForegroundDotStyle,
                    background: PRESET_DEFINITIONS[presetKey].fg,
                  }}
                />
              </span>
              <span style={presetLabelStyle}>{presetKey}</span>
            </button>
          ))}
        </div>
      </section>

      <footer style={footerStyle}>
        <button
          type="button"
          onClick={handleCopyHex}
          style={ghostButtonStyle}
          title="Copy hex pair to clipboard"
        >
          copy hex
        </button>
        <button
          type="button"
          onClick={handleCopyShareUrl}
          style={ghostButtonStyle}
          title="Copy share URL with these colors"
        >
          share link
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={ghostButtonStyle}
          title="Reset to chlorine defaults"
        >
          reset
        </button>
      </footer>
    </div>
  );
}

interface ColorRowProps {
  label: string;
  colorValue: string;
  hexInputValue: string;
  onColorPickerChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onHexInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

function ColorRow({
  label,
  colorValue,
  hexInputValue,
  onColorPickerChange,
  onHexInputChange,
}: ColorRowProps) {
  return (
    <label style={colorRowStyle}>
      <span style={subLabelStyle}>{label}</span>
      <span style={colorRowControlsStyle}>
        <span style={{ position: "relative", display: "inline-block" }}>
          <input
            type="color"
            value={colorValue}
            onChange={onColorPickerChange}
            style={colorPickerStyle}
            aria-label={`${label} color picker`}
          />
          <span
            aria-hidden
            style={{
              ...swatchOverlayStyle,
              background: colorValue,
            }}
          />
        </span>
        <input
          type="text"
          value={hexInputValue}
          onChange={onHexInputChange}
          spellCheck={false}
          maxLength={7}
          style={hexInputStyle}
          aria-label={`${label} hex value`}
        />
      </span>
    </label>
  );
}

interface DerivedSwatchProps {
  label: string;
  value: string;
}

function DerivedSwatch({ label, value }: DerivedSwatchProps) {
  return (
    <div style={derivedSwatchStyle}>
      <span
        style={{
          width: "100%",
          height: 18,
          background: value,
          borderRadius: 2,
          border: "1px solid var(--border)",
        }}
        title={value}
      />
      <span style={derivedSwatchLabelStyle}>{label}</span>
    </div>
  );
}

// The dev panel is intentionally themable so the user can preview takeover
// colors against a surface that responds to them. Backgrounds, text, and
// border tokens flow from the page theme variables; subtle inner accents
// are derived from `currentColor` so they read on whichever foreground is
// active. There is no hardcoded black anywhere — the only fixed values are
// the depth shadow (always semi-opaque black for hierarchy) and color
// swatches (which need to render the user's chosen hex as-is).
const panelStyle = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 2147483647,
  width: 280,
  padding: 12,
  borderRadius: 10,
  background: "var(--background)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid var(--border)",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.5), 0 1px 0 rgba(255, 255, 255, 0.04) inset",
  color: "var(--foreground)",
  fontFamily: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.4,
  display: "flex",
  flexDirection: "column",
  gap: 10,
} as const;

const collapsedTriggerStyle = {
  position: "fixed",
  right: 16,
  bottom: 16,
  zIndex: 2147483647,
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 999,
  background: "var(--background)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  cursor: "pointer",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
} as const;

const headerStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
} as const;

const titleStyle = {
  textTransform: "uppercase",
  letterSpacing: "0.14em",
  fontSize: 11,
  color: "color-mix(in srgb, currentColor 85%, transparent)",
} as const;

const iconButtonStyle = {
  appearance: "none",
  background: "transparent",
  color: "currentColor",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontSize: 11,
  padding: "2px 8px",
  cursor: "pointer",
  fontFamily: "inherit",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
} as const;

const sectionStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
} as const;

const subLabelStyle = {
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontSize: 10,
  color: "color-mix(in srgb, currentColor 55%, transparent)",
} as const;

const colorRowStyle = {
  display: "grid",
  gridTemplateColumns: "84px 1fr",
  alignItems: "center",
  gap: 8,
  cursor: "default",
} as const;

const colorRowControlsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
} as const;

const colorPickerStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  opacity: 0,
  cursor: "pointer",
  border: 0,
  padding: 0,
} as const;

const swatchOverlayStyle = {
  display: "block",
  width: 32,
  height: 22,
  borderRadius: 4,
  border: "1px solid var(--border)",
  pointerEvents: "none",
} as const;

const hexInputStyle = {
  flex: 1,
  appearance: "none",
  background: "color-mix(in srgb, currentColor 4%, transparent)",
  color: "currentColor",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 12,
  padding: "4px 6px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  outline: "none",
} as const;

const swapButtonStyle = {
  appearance: "none",
  alignSelf: "flex-end",
  background: "transparent",
  color: "color-mix(in srgb, currentColor 70%, transparent)",
  border: "1px dashed var(--border)",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 10,
  padding: "3px 8px",
  cursor: "pointer",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} as const;

const derivedRowStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(5, 1fr)",
  gap: 6,
} as const;

const derivedSwatchStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: 3,
} as const;

const derivedSwatchLabelStyle = {
  fontSize: 9,
  letterSpacing: "0.06em",
  color: "color-mix(in srgb, currentColor 55%, transparent)",
  textAlign: "center",
  textTransform: "uppercase",
} as const;

const presetGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 6,
} as const;

const presetButtonStyle = {
  appearance: "none",
  background: "transparent",
  border: "none",
  borderRadius: 4,
  padding: 4,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 6,
  outlineOffset: 1,
} as const;

const presetKeyRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
} as const;

const presetKeyButtonStyle = {
  ...presetButtonStyle,
  background: "color-mix(in srgb, currentColor 4%, transparent)",
  border: "1px solid var(--border)",
  padding: "3px 6px",
} as const;

const presetSwatchStyle = {
  position: "relative",
  display: "inline-block",
  width: 18,
  height: 18,
  borderRadius: 3,
  border: "1px solid var(--border)",
  flexShrink: 0,
} as const;

// Outline ring on the inner swatch dot stays a fixed mid-opacity black so
// it reads against any background color the user picks (light, dark, or
// saturated). The dot shows a literal hex preview, so its outline must be
// theme-independent.
const presetForegroundDotStyle = {
  position: "absolute",
  bottom: 2,
  right: 2,
  width: 8,
  height: 8,
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.35)",
} as const;

const presetLabelStyle = {
  fontSize: 10,
  letterSpacing: "0.05em",
  color: "color-mix(in srgb, currentColor 85%, transparent)",
  textTransform: "lowercase",
} as const;

const footerStyle = {
  display: "flex",
  gap: 6,
  paddingTop: 4,
  borderTop: "1px solid var(--border)",
} as const;

const ghostButtonStyle = {
  flex: 1,
  appearance: "none",
  background: "transparent",
  color: "color-mix(in srgb, currentColor 85%, transparent)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontFamily: "inherit",
  fontSize: 10,
  padding: "4px 6px",
  cursor: "pointer",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
} as const;
