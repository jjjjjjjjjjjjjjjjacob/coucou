// Coucou tenant-template presets.
//
// A "preset" is the starting visual identity for a tenant site. It supplies
// typography, button shape, masthead voice, and color defaults. Tenants pick
// one preset; per-event color overrides
// (themeBackgroundColor / themeTextColor) layer on top.
//
// Source of truth for the values here is the design handoff bundle's
// tenant.jsx and auth.jsx. Do not modify these without re-grounding against
// the handoff.

export type PresetKey = "maison" | "dojo" | "atrium" | "coucou" | "chlorine" | "danza";

export type PresetCtaShape = "rounded" | "ghost-link" | "ghost-bordered";

export type PresetBrandMarkStyle =
  | "filled-circle"
  | "square-serif"
  | "thin-ring"
  | "logo-upload"
  | "wordmark-only";

export interface PresetAuthCopy {
  heading: string;
  sub: string;
  eyebrow: string;
}

export interface PresetDefinition {
  key: PresetKey;
  name: string;
  tagline: string;
  bg: string;
  bg2: string;
  fg: string;
  fgDim: string;
  fgMute: string;
  rule: string;
  ruleStrong: string;
  accent: string;
  display: string;
  text: string;
  titleSize: number;
  upper: boolean;
  ctaShape: PresetCtaShape;
  buttonRadius: number;
  brandMarkStyle: PresetBrandMarkStyle;
  qrFg: string;
  qrBg: string;
  authCopy: PresetAuthCopy;
}

// Helvetica Neue is system-installed on macOS/iOS. The fallback chain
// continues to Helvetica → Arial → system-ui so non-Apple clients still
// land on the right metrics. No Google Font needs to be loaded.
const HELVETICA_STACK = '"Helvetica Neue", "Helvetica", "Arial", system-ui, sans-serif';

export const PRESET_KEYS: readonly PresetKey[] = [
  "maison",
  "dojo",
  "atrium",
  "coucou",
  "chlorine",
  "danza",
];

