"use client";

import { QrFrame, type TicketDetailRow, useMobile } from "@coucou/ui/tenant-template";
import Link from "next/link";
import { Children, type ReactNode } from "react";
import { createBauhausEntranceStyle } from "@/lib/bauhaus-entrance";

interface DanzaTicketProps {
  backHref: string;
  backLabel?: string;
  eventName: string;
  secondaryTitle?: string | null;
  qrValue: string;
  redemptionCode?: string;
  details?: TicketDetailRow[];
  actions?: ReactNode;
  qrFgColor?: string;
  qrBgColor?: string;
  qrSvgId?: string;
  showQr?: boolean;
  noQrSlot?: ReactNode;
}

export function DanzaTicket({
  backHref,
  backLabel = "Back to event",
  eventName,
  secondaryTitle,
  qrValue,
  redemptionCode,
  details,
  actions,
  qrFgColor,
  qrBgColor,
  qrSvgId,
  showQr = true,
  noQrSlot,
}: DanzaTicketProps) {
  const isMobile = useMobile();
  const actionItems = Children.toArray(actions);
  let nextEntranceSequenceIndex = 0;
  const ticketLabelEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const backLinkEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const eventNameEntranceSequenceIndex = nextEntranceSequenceIndex++;
  const secondaryTitleEntranceSequenceIndex = secondaryTitle
    ? nextEntranceSequenceIndex++
    : undefined;
  const sectionLabelEntranceSequenceIndex = showQr ? nextEntranceSequenceIndex++ : undefined;
  const qrEntranceSequenceIndex = showQr ? nextEntranceSequenceIndex++ : undefined;
  const redemptionCodeEntranceSequenceIndex =
    showQr && redemptionCode ? nextEntranceSequenceIndex++ : undefined;
  const doorCopyEntranceSequenceIndex = showQr ? nextEntranceSequenceIndex++ : undefined;
  const noQrSlotEntranceSequenceIndex =
    !showQr && noQrSlot ? nextEntranceSequenceIndex++ : undefined;
  const admissionDividerEntranceSequenceIndex =
    sectionLabelEntranceSequenceIndex ?? noQrSlotEntranceSequenceIndex ?? nextEntranceSequenceIndex;
  const actionEntranceSequenceIndices = actionItems.map(() => nextEntranceSequenceIndex++);
  const detailEntranceSequenceIndices = (details ?? []).map(() => nextEntranceSequenceIndex++);

  return (
    <section className="danza-ticket" aria-labelledby="danza-ticket-title">
      <div className="danza-ticket__utility">
        <span
          className="danza-bauhaus-enter"
          style={createBauhausEntranceStyle(ticketLabelEntranceSequenceIndex)}
        >
          Ticket
        </span>
        <Link
          className="danza-bauhaus-enter"
          href={backHref}
          style={createBauhausEntranceStyle(backLinkEntranceSequenceIndex)}
        >
          ← {backLabel}
        </Link>
      </div>

      <header className="danza-ticket__header">
        <h1
          id="danza-ticket-title"
          className="danza-bauhaus-enter"
          style={createBauhausEntranceStyle(eventNameEntranceSequenceIndex)}
        >
          {eventName}
        </h1>
        {secondaryTitle ? (
          <p
            className="danza-ticket__subtitle danza-bauhaus-enter"
            style={createBauhausEntranceStyle(secondaryTitleEntranceSequenceIndex ?? 0)}
          >
            {secondaryTitle}
          </p>
        ) : null}
      </header>

      <div
        className="danza-ticket__admission danza-bauhaus-rule-enter"
        style={createBauhausEntranceStyle(admissionDividerEntranceSequenceIndex)}
      >
        {showQr ? (
          <>
            <p
              className="danza-ticket__section-label danza-bauhaus-enter"
              style={createBauhausEntranceStyle(sectionLabelEntranceSequenceIndex ?? 0)}
            >
              Your QR code
            </p>
            <div
              className="danza-ticket__qr danza-bauhaus-enter"
              style={createBauhausEntranceStyle(qrEntranceSequenceIndex ?? 0)}
            >
              <QrFrame
                id={qrSvgId}
                value={qrValue}
                size={isMobile ? 210 : 250}
                fgColor={qrFgColor}
                bgColor={qrBgColor}
              />
            </div>
            {redemptionCode ? (
              <p
                className="danza-ticket__code danza-bauhaus-enter"
                style={createBauhausEntranceStyle(redemptionCodeEntranceSequenceIndex ?? 0)}
              >
                {redemptionCode}
              </p>
            ) : null}
            <p
              className="danza-ticket__door-copy danza-bauhaus-enter"
              style={createBauhausEntranceStyle(doorCopyEntranceSequenceIndex ?? 0)}
            >
              Show this at the door.
            </p>
          </>
        ) : noQrSlot ? (
          <div
            className="danza-ticket__no-qr danza-bauhaus-enter"
            style={createBauhausEntranceStyle(noQrSlotEntranceSequenceIndex ?? 0)}
          >
            {noQrSlot}
          </div>
        ) : null}
        {actionItems.length > 0 ? (
          <div className="danza-ticket__actions">
            {actionItems.map((actionItem, actionItemIndex) => (
              <div
                className="danza-ticket__action-item danza-bauhaus-enter"
                key={`ticket-action-${actionItemIndex}`}
                style={createBauhausEntranceStyle(
                  actionEntranceSequenceIndices[actionItemIndex] ?? 0,
                )}
              >
                {actionItem}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {details?.length ? (
        <dl className="danza-ticket__details">
          {details.map((detail, detailIndex) => (
            <div
              className="danza-bauhaus-enter danza-bauhaus-rule-enter"
              key={`${detail.label}-${detailIndex}`}
              style={createBauhausEntranceStyle(detailEntranceSequenceIndices[detailIndex] ?? 0)}
            >
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
