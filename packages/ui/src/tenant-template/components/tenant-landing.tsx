"use client";

import type { ReactNode } from "react";
import { useMobile } from "../use-mobile";
import { usePreset } from "../use-preset";
import { Eyebrow } from "./primitives/eyebrow";
import { MetaRow } from "./primitives/meta-row";
import { TenantShell } from "./tenant-shell";

export interface TenantLandingEvent {
  /**
   * Primary event name. Rendered as the page hero.
   */
  name: string;
  secondaryTitle?: string | null;
  /**
   * Pre-formatted "When" string ("Saturday 06.06.26").
   */
  whenLabel?: string | null;
  /**
   * Pre-formatted "Where" string. Often "Sent on confirmation" pre-RSVP.
   */
  whereLabel?: string | null;
  /**
   * Dress code or door note.
   */
  dressLabel?: string | null;
  /**
   * The hero blurb under the meta rows. Markdown-style line breaks are
   * preserved as paragraph breaks.
   */
  lede?: string | null;
  /**
   * Optional public lineup rows shown below the event metadata.
   */
  lineup?: TenantLandingAct[];
  /**
   * Optional override for the eyebrow ("THE NEXT POMODORO" for dojo).
   */
  eyebrow?: string | null;
}

export interface TenantLandingAct {
  displayName: string;
  descriptorBadges?: string[];
  socialUrl?: string | null;
}

export interface TenantLandingRecentEvent {
  /**
   * Short formatted date ("04.iv").
   */
  date: string;
  /**
   * Event name to display.
   */
  name: string;
  /**
   * Tail label — typically "72 / 80" attendance.
   */
  trailing?: string;
}

export interface TenantLandingProps {
  event: TenantLandingEvent;
  /**
   * Optional copy for the "partner" section. Falls back to a preset-default.
   */
  aboutCopy?: string | null;
  /**
   * Optional rows for the "recent" section. If the array is empty, the
   * section is omitted.
   */
  recentEvents?: TenantLandingRecentEvent[];
  /**
   * Contact line for the footer.
   */
  contactEmail?: string;
  /**
   * Render slot for the primary CTA. The caller decides routing — the
   * component does not embed a Link.
   */
  primaryCta: ReactNode;
  /**
   * Optional slot rendered next to the primary CTA. Typically a low-key link
   * to "the room" or similar context page.
   */
  secondaryCta?: ReactNode;
  /**
   * When true, skip the inner `TenantShell` wrapper. Use when the parent
   * already provides a viewport-owning shell (e.g. `ChlorineSplitShell`).
   */
  noShell?: boolean;
}

const DEFAULT_ABOUT_COPY: Record<string, string> = {
  dojo: "Pomodoro is a recurring outdoor party. We do not list. If you have this page, someone we know has sent you.",
  atrium:
    "Atrium is a small reading-room for new work. Members keep a chair; guests are welcome by invitation.",
  maison:
    "Maison Obscure is a small, recurring evening for a particular crowd. If you have found this page, someone we trust has sent you.",
  chlorine: "Club Chlorine is a recurring pool-hours series. RSVP access opens by event.",
  danza:
    "Danza Organica is a recurring night for dancing. If you have this page, someone we know has sent you.",
};

const DEFAULT_HERO_EYEBROW: Record<string, string> = {
  dojo: "THE NEXT POMODORO",
  atrium: "Tonight",
  maison: "The next night",
  chlorine: "Club Chlorine",
  danza: "THE NEXT DANZA",
};

const DEFAULT_PARTNER_EYEBROW: Record<string, string> = {
  dojo: "THE PARTNER",
  atrium: "The partner",
  maison: "The partner",
  chlorine: "The pool",
  danza: "THE PARTNER",
};

const DEFAULT_RECENT_EYEBROW: Record<string, string> = {
  dojo: "RECENT",
  atrium: "Recent",
  maison: "Recent",
  chlorine: "Recent",
  danza: "RECENT",
};

