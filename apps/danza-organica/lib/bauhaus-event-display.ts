export type BauhausEventPosition = "center" | "left";
export type BauhausEventTextColor = "white" | "black" | "teal" | "orange";
export type BauhausEventHighlightColor = "black" | "teal" | "none";
export type BauhausEventLogoVariant = "tealorange" | "blackwhite" | "blackorange" | "tealblack";
export type BauhausEventDotColor = "white" | "black";
export type BauhausEventPreset = "simple" | "bold";
export type BauhausEventInfoDensity = "minimal" | "verbose";

export interface BauhausEventDisplaySettings {
  position: BauhausEventPosition;
  textColor: BauhausEventTextColor;
  highlightColor: BauhausEventHighlightColor;
  logoVariant: BauhausEventLogoVariant;
  dotColor: BauhausEventDotColor;
  preset: BauhausEventPreset;
  infoDensity: BauhausEventInfoDensity;
}

export const BAUHAUS_DISPLAY_COLORS = {
  black: "#0A0A0A",
  none: "transparent",
  orange: "#FC7243",
  teal: "#17E1E5",
  white: "#FFFFFF",
} as const satisfies Record<
  BauhausEventTextColor | BauhausEventHighlightColor | BauhausEventDotColor,
  string
>;

interface SearchParametersReader {
  get(name: string): string | null;
}

export const DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS: BauhausEventDisplaySettings = {
  position: "center",
  textColor: "orange",
  highlightColor: "none",
  logoVariant: "tealorange",
  dotColor: "white",
  preset: "simple",
  infoDensity: "minimal",
};

const POSITION_VALUES = new Set<BauhausEventPosition>(["center", "left"]);
const TEXT_COLOR_VALUES = new Set<BauhausEventTextColor>(["white", "black", "teal", "orange"]);
const HIGHLIGHT_COLOR_VALUES = new Set<BauhausEventHighlightColor>(["black", "teal", "none"]);
const LOGO_VARIANT_VALUES = new Set<BauhausEventLogoVariant>([
  "tealorange",
  "blackwhite",
  "blackorange",
  "tealblack",
]);
const DOT_COLOR_VALUES = new Set<BauhausEventDotColor>(["white", "black"]);
const PRESET_VALUES = new Set<BauhausEventPreset>(["simple", "bold"]);
const INFO_DENSITY_VALUES = new Set<BauhausEventInfoDensity>(["minimal", "verbose"]);

export const BAUHAUS_PARTNER_LOGO_SOURCES: Readonly<
  Record<BauhausEventLogoVariant, Readonly<Record<string, string>>>
> = {
  tealorange: {
    "nothing radio": "/partners/nothing-radio.png",
    "the market": "/partners/the-market-danza.svg",
  },
  blackwhite: {
    "nothing radio": "/partners/nothing-radio-black-white.svg",
    "the market": "/partners/the-market-wordmark-black-white.svg",
  },
  blackorange: {
    "nothing radio": "/partners/nothing-radio-black-orange.svg",
    "the market": "/partners/the-market-wordmark-black-orange.svg",
  },
  tealblack: {
    "nothing radio": "/partners/nothing-radio-teal-black.svg",
    "the market": "/partners/the-market-wordmark-teal-black.svg",
  },
};

function resolveAllowedValue<AllowedValue extends string>(
  candidate: string | null,
  allowedValues: ReadonlySet<AllowedValue>,
  fallback: AllowedValue,
): AllowedValue {
  const normalizedCandidate = candidate?.trim().toLowerCase() as AllowedValue | undefined;
  return normalizedCandidate && allowedValues.has(normalizedCandidate)
    ? normalizedCandidate
    : fallback;
}

export function resolveBauhausEventDisplaySettings(
  searchParameters: SearchParametersReader,
): BauhausEventDisplaySettings {
  const preset = resolveAllowedValue(
    searchParameters.get("preset"),
    PRESET_VALUES,
    DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.preset,
  );

  return {
    position: resolveAllowedValue(
      searchParameters.get("position"),
      POSITION_VALUES,
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.position,
    ),
    textColor: resolveAllowedValue(
      searchParameters.get("text"),
      TEXT_COLOR_VALUES,
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.textColor,
    ),
    highlightColor: resolveAllowedValue(
      searchParameters.get("highlight"),
      HIGHLIGHT_COLOR_VALUES,
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.highlightColor,
    ),
    logoVariant: resolveAllowedValue(
      searchParameters.get("logo"),
      LOGO_VARIANT_VALUES,
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.logoVariant,
    ),
    dotColor: resolveAllowedValue(
      searchParameters.get("dots"),
      DOT_COLOR_VALUES,
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.dotColor,
    ),
    preset,
    infoDensity: resolveAllowedValue(
      searchParameters.get("info"),
      INFO_DENSITY_VALUES,
      preset === "simple" ? "minimal" : "verbose",
    ),
  };
}

/** Formats the compact poster date used by the simple preset (for example, "FRI 08.21"). */
export function formatCompactBauhausDate(timestamp: number, timezone?: string): string {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone ?? "UTC",
  }).formatToParts(new Date(timestamp));
  const weekday = dateParts.find((datePart) => datePart.type === "weekday")?.value ?? "";
  const month = dateParts.find((datePart) => datePart.type === "month")?.value ?? "";
  const day = dateParts.find((datePart) => datePart.type === "day")?.value ?? "";

  return `${weekday.toUpperCase()} ${month}.${day}`.trim();
}

/**
 * The Vol. 4 host billing is deliberately typeset as two poster lines. Keep
 * the named break stable at every width rather than allowing the browser to
 * choose a different wrap as particles move behind it.
 */
export function splitBauhausHostLines(hosts: readonly string[]): string[] {
  const forcedBreakIndex = hosts.findIndex((host, hostIndex) => {
    const nextHost = hosts[hostIndex + 1];
    return host.trim().toLowerCase() === "kelsey" && nextHost?.trim().toLowerCase() === "elsb3th";
  });

  if (forcedBreakIndex < 0) {
    return hosts.length > 0 ? [hosts.join(" · ")] : [];
  }

  return [
    hosts.slice(0, forcedBreakIndex + 1).join(" · "),
    hosts.slice(forcedBreakIndex + 1).join(" · "),
  ];
}