export const PRESET_DEFINITIONS: Record<PresetKey, PresetDefinition> = {
  // Maison Obscur — the original quiet/dark editorial preset from the design.
  // Dark room, bone type, hairline rules, square-serif brand mark.
  // Used by apps/club-chlorine.
  maison: {
    key: "maison",
    name: "Maison Obscur",
    tagline: "",
    bg: "#0A0A0A",
    bg2: "#0F0F0F",
    fg: "#E8E6E1",
    fgDim: "#8C8A85",
    fgMute: "#4A4845",
    rule: "rgba(232, 230, 225, 0.10)",
    ruleStrong: "rgba(232, 230, 225, 0.18)",
    accent: "#E8E6E1",
    display: HELVETICA_STACK,
    text: HELVETICA_STACK,
    titleSize: 36,
    upper: false,
    ctaShape: "ghost-bordered",
    buttonRadius: 0,
    brandMarkStyle: "square-serif",
    qrFg: "#E8E6E1",
    qrBg: "#0A0A0A",
    authCopy: {
      heading: "Sign in.",
      sub: "We'll text a code. The number we text is the one we keep.",
      eyebrow: "Members entrance",
    },
  },
  dojo: {
    key: "dojo",
    name: "Dojo Pomodoro",
    tagline: "06.06 · brooklyn",
    bg: "#FFFFFF",
    bg2: "#F8F6F1",
    fg: "#EF4444",
    fgDim: "rgba(239, 68, 68, 0.65)",
    fgMute: "rgba(239, 68, 68, 0.35)",
    rule: "rgba(239, 68, 68, 0.20)",
    ruleStrong: "rgba(239, 68, 68, 0.40)",
    accent: "#EF4444",
    display: 'var(--font-geist-sans), "Geist", "Inter", ui-sans-serif, system-ui, sans-serif',
    text: 'var(--font-geist-sans), "Geist", "Inter", ui-sans-serif, system-ui, sans-serif',
    titleSize: 44,
    upper: true,
    ctaShape: "rounded",
    buttonRadius: 8,
    brandMarkStyle: "filled-circle",
    qrFg: "#EF4444",
    qrBg: "#FFFFFF",
    authCopy: {
      heading: "Sign in to RSVP.",
      sub: "We'll text a code. Use the same number you'll show at the door.",
      eyebrow: "Members & guests",
    },
  },
  // Atrium remains defined for future use but is not assigned to any tenant.
  // Kept here so existing code paths that reference the key continue to work.
  atrium: {
    key: "atrium",
    name: "Atrium",
    tagline: "vol. xii · paper room",
    bg: "#F4EFE6",
    bg2: "#EBE5DA",
    fg: "#1F2A1A",
    fgDim: "#5C6A55",
    fgMute: "#94A089",
    rule: "rgba(31, 42, 26, 0.14)",
    ruleStrong: "rgba(31, 42, 26, 0.28)",
    accent: "#3D5C2E",
    display: HELVETICA_STACK,
    text: HELVETICA_STACK,
    titleSize: 38,
    upper: false,
    ctaShape: "ghost-bordered",
    buttonRadius: 0,
    brandMarkStyle: "square-serif",
    qrFg: "#1F2A1A",
    qrBg: "#F4EFE6",
    authCopy: {
      heading: "Sign in to reserve a seat.",
      sub: "Phone or email — whichever you check first.",
      eyebrow: "Members entrance",
    },
  },
  // Club Chlorine — pool-blue (#1E3CFF) on white, heavy rounded display type.
  // Used by apps/club-chlorine. The chlorine display stack falls back through
  // Bowlby One → Fugaz One → Anton → Impact when Adobe's Alfarn isn't loaded.
  chlorine: {
    key: "chlorine",
    name: "Club Chlorine",
    tagline: "",
    bg: "#FFFFFF",
    bg2: "#F0F1FF",
    fg: "#1E3CFF",
    fgDim: "rgba(30, 60, 255, 0.65)",
    fgMute: "rgba(30, 60, 255, 0.35)",
    rule: "rgba(30, 60, 255, 0.20)",
    ruleStrong: "rgba(30, 60, 255, 0.40)",
    accent: "#1E3CFF",
    display: 'var(--font-bowlby-one), "Bowlby One", "Fugaz One", "Anton", "Impact", sans-serif',
    text: HELVETICA_STACK,
    titleSize: 96,
    upper: true,
    ctaShape: "rounded",
    buttonRadius: 0,
    brandMarkStyle: "logo-upload",
    qrFg: "#1E3CFF",
    qrBg: "#FFFFFF",
    authCopy: {
      heading: "Sign in to Club Chlorine.",
      sub: "We'll text a code. Same number you'll show at the door.",
      eyebrow: "Pool hours",
    },
  },
  // Danza Organica — the Dojo Pomodoro identity (Geist, uppercase, rounded)
  // recolored to bright turquoise with near-black type. Used by
  // apps/danza-organica.
  danza: {
    key: "danza",
    name: "Danza Organica",
    tagline: "",
    bg: "#2EC4B6",
    bg2: "#4BD6C9",
    fg: "#0A0A0A",
    fgDim: "rgba(10, 10, 10, 0.65)",
    fgMute: "rgba(10, 10, 10, 0.38)",
    rule: "rgba(10, 10, 10, 0.20)",
    ruleStrong: "rgba(10, 10, 10, 0.40)",
    accent: "#0A0A0A",
    display: 'var(--font-geist-sans), "Geist", "Inter", ui-sans-serif, system-ui, sans-serif',
    text: 'var(--font-geist-sans), "Geist", "Inter", ui-sans-serif, system-ui, sans-serif',
    titleSize: 44,
    upper: true,
    ctaShape: "rounded",
    buttonRadius: 8,
    brandMarkStyle: "filled-circle",
    qrFg: "#0A0A0A",
    qrBg: "#2EC4B6",
    authCopy: {
      heading: "Sign in to RSVP.",
      sub: "We'll text a code. Use the same number you'll show at the door.",
      eyebrow: "Members & guests",
    },
  },
  // Coucou is the platform itself — dark, helvetica, distinct from any
  // tenant. Used by apps/coucou for landing, admin, sign-in, legal pages.
  // No tagline: tenants get event-style taglines; the platform shows an
  // "Inquire" link in the masthead's rightSlot instead.
  coucou: {
    key: "coucou",
    name: "Coucou",
    tagline: "",
    bg: "#0A0A0A",
    bg2: "#0F0F0F",
    fg: "#E8E6E1",
    fgDim: "#8C8A85",
    fgMute: "#4A4845",
    rule: "rgba(232, 230, 225, 0.10)",
    ruleStrong: "rgba(232, 230, 225, 0.18)",
    accent: "#E8E6E1",
    display: HELVETICA_STACK,
    text: HELVETICA_STACK,
    titleSize: 32,
    upper: false,
    ctaShape: "ghost-bordered",
    buttonRadius: 0,
    brandMarkStyle: "thin-ring",
    qrFg: "#E8E6E1",
    qrBg: "#0A0A0A",
    authCopy: {
      heading: "Sign in to Coucou.",
      sub: "Phone — quick and quiet.",
      eyebrow: "Quiet entrance",
    },
  },
};

export function isPresetKey(value: unknown): value is PresetKey {
  return (
    typeof value === "string" &&
    (value === "maison" ||
      value === "dojo" ||
      value === "atrium" ||
      value === "coucou" ||
      value === "chlorine" ||
      value === "danza")
  );
}

export function getPresetDefinition(key: PresetKey): PresetDefinition {
  return PRESET_DEFINITIONS[key];
}
