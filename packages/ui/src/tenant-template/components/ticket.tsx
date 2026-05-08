"use client";

import type { ReactNode } from "react";
import { useMobile } from "../use-mobile";
import { usePreset } from "../use-preset";
import { Eyebrow } from "./primitives/eyebrow";
import { QrFrame } from "./primitives/qr-frame";
import { TenantShell } from "./tenant-shell";

export interface TicketDetailRow {
  label: string;
  value: ReactNode;
}

export interface TicketProps {
  eventName: string;
  secondaryTitle?: string | null;
  whenLabel?: string | null;
  whereLabel?: string | null;
  /**
   * The encoded value for the QR — typically a redemption URL.
   */
  qrValue: string;
  /**
   * The human-readable redemption code. Rendered under the QR in mono.
   */
  redemptionCode?: string;
  /**
   * Detail rows shown under the QR ("Tier", "Door", "Plus-one").
   */
  details?: TicketDetailRow[];
  /**
   * Slot for download/wallet action buttons.
   */
  actions?: ReactNode;
  /**
   * Override the QR foreground/background. If unset, falls back to the
   * resolved preset's qrFg/qrBg (which already pick up per-event overrides).
   */
  qrFgColor?: string;
  qrBgColor?: string;
  /**
   * Optional id forwarded to the underlying SVG so download-as-PNG helpers
   * can locate it.
   */
  qrSvgId?: string;
  /**
   * Page-level brand copy (footer contact).
   */
  footerContact?: string;
  /**
   * When false, omits the QR section. Use for guest lists where the door
   * verifies by name rather than by code (e.g. GA lists).
   */
  showQr?: boolean;
  /**
   * Replaces the QR section when showQr === false. Useful for door
   * instructions like "Show ID at the door" or list-key confirmation pills.
   */
  noQrSlot?: ReactNode;
  /**
   * When true, skip the inner `TenantShell` wrapper. Use when the parent
   * already provides a viewport-owning shell (e.g. `ChlorineSplitShell`).
   */
  noShell?: boolean;
  /**
   * Optional eyebrow label rendered at the very top of the ticket section.
   * Often used together with `eyebrowTrailing` to expose a back-link pill.
   */
  eyebrow?: string;
  /**
   * Optional trailing slot beside the eyebrow (typically an `EyebrowPill`).
   */
  eyebrowTrailing?: ReactNode;
}

export function Ticket({
  eventName,
  secondaryTitle,
  whenLabel,
  whereLabel,
  qrValue,
  redemptionCode,
  details,
  actions,
  qrFgColor,
  qrBgColor,
  qrSvgId,
  showQr = true,
  noQrSlot,
  noShell = false,
  eyebrow,
  eyebrowTrailing,
}: TicketProps) {
  const { preset, presetKey } = usePreset();
  const isMobile = useMobile();

  const sectionPadding = noShell ? 0 : isMobile ? "60px 0 48px" : "80px 0";
  const showEyebrow = Boolean(eyebrow || eyebrowTrailing);
  const ticketSection = (
    <section className="text-center" style={{ padding: sectionPadding }}>
      {showEyebrow ? (
        <Eyebrow className="text-left" trailing={eyebrowTrailing}>
          {eyebrow ? (preset.upper ? eyebrow.toUpperCase() : eyebrow) : ""}
        </Eyebrow>
      ) : null}
      <div className="mb-5">
        <h2
          className="m-0 mb-2 text-center"
          style={{
            fontFamily: "var(--tt-display)",
            fontWeight: presetKey === "dojo" ? 700 : 400,
            fontSize: isMobile ? 22 : 26,
            lineHeight: 1.3,
            color: "var(--tt-fg)",
          }}
        >
          {preset.upper ? eventName.toUpperCase() : eventName}
        </h2>
        {secondaryTitle ? (
          <div
            style={{
              fontSize: 18,
              color: "var(--tt-fg-dim)",
              fontFamily: "var(--tt-display)",
            }}
          >
            {preset.upper ? secondaryTitle.toUpperCase() : secondaryTitle}
          </div>
        ) : null}
        {whenLabel || whereLabel ? (
          <div className="mt-3 text-[13px]" style={{ color: "var(--tt-fg-dim)" }}>
            {[whenLabel, whereLabel].filter(Boolean).join(" · ")}
          </div>
        ) : null}
      </div>

      <div
        className="flex flex-col items-center gap-4 border-y"
        style={{
          padding: "40px 24px",
          borderTopColor: "var(--tt-rule)",
          borderBottomColor: "var(--tt-rule)",
        }}
      >
        {showQr ? (
          <>
            <div
              className="text-[11px] uppercase tracking-[0.08em]"
              style={{ color: "var(--tt-fg-mute)" }}
            >
              Your QR Code
            </div>
            <QrFrame
              id={qrSvgId}
              value={qrValue}
              size={isMobile ? 220 : 240}
              fgColor={qrFgColor}
              bgColor={qrBgColor}
            />
            {redemptionCode ? (
              <div
                style={{
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  fontSize: 12,
                  color: "var(--tt-fg-dim)",
                  letterSpacing: "0.1em",
                }}
              >
                {redemptionCode}
              </div>
            ) : null}
            <div
              style={{
                fontSize: 13,
                color: "var(--tt-fg)",
                marginTop: 4,
              }}
            >
              Show this at the door.
            </div>
            {actions ? (
              <div className="mt-2 flex flex-wrap justify-center gap-4">{actions}</div>
            ) : null}
          </>
        ) : (
          noQrSlot
        )}
      </div>

      {details && details.length > 0 ? (
        <div className="mx-auto mt-12 max-w-[420px] text-left" style={{ padding: "0 24px" }}>
          {details.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              className="grid items-baseline border-b py-3 text-[13px]"
              style={{
                gridTemplateColumns: "100px 1fr",
                borderBottomColor: "var(--tt-rule)",
              }}
            >
              <span
                className="text-[11px] uppercase tracking-[0.04em]"
                style={{ color: "var(--tt-fg-mute)" }}
              >
                {row.label}
              </span>
              <span style={{ color: "var(--tt-fg)" }}>{row.value}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );

  if (noShell) return ticketSection;
  return <TenantShell>{ticketSection}</TenantShell>;
}
