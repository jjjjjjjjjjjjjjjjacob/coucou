"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
} from "react";
import { BauhausLineField } from "@/components/bauhaus-line-field";
import type { DanzaLandingEvent } from "@/components/danza-event-row";
import { EventPartnerLogos } from "@/components/event-partner-logos";
import { createBauhausEntranceStyle } from "@/lib/bauhaus-entrance";
import {
  BAUHAUS_DISPLAY_COLORS,
  BAUHAUS_PARTNER_LOGO_SOURCES,
  type BauhausEventDisplaySettings,
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
  resolveBauhausEventDisplaySettings,
  splitBauhausHostLines,
} from "@/lib/bauhaus-event-display";
import type { EventPartner } from "@/lib/types";

const DanzaBauhausDisplayContext = createContext<BauhausEventDisplaySettings>(
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
);

type BauhausPageStyle = CSSProperties & {
  "--danza-bauhaus-text": string;
  "--danza-bauhaus-highlight": string;
  "--danza-bauhaus-dot": string;
};

interface DanzaBauhausPageProps {
  children: ReactNode;
  /** Optional deterministic override for previews and isolated component tests. */
  displaySettings?: BauhausEventDisplaySettings;
}

export function DanzaBauhausPage({ children, displaySettings }: DanzaBauhausPageProps) {
  const searchParameters = useSearchParams();
  const resolvedDisplaySettings =
    displaySettings ?? resolveBauhausEventDisplaySettings(searchParameters);
  const pageStyle: BauhausPageStyle = {
    "--danza-bauhaus-text": BAUHAUS_DISPLAY_COLORS[resolvedDisplaySettings.textColor],
    "--danza-bauhaus-highlight": BAUHAUS_DISPLAY_COLORS[resolvedDisplaySettings.highlightColor],
    "--danza-bauhaus-dot": BAUHAUS_DISPLAY_COLORS[resolvedDisplaySettings.dotColor],
  };

  return (
    <div
      className="danza-bauhaus-page"
      data-position={resolvedDisplaySettings.position}
      data-text-color={resolvedDisplaySettings.textColor}
      data-highlight-color={resolvedDisplaySettings.highlightColor}
      data-logo-variant={resolvedDisplaySettings.logoVariant}
      data-dot-color={resolvedDisplaySettings.dotColor}
      data-preset={resolvedDisplaySettings.preset}
      data-info={resolvedDisplaySettings.infoDensity}
      style={pageStyle}
    >
      <BauhausLineField dotColor={resolvedDisplaySettings.dotColor} />
      <DanzaBauhausDisplayContext.Provider value={resolvedDisplaySettings}>
        <div className="danza-bauhaus-page__content">{children}</div>
      </DanzaBauhausDisplayContext.Provider>
    </div>
  );
}

interface DanzaBauhausEventProps {
  event: DanzaLandingEvent;
  sponsors?: EventPartner[];
  partners?: EventPartner[];
  expandedContent?: ReactNode;
  utilitySlot?: ReactNode;
}

