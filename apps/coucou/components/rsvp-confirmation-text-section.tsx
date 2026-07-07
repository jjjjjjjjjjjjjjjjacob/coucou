import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMessageTemplateVariables,
  type MessageTemplateVariables,
} from "@/lib/text-blast-message";
import { cn } from "@/lib/utils";

export interface RsvpConfirmationTextSectionProps {
  rsvpConfirmationMessageEnabled: boolean;
  rsvpConfirmationMessage: string;
  defaultRsvpConfirmationMessage: string;
  onEnabledChange: (rsvpConfirmationMessageEnabled: boolean) => void;
  onMessageChange: (rsvpConfirmationMessage: string) => void;
  previewVariables: MessageTemplateVariables;
  className?: string;
}

const RSVP_CONFIRMATION_VARIABLES = [
  "firstName",
  "eventName",
  "eventDate",
  "eventLocation",
] as const;

export function RsvpConfirmationTextSection({
  rsvpConfirmationMessageEnabled,
  rsvpConfirmationMessage,
  defaultRsvpConfirmationMessage,
  onEnabledChange,
  onMessageChange,
  previewVariables,
  className,
}: RsvpConfirmationTextSectionProps) {
  const previewMessage = applyMessageTemplateVariables(
    rsvpConfirmationMessage.trim() ? rsvpConfirmationMessage : defaultRsvpConfirmationMessage,
    previewVariables,
  );

  return (
    <div className={cn("space-y-4 rounded-lg border bg-card p-4", className)}>
      <div className="space-y-1">
        <h3 className="font-medium text-sm text-muted-foreground">INITIAL CONFIRMATION TEXT</h3>
        <p className="text-sm text-muted-foreground">
          Sent after a guest submits an RSVP by replying to a text blast.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded border border-border/60 p-3">
        <Checkbox
          id="rsvp-confirmation-message-enabled"
          aria-label="Send initial confirmation text"
          checked={rsvpConfirmationMessageEnabled}
          onCheckedChange={(checked) => onEnabledChange(checked === true)}
          className="mt-0.5"
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium">Send initial confirmation text</span>
          <span className="block text-xs text-muted-foreground">
            Turn this off when the text blast copy already tells guests what will happen next.
          </span>
        </span>
      </label>

      <div className={cn("space-y-2", !rsvpConfirmationMessageEnabled && "opacity-50")}>
        <label
          htmlFor="rsvp-confirmation-message"
          className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
        >
          Confirmation copy
        </label>
        <Textarea
          id="rsvp-confirmation-message"
          rows={3}
          disabled={!rsvpConfirmationMessageEnabled}
          placeholder={`${defaultRsvpConfirmationMessage} Use {{firstName}}, {{eventName}}, {{eventDate}}, or {{eventLocation}}.`}
          value={rsvpConfirmationMessage}
          onChange={(event) => onMessageChange(event.target.value)}
        />
        {rsvpConfirmationMessageEnabled ? (
          <MessageTemplateVariableButtons
            message={rsvpConfirmationMessage}
            onMessageChange={onMessageChange}
            variableNames={RSVP_CONFIRMATION_VARIABLES}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          Leave blank to use the default confirmation for this event.
        </p>
      </div>

      <div className="space-y-1 rounded-md border border-border/70 bg-background p-3">
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Preview</div>
        {rsvpConfirmationMessageEnabled ? (
          <div className="whitespace-pre-wrap text-sm">{previewMessage}</div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No initial confirmation text will send.
          </div>
        )}
      </div>
    </div>
  );
}