export function TenantLanding({
  event,
  aboutCopy,
  recentEvents,
  primaryCta,
  secondaryCta,
  noShell = false,
}: TenantLandingProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();

  const heroEyebrow = event.eyebrow ?? DEFAULT_HERO_EYEBROW[presetKey];
  const partnerEyebrow = DEFAULT_PARTNER_EYEBROW[presetKey];
  const recentEyebrow = DEFAULT_RECENT_EYEBROW[presetKey];
  const partnerCopy = aboutCopy ?? DEFAULT_ABOUT_COPY[presetKey];
  const showRecent = (recentEvents?.length ?? 0) > 0;
  const showLineup = (event.lineup?.length ?? 0) > 0;

  const sectionPadding = noShell ? 0 : isMobile ? "60px 0 48px" : "120px 0 96px";
  const landingSection = (
    <>
      <section style={{ padding: sectionPadding }}>
        <Eyebrow>{heroEyebrow}</Eyebrow>
        <h1
          className="m-0 mb-6 max-w-[640px] leading-[1.15]"
          style={{
            fontFamily: "var(--tt-display)",
            fontWeight: presetKey === "dojo" ? 700 : 400,
            fontSize: isMobile ? Math.min(preset.titleSize, 30) : preset.titleSize,
            letterSpacing: preset.upper ? "-0.01em" : "-0.005em",
            color: "var(--tt-fg)",
          }}
        >
          {preset.upper ? event.name.toUpperCase() : event.name}
        </h1>
        {event.secondaryTitle ? (
          <div
            style={{
              fontFamily: "var(--tt-display)",
              fontWeight: presetKey === "dojo" ? 600 : 400,
              fontSize: isMobile ? 18 : 22,
              color: "var(--tt-fg-dim)",
              margin: "-12px 0 32px",
              letterSpacing: preset.upper ? "0.04em" : "-0.005em",
            }}
          >
            {preset.upper ? event.secondaryTitle.toUpperCase() : event.secondaryTitle}
          </div>
        ) : null}

        <div className="my-10 flex flex-col border-t" style={{ borderTopColor: "var(--tt-rule)" }}>
          {event.whenLabel ? <MetaRow label="When">{event.whenLabel}</MetaRow> : null}
          {event.whereLabel ? <MetaRow label="Where">{event.whereLabel}</MetaRow> : null}
          {event.dressLabel ? <MetaRow label="Dress">{event.dressLabel}</MetaRow> : null}
        </div>

        {showLineup ? (
          <div
            className="mb-10 max-w-[640px] border-y py-5"
            style={{ borderColor: "var(--tt-rule)" }}
          >
            {event.lineup!.map((act, actIndex) => {
              const actContent = (
                <>
                  <span>{preset.upper ? act.displayName.toUpperCase() : act.displayName}</span>
                  {act.descriptorBadges?.length ? (
                    <span className="inline-flex flex-wrap gap-1.5" style={{ marginLeft: 8 }}>
                      {act.descriptorBadges.map((descriptorBadge) => (
                        <span
                          key={descriptorBadge}
                          className="border px-1.5 py-0.5 text-[10px]"
                          style={{
                            borderColor: "var(--tt-rule)",
                            color: "var(--tt-fg-dim)",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {descriptorBadge.toUpperCase()}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </>
              );

              return act.socialUrl ? (
                <a
                  key={`${act.displayName}-${actIndex}`}
                  href={act.socialUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-2 text-[18px] leading-tight no-underline"
                  style={{
                    color: "var(--tt-fg)",
                    fontFamily: "var(--tt-display)",
                    fontWeight: presetKey === "dojo" ? 600 : 400,
                  }}
                >
                  {actContent}
                </a>
              ) : (
                <div
                  key={`${act.displayName}-${actIndex}`}
                  className="py-2 text-[18px] leading-tight"
                  style={{
                    color: "var(--tt-fg)",
                    fontFamily: "var(--tt-display)",
                    fontWeight: presetKey === "dojo" ? 600 : 400,
                  }}
                >
                  {actContent}
                </div>
              );
            })}
          </div>
        ) : null}

        {event.lede ? (
          <p
            className="mb-10 max-w-[540px]"
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--tt-fg-dim)",
              margin: "0 0 40px",
            }}
          >
            {event.lede}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-6">
          {primaryCta}
          {secondaryCta}
        </div>
      </section>

      {partnerCopy ? (
        <section
          className="border-t"
          style={{
            padding: isMobile ? "48px 0" : "72px 0",
            borderTopColor: "var(--tt-rule)",
          }}
        >
          <Eyebrow>{partnerEyebrow}</Eyebrow>
          <p
            className="m-0 max-w-[540px]"
            style={{
              fontSize: 14,
              lineHeight: 1.7,
              color: "var(--tt-fg)",
            }}
          >
            {partnerCopy}
          </p>
        </section>
      ) : null}

      {showRecent ? (
        <section
          className="border-t"
          style={{
            padding: isMobile ? "48px 0" : "72px 0",
            borderTopColor: "var(--tt-rule)",
          }}
        >
          <Eyebrow>{recentEyebrow}</Eyebrow>
          <div>
            {recentEvents!.map((row, index) => (
              <div
                key={`${row.date}-${index}`}
                className="grid items-baseline gap-4 border-b py-3.5 text-[13px]"
                style={{
                  gridTemplateColumns: "70px 1fr 80px",
                  borderBottomColor: "var(--tt-rule)",
                }}
              >
                <span style={{ color: "var(--tt-fg-mute)" }}>{row.date}</span>
                <span>{row.name}</span>
                <span className="text-right" style={{ color: "var(--tt-fg-dim)" }}>
                  {row.trailing ?? ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  if (noShell) return landingSection;
  return <TenantShell>{landingSection}</TenantShell>;
}
