import { Fragment } from "react";
import type { EventPartner } from "@/lib/types";

interface EventSponsorNamesProps {
  entries: EventPartner[];
}

/** Danza's sponsor credit is typographic; sponsor logos remain partner-row assets. */
export function EventSponsorNames({ entries }: EventSponsorNamesProps) {
  return (
    <div
      aria-label="Event sponsors"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontFamily: "var(--tt-text)",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.02em",
        color: "var(--tt-fg)",
      }}
    >
      {entries.map((entry, entryIndex) => (
        <Fragment key={`${entry.label}-${entry.logoStorageId}-${entryIndex}`}>
          {entryIndex > 0 ? <span aria-hidden="true">·</span> : null}
          {entry.url ? (
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              aria-label={entry.label}
              style={{
                color: "inherit",
                textDecoration: "none",
                outlineColor: "var(--tt-fg)",
                outlineOffset: 4,
              }}
            >
              {entry.label}
            </a>
          ) : (
            <span>{entry.label}</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}
