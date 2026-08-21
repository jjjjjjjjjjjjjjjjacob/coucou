import { AlertCircle, CheckCircle2, Clock, Info, QrCode } from "lucide-react";
import type {
  SmsConversationDirection,
  SmsConversationKind,
  SmsConversationMessage,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function formatConversationFullTimestamp(timestamp: number | undefined): string {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatConversationKindLabel(kind: SmsConversationKind | undefined): string {
  switch (kind) {
    case "manual":
      return "Manual";
    case "blast":
      return "Blast";
    case "approval":
      return "Approval";
    case "consent":
      return "Consent";
    case "reply_action":
      return "Reply action";
    case "opt_out":
      return "Opt-out";
    case "help":
      return "Help";
    case "delivery_status":
      return "Delivery";
    case "system":
      return "System";
    case "sms":
    default:
      return "SMS";
  }
}

function getConversationDirectionLabel(direction: SmsConversationDirection | undefined): string {
  switch (direction) {
    case "inbound":
      return "Inbound";
    case "outbound":
      return "Outbound";
    case "system":
      return "System";
    default:
      return "Message";
  }
}

function getProviderStatusIcon(providerStatus: string) {
  switch (providerStatus) {
    case "sent":
    case "delivered":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "failed":
    case "undelivered":
      return <AlertCircle className="h-3.5 w-3.5" />;
    case "pending":
    case "queued":
    case "accepted":
      return <Clock className="h-3.5 w-3.5" />;
    default:
      return <Info className="h-3.5 w-3.5" />;
  }
}

export function SmsConversationMessageBubble({ message }: { message: SmsConversationMessage }) {
  if (message.direction === "system") {
    return (
      <div className="flex justify-center">
        <div className="max-w-[88%] rounded-md border border-border bg-secondary/40 px-3 py-2 text-center text-xs text-muted-foreground">
          <div>{message.body || formatConversationKindLabel(message.kind)}</div>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px]">
            <span>{formatConversationFullTimestamp(message.createdAt)}</span>
            {message.providerStatus ? <span>{message.providerStatus}</span> : null}
          </div>
        </div>
      </div>
    );
  }

  const isOutbound = message.direction === "outbound";
  const hasErrorDetails = Boolean(
    message.errorMessage || message.errorCode || message.errorDetails || message.errorStack,
  );
  return (
    <div className={cn("flex", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-lg border px-4 py-3 shadow-sm",
          isOutbound
            ? "border-primary/20 bg-primary text-primary-foreground"
            : "border-border bg-card text-foreground",
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.body || "Media message"}
        </div>
        {message.mediaUrls && message.mediaUrls.length > 0 ? (
          <div className="mt-3 grid gap-2">
            {message.mediaUrls.map((mediaUrl) => (
              <a
                key={mediaUrl}
                href={mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="truncate rounded border border-border bg-background px-2 py-1 text-xs text-foreground underline-offset-2 hover:underline"
              >
                {mediaUrl}
              </a>
            ))}
          </div>
        ) : null}
        <div
          className={cn(
            "mt-2 flex flex-wrap items-center gap-2 text-[11px]",
            isOutbound ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          <span>{getConversationDirectionLabel(message.direction)}</span>
          <span>{formatConversationKindLabel(message.kind)}</span>
          {message.qrCodeSent ? (
            <span className="inline-flex items-center gap-1 font-medium">
              <QrCode className="h-3.5 w-3.5" />
              QR sent
            </span>
          ) : null}
          <span>{formatConversationFullTimestamp(message.createdAt)}</span>
          {message.providerStatus ? (
            <span className="inline-flex items-center gap-1">
              {getProviderStatusIcon(message.providerStatus)}
              {message.providerStatus}
            </span>
          ) : null}
          {message.providerMessageId ? (
            <span className="max-w-[12rem] truncate">id: {message.providerMessageId}</span>
          ) : null}
        </div>
        {hasErrorDetails ? (
          <details
            className={cn(
              "mt-3 rounded-md text-xs",
              isOutbound
                ? "bg-black/15 text-primary-foreground"
                : "bg-[var(--status-denied-bg)] text-[var(--status-denied)]",
            )}
          >
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 px-3 py-2 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Delivery error details
            </summary>
            <div className="space-y-2 px-3 pb-3">
              {message.errorMessage ? (
                <p className="whitespace-pre-wrap">{message.errorMessage}</p>
              ) : null}
              {message.errorCode ? <p>Code: {message.errorCode}</p> : null}
              {message.errorDetails ? (
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
                  {message.errorDetails}
                </pre>
              ) : null}
              {message.errorStack ? (
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">
                  {message.errorStack}
                </pre>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
