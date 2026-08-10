import type { CSSProperties } from "react";
import { EventPartnerLogos } from "@/components/event-partner-logos";
import { EventSponsorNames } from "@/components/event-sponsor-names";
import type { EventPartner } from "@/lib/types";

const detailLabelStyle: CSSProperties = {
  fontFamily: "var(--tt-text)",
  fontSize: 11,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--tt-fg-mute)",
};

const detailBodyStyle: CSSProperties = {
  fontFamily: "var(--tt-text)",
  fontSize: 12,
  letterSpacing: "0.04em",
  color: "var(--tt-fg-dim)",
};

interface DanzaSponsorCreditProps {
  sponsors: EventPartner[];
}

export function DanzaSponsorCredit({ sponsors }: DanzaSponsorCreditProps) {
  return (
    <div
      aria-label="Sponsored by"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 9,
        width: "100%",
      }}
    >
      <span
        style={{
          ...detailLabelStyle,
          fontSize: 8,
          letterSpacing: "0.16em",
        }}
      >
        Sponsored by
      </span>
      <EventSponsorNames entries={sponsors} />
    </div>
  );
}

interface DanzaPresentationDetailsProps {
  productionCompany?: string;
  description?: string;
}

export function DanzaPresentationDetails({
  productionCompany,
  description,
}: DanzaPresentationDetailsProps) {
  return (
    <div className="flex flex-col gap-5">
      {productionCompany ? (
        <dl className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: "min-content 1fr" }}>
          <dt style={detailLabelStyle}>Presented by</dt>
          <dd style={detailBodyStyle}>{productionCompany}</dd>
        </dl>
      ) : null}

      {description ? (
        <p
          className="m-0 max-w-[540px] text-pretty"
          style={{
            fontSize: 13,
            lineHeight: 1.65,
            color: "var(--tt-fg-dim)",
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

interface DanzaPartnerWordmarksProps {
  partners: EventPartner[];
}

export function DanzaPartnerWordmarks({ partners }: DanzaPartnerWordmarksProps) {
  return <EventPartnerLogos entries={partners} ariaLabel="Event partners" />;
}
