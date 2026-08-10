"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { CSSProperties } from "react";
import type { EventPartner } from "@/lib/types";

interface EventPartnerLogosProps {
  entries?: EventPartner[];
  ariaLabel: string;
  size?: "standard" | "compact" | "rsvp";
  logoSourcesByLabel?: Readonly<Record<string, string>>;
}

export function EventPartnerLogos({
  entries,
  ariaLabel,
  size = "standard",
  logoSourcesByLabel,
}: EventPartnerLogosProps) {
  if (!entries?.length) return null;

  return (
    <div
      aria-label={ariaLabel}
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: size === "standard" ? "20px 30px" : "16px 22px",
        width: "100%",
      }}
    >
      {entries.map((entry, entryIndex) => (
        <EventPartnerLogo
          key={`${entry.label}-${entry.logoStorageId}-${entryIndex}`}
          entry={entry}
          size={size}
          preferredLogoSource={logoSourcesByLabel?.[entry.label.trim().toLowerCase()]}
        />
      ))}
    </div>
  );
}

interface EventPartnerLogoProps {
  entry: EventPartner;
  size: "standard" | "compact" | "rsvp";
  preferredLogoSource?: string;
}

function EventPartnerLogo({ entry, size, preferredLogoSource }: EventPartnerLogoProps) {
  const logoResponse = useQuery(api.files.getUrl, {
    storageId: entry.logoStorageId as Id<"_storage">,
  });
  const logoUrl = preferredLogoSource ?? logoResponse?.url;
  const isNothingRadioWordmark = entry.label.trim().toLowerCase() === "nothing radio";
  const marketLogoMetrics =
    size === "rsvp"
      ? { maxWidth: 196, height: 54 }
      : size === "compact"
        ? { maxWidth: 132, height: 34 }
        : { maxWidth: 164, height: 42 };
  const nothingRadioLogoMetrics =
    size === "standard" ? { maxWidth: 224, height: 76 } : { maxWidth: 176, height: 58 };
  const logoMetrics = isNothingRadioWordmark ? nothingRadioLogoMetrics : marketLogoMetrics;
  const logoStyle: CSSProperties = {
    display: "block",
    width: "auto",
    maxWidth: logoMetrics.maxWidth,
    height: logoMetrics.height,
    objectFit: "contain",
  };
  const logoContent = logoUrl ? (
    <img src={logoUrl} alt={entry.label} style={logoStyle} />
  ) : (
    <span
      aria-label={entry.label}
      style={{
        minWidth: size === "standard" ? 112 : 88,
        height: size === "standard" ? 36 : 28,
        borderRadius: 999,
        background: "color-mix(in srgb, var(--tt-fg) 10%, transparent)",
      }}
    />
  );

  if (!entry.url) {
    return <span style={{ display: "inline-flex", alignItems: "center" }}>{logoContent}</span>;
  }

  return (
    <a
      href={entry.url}
      target="_blank"
      rel="noreferrer"
      aria-label={entry.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 3,
        outlineColor: "var(--tt-fg)",
        outlineOffset: 5,
      }}
    >
      {logoContent}
    </a>
  );
}