export function DanzaBauhausEvent({
  event,
  sponsors,
  partners,
  expandedContent,
  utilitySlot,
}: DanzaBauhausEventProps) {
  const compositionReference = useRef<HTMLDivElement>(null);
  const titleReference = useRef<HTMLHeadingElement>(null);
  const displaySettings = useContext(DanzaBauhausDisplayContext);
  const usesSimplePreset = displaySettings.preset === "simple";
  const showsVerboseInfo = displaySettings.infoDensity === "verbose";
  const titleLines = usesSimplePreset ? [event.title] : splitEventTitle(event.title);
  const hostLines = splitBauhausHostLines(event.hosts ?? []);
  const normalizedLineup = event.lineup.map((lineupEntry) =>
    typeof lineupEntry === "string" ? { label: lineupEntry } : lineupEntry,
  );
  const artistBrandPartners = normalizedLineup.flatMap((lineupEntry) => {
    const normalizedLineupLabel = normalizePartnerLabel(lineupEntry.label);
    const matchingPartner = partners?.find(
      (partner) => normalizePartnerLabel(partner.label) === normalizedLineupLabel,
    );
    return matchingPartner ? [matchingPartner] : [];
  });
  const marketBrandPartner = [...(partners ?? []), ...(sponsors ?? [])].find(
    (partner) => normalizePartnerLabel(partner.label) === "the market",
  );
  const rsvpIsClickable = Boolean(event.rsvpHref && !event.rsvpDisabled);
  let nextEntranceSequenceIndex = titleLines.length;
  const subtitleEntranceSequenceIndex = event.subtitle ? nextEntranceSequenceIndex++ : undefined;
  const lineupEntranceSequenceIndex =
    normalizedLineup.length > 0 ? nextEntranceSequenceIndex++ : undefined;
  const hostEntranceSequenceIndices = showsVerboseInfo
    ? hostLines.map(() => nextEntranceSequenceIndex++)
    : [];
  const sponsorEntranceSequenceIndex =
    showsVerboseInfo && sponsors?.length ? nextEntranceSequenceIndex++ : undefined;
  const dateEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const rsvpEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const utilityEntranceSequenceIndex = utilitySlot ? nextEntranceSequenceIndex++ : undefined;
  const expandedContentEntranceSequenceIndex =
    showsVerboseInfo && expandedContent ? nextEntranceSequenceIndex++ : undefined;
  const showsPartnerBranding = usesSimplePreset
    ? Boolean(marketBrandPartner)
    : Boolean(partners?.length);
  const partnersEntranceSequenceIndex = showsPartnerBranding
    ? nextEntranceSequenceIndex++
    : undefined;

  useLayoutEffect(() => {
    const composition = compositionReference.current;
    const title = titleReference.current;
    if (!composition || !title) return;

    let animationFrameIdentifier: number | undefined;
    const titleLineElements = Array.from(
      title.querySelectorAll<HTMLElement>(".danza-bauhaus-title-line"),
    );
    const updateCompositionWidth = () => {
      const measuredTitleWidth = Math.max(
        0,
        ...titleLineElements.map(
          (titleLineElement) => titleLineElement.getBoundingClientRect().width,
        ),
      );
      if (measuredTitleWidth <= 0) return;

      const viewportInset = window.innerWidth < 768 ? 32 : 48;
      const availableViewportWidth = Math.max(1, window.innerWidth - viewportInset);
      const nextCompositionWidth = Math.min(Math.ceil(measuredTitleWidth), availableViewportWidth);
      composition.style.width = `${nextCompositionWidth}px`;
    };
    const scheduleCompositionWidthUpdate = () => {
      if (animationFrameIdentifier !== undefined) {
        window.cancelAnimationFrame(animationFrameIdentifier);
      }
      animationFrameIdentifier = window.requestAnimationFrame(updateCompositionWidth);
    };

    const titleResizeObserver =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(scheduleCompositionWidthUpdate);
    for (const titleLineElement of titleLineElements) {
      titleResizeObserver?.observe(titleLineElement);
    }
    window.addEventListener("resize", scheduleCompositionWidthUpdate);
    void document.fonts?.ready.then(scheduleCompositionWidthUpdate);
    updateCompositionWidth();

    return () => {
      titleResizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleCompositionWidthUpdate);
      if (animationFrameIdentifier !== undefined) {
        window.cancelAnimationFrame(animationFrameIdentifier);
      }
    };
  }, [event.title]);

  return (
    <section
      className="danza-bauhaus-event"
      aria-label={`${event.title} event`}
      data-testid={`danza-row-${event.id}`}
      data-variant="expanded"
    >
      <div ref={compositionReference} className="danza-bauhaus-event__composition">
        <h1 ref={titleReference} className="danza-bauhaus-event__title">
          {titleLines.map((titleLine, titleLineIndex) => (
            <span
              key={`${titleLine}-${titleLineIndex}`}
              className="danza-bauhaus-highlight danza-bauhaus-title-line danza-bauhaus-enter"
              style={createBauhausEntranceStyle(titleLineIndex)}
            >
              {titleLine}
            </span>
          ))}
        </h1>

        <div className="danza-bauhaus-event__billing">
          {event.subtitle ? (
            <p
              className="danza-bauhaus-copy-line danza-bauhaus-copy-line--subtitle danza-bauhaus-enter"
              style={createBauhausEntranceStyle(subtitleEntranceSequenceIndex ?? 0)}
            >
              <span className="danza-bauhaus-highlight">{event.subtitle}</span>
            </p>
          ) : null}

          {normalizedLineup.length > 0 ? (
            <div
              className="danza-bauhaus-copy-line danza-bauhaus-copy-line--lineup danza-bauhaus-enter"
              aria-label={usesSimplePreset ? "Featured artists" : "Featuring"}
              style={createBauhausEntranceStyle(lineupEntranceSequenceIndex ?? 0)}
            >
              {usesSimplePreset && artistBrandPartners.length > 0 ? (
                <div className="danza-bauhaus-event__artist-brand">
                  <span className="danza-bauhaus-event__brand-eyebrow">Featuring</span>
                  <EventPartnerLogos
                    entries={artistBrandPartners}
                    ariaLabel="Featured artist brands"
                    size="compact"
                    logoSourcesByLabel={BAUHAUS_PARTNER_LOGO_SOURCES[displaySettings.logoVariant]}
                  />
                </div>
              ) : (
                <span className="danza-bauhaus-highlight">
                  {usesSimplePreset ? null : "Featuring · "}
                  {normalizedLineup.map((lineupEntry, lineupIndex) => (
                    <span key={`${lineupEntry.label}-${lineupIndex}`}>
                      {lineupIndex > 0 ? " · " : ""}
                      {lineupEntry.href ? (
                        <a href={lineupEntry.href} target="_blank" rel="noreferrer">
                          {lineupEntry.label}
                        </a>
                      ) : (
                        lineupEntry.label
                      )}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ) : null}

          {showsVerboseInfo && hostLines.length > 0 ? (
            <p
              className="danza-bauhaus-copy-line danza-bauhaus-copy-line--hosts"
              aria-label="Hosted by"
            >
              {hostLines.map((hostLine, hostLineIndex) => (
                <span key={`${hostLine}-${hostLineIndex}`}>
                  {hostLineIndex > 0 ? <br /> : null}
                  <span
                    className="danza-bauhaus-highlight danza-bauhaus-enter"
                    style={createBauhausEntranceStyle(
                      hostEntranceSequenceIndices[hostLineIndex] ?? 0,
                    )}
                  >
                    {hostLineIndex === 0 ? "Hosted by · " : null}
                    {hostLine}
                  </span>
                </span>
              ))}
            </p>
          ) : null}

          {showsVerboseInfo && sponsors?.length ? (
            <p
              className="danza-bauhaus-copy-line danza-bauhaus-copy-line--sponsors danza-bauhaus-enter"
              aria-label="Sponsored by"
              style={createBauhausEntranceStyle(sponsorEntranceSequenceIndex ?? 0)}
            >
              <span className="danza-bauhaus-highlight">
                Sponsored by ·{" "}
                {sponsors.map((sponsor, sponsorIndex) => (
                  <span key={`${sponsor.label}-${sponsorIndex}`}>
                    {sponsorIndex > 0 ? " · " : ""}
                    {sponsor.url ? (
                      <a href={sponsor.url} target="_blank" rel="noreferrer">
                        {sponsor.label}
                      </a>
                    ) : (
                      sponsor.label
                    )}
                  </span>
                ))}
              </span>
            </p>
          ) : null}

          <p
            className="danza-bauhaus-copy-line danza-bauhaus-copy-line--date danza-bauhaus-enter"
            style={createBauhausEntranceStyle(dateEntranceSequenceIndex)}
          >
            <span className="danza-bauhaus-highlight">
              {usesSimplePreset ? (event.compactDate ?? event.date) : event.date}
              {usesSimplePreset && event.location ? <br /> : null}
              {event.location ? (usesSimplePreset ? event.location : ` · ${event.location}`) : ""}
            </span>
          </p>

          <div className="danza-bauhaus-event__actions">
            {rsvpIsClickable ? (
              <Link
                className="danza-bauhaus-event__rsvp danza-bauhaus-enter"
                href={event.rsvpHref ?? "#"}
                data-testid={`rsvp-brick-${event.id}`}
                style={createBauhausEntranceStyle(rsvpEntranceSequenceIndex)}
              >
                {event.rsvpLabel ?? "RSVP"}
              </Link>
            ) : (
              <span
                className="danza-bauhaus-event__rsvp danza-bauhaus-enter"
                aria-disabled="true"
                data-testid={`rsvp-brick-${event.id}`}
                style={createBauhausEntranceStyle(rsvpEntranceSequenceIndex)}
              >
                {event.rsvpLabel ?? "Closed"}
              </span>
            )}
            {utilitySlot ? (
              <span
                className="danza-bauhaus-event__utility danza-bauhaus-enter"
                style={createBauhausEntranceStyle(utilityEntranceSequenceIndex ?? 0)}
              >
                {utilitySlot}
              </span>
            ) : null}
          </div>

          {usesSimplePreset && marketBrandPartner ? (
            <div
              className="danza-bauhaus-event__market-brand danza-bauhaus-enter"
              style={createBauhausEntranceStyle(partnersEntranceSequenceIndex ?? 0)}
            >
              <span className="danza-bauhaus-event__brand-eyebrow">Sponsored by</span>
              <EventPartnerLogos
                entries={[marketBrandPartner]}
                ariaLabel="RSVP presented by The Market"
                size="compact"
                logoSourcesByLabel={BAUHAUS_PARTNER_LOGO_SOURCES[displaySettings.logoVariant]}
              />
            </div>
          ) : null}

          {showsVerboseInfo && expandedContent ? (
            <div
              className="danza-bauhaus-event__expanded danza-bauhaus-enter"
              style={createBauhausEntranceStyle(expandedContentEntranceSequenceIndex ?? 0)}
            >
              <div className="danza-bauhaus-highlight">{expandedContent}</div>
            </div>
          ) : null}

          {!usesSimplePreset && partners?.length ? (
            <div
              className="danza-bauhaus-event__partners danza-bauhaus-enter"
              style={createBauhausEntranceStyle(partnersEntranceSequenceIndex ?? 0)}
            >
              <EventPartnerLogos
                entries={partners}
                ariaLabel="Event partners"
                size="compact"
                logoSourcesByLabel={BAUHAUS_PARTNER_LOGO_SOURCES[displaySettings.logoVariant]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function normalizePartnerLabel(label: string): string {
  return label.trim().toLowerCase();
}

function splitEventTitle(title: string): string[] {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return ["Danza Organica"];

  const titleWords = normalizedTitle.split(/\s+/);
  if (titleWords.length === 1) return [normalizedTitle];
  if (titleWords.length === 2) return titleWords;

  const splitIndex = Math.ceil(titleWords.length / 2);
  return [titleWords.slice(0, splitIndex).join(" "), titleWords.slice(splitIndex).join(" ")];
}
