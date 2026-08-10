export type BauhausEventPosition = "center" | "left";
export type BauhausEventTextColor = "white" | "black" | "teal";
export type BauhausEventHighlightColor = "black" | "teal";
export type BauhausEventLogoVariant = "tealorange" | "blackwhite" | "blackorange" | "tealblack";

export interface BauhausEventDisplaySettings {
  position: BauhausEventPosition;
  textColor: BauhausEventTextColor;
  highlightColor: BauhausEventHighlightColor;
  logoVariant: BauhausEventLogoVariant;
}

interface SearchParametersReader {
  get(name: string): string | null;
}

export const DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS: BauhausEventDisplaySettings = {
  position: "center",
  textColor: "black",
  highlightColor: "teal",
  logoVariant: "tealblack",
};

const POSITION_VALUES = new Set<BauhausEventPosition>(["center", "left"]);
const TEXT_COLOR_VALUES = new Set<BauhausEventTextColor>(["white", "black", "teal"]);
const HIGHLIGHT_COLOR_VALUES = new Set<BauhausEventHighlightColor>(["black", "teal"]);
const LOGO_VARIANT_VALUES = new Set<BauhausEventLogoVariant>([
  "tealorange",
  "blackwhite",
  "blackorange",
  "tealblack",
]);

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
  };
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
