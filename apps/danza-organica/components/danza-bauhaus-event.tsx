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
  BAUHAUS_PARTNER_LOGO_SOURCES,
  type BauhausEventLogoVariant,
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
  resolveBauhausEventDisplaySettings,
  splitBauhausHostLines,
} from "@/lib/bauhaus-event-display";
import type { EventPartner } from "@/lib/types";

const DISPLAY_COLORS = {
  black: "#0A0A0A",
  teal: "#17E1E5",
  white: "#FFFFFF",
} as const;

const DanzaPartnerLogoVariantContext = createContext<BauhausEventLogoVariant>(
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.logoVariant,
);

type BauhausPageStyle = CSSProperties & {
  "--danza-bauhaus-text": string;
  "--danza-bauhaus-highlight": string;
};

interface DanzaBauhausPageProps {
  children: ReactNode;
}

export function DanzaBauhausPage({ children }: DanzaBauhausPageProps) {
  const searchParameters = useSearchParams();
  const displaySettings = resolveBauhausEventDisplaySettings(searchParameters);
  const pageStyle: BauhausPageStyle = {
    "--danza-bauhaus-text": DISPLAY_COLORS[displaySettings.textColor],
    "--danza-bauhaus-highlight": DISPLAY_COLORS[displaySettings.highlightColor],
  };

  return (
    <div
      className="danza-bauhaus-page"
      data-position={displaySettings.position}
      data-text-color={displaySettings.textColor}
      data-highlight-color={displaySettings.highlightColor}
      data-logo-variant={displaySettings.logoVariant}
      style={pageStyle}
    >
      <BauhausLineField />
      <DanzaPartnerLogoVariantContext.Provider value={displaySettings.logoVariant}>
        <div className="danza-bauhaus-page__content">{children}</div>
      </DanzaPartnerLogoVariantContext.Provider>
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
  const logoVariant = useContext(DanzaPartnerLogoVariantContext);
  const titleLines = splitEventTitle(event.title);
  const hostLines = splitBauhausHostLines(event.hosts ?? []);
  const normalizedLineup = event.lineup.map((lineupEntry) =>
    typeof lineupEntry === "string" ? { label: lineupEntry } : lineupEntry,
  );
  const rsvpIsClickable = Boolean(event.rsvpHref && !event.rsvpDisabled);
  let nextEntranceSequenceIndex = titleLines.length;
  const subtitleEntranceSequenceIndex = event.subtitle ? nextEntranceSequenceIndex++ : undefined;
  const lineupEntranceSequenceIndex =
    normalizedLineup.length > 0 ? nextEntranceSequenceIndex++ : undefined;
  const hostEntranceSequenceIndices = hostLines.map(() => nextEntranceSequenceIndex++);
  const sponsorEntranceSequenceIndex = sponsors?.length ? nextEntranceSequenceIndex++ : undefined;
  const dateEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const rsvpEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const utilityEntranceSequenceIndex = utilitySlot ? nextEntranceSequenceIndex++ : undefined;
  const expandedContentEntranceSequenceIndex = expandedContent
    ? nextEntranceSequenceIndex++
    : undefined;
  const partnersEntranceSequenceIndex = partners?.length ? nextEntranceSequenceIndex++ : undefined;

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
              className="danza-bauhaus-copy-line danza-bauhaus-enter"
              style={createBauhausEntranceStyle(subtitleEntranceSequenceIndex ?? 0)}
            >
              <span className="danza-bauhaus-highlight">{event.subtitle}</span>
            </p>
          ) : null}

          {normalizedLineup.length > 0 ? (
            <p
              className="danza-bauhaus-copy-line danza-bauhaus-enter"
              aria-label="Featuring"
              style={createBauhausEntranceStyle(lineupEntranceSequenceIndex ?? 0)}
            >
              <span className="danza-bauhaus-highlight">
                Featuring ·{" "}
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
            </p>
          ) : null}

          {hostLines.length > 0 ? (
            <p className="danza-bauhaus-copy-line" aria-label="Hosted by">
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

          {sponsors?.length ? (
            <p
              className="danza-bauhaus-copy-line danza-bauhaus-enter"
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
              {event.date}
              {event.location ? ` · ${event.location}` : ""}
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

          {expandedContent ? (
            <div
              className="danza-bauhaus-event__expanded danza-bauhaus-enter"
              style={createBauhausEntranceStyle(expandedContentEntranceSequenceIndex ?? 0)}
            >
              <div className="danza-bauhaus-highlight">{expandedContent}</div>
            </div>
          ) : null}

          {partners?.length ? (
            <div
              className="danza-bauhaus-event__partners danza-bauhaus-enter"
              style={createBauhausEntranceStyle(partnersEntranceSequenceIndex ?? 0)}
            >
              <EventPartnerLogos
                entries={partners}
                ariaLabel="Event partners"
                size="compact"
                logoSourcesByLabel={BAUHAUS_PARTNER_LOGO_SOURCES[logoVariant]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
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
