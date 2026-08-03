import { formatOrganizerSmsMessage } from "@coucou/sdk/shared/event-branding";
import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import { Field, FieldDescription, FieldLabel, FieldSwitchRow } from "@/components/ui/field";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMessageTemplateVariables,
  type MessageTemplateVariables,
} from "@/lib/text-blast-message";
import { cn } from "@/lib/utils";

export interface RsvpConfirmationTextSectionProps {
  organizerName: string;
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
  organizerName,
  rsvpConfirmationMessageEnabled,
  rsvpConfirmationMessage,
  defaultRsvpConfirmationMessage,
  onEnabledChange,
  onMessageChange,
  previewVariables,
  className,
}: RsvpConfirmationTextSectionProps) {
  const previewMessage = formatOrganizerSmsMessage(
    organizerName,
    applyMessageTemplateVariables(
      rsvpConfirmationMessage.trim() ? rsvpConfirmationMessage : defaultRsvpConfirmationMessage,
      previewVariables,
    ),
  );

  return (
    <SectionCard
      title="Initial RSVP confirmation"
      description="Sent after a guest submits a pending RSVP and has permission to receive texts."
      className={className}
      contentClassName="space-y-4"
    >
      <FieldSwitchRow
        title="Send initial confirmation text"
        description="Turn this off when guests already know what will happen next."
        checked={rsvpConfirmationMessageEnabled}
        onCheckedChange={onEnabledChange}
        switchId="rsvp-confirmation-message-enabled"
      />

      <Field className={cn(!rsvpConfirmationMessageEnabled && "opacity-50")}>
        <FieldLabel htmlFor="rsvp-confirmation-message">Confirmation copy</FieldLabel>
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
        <FieldDescription className="text-xs">
          Leave blank to use the default confirmation for this event.
        </FieldDescription>
      </Field>

      <div className="space-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-3">
        <div className="text-xs font-medium text-[var(--text-tertiary)]">Preview</div>
        {rsvpConfirmationMessageEnabled ? (
          <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
            {previewMessage}
          </div>
        ) : (
          <div className="text-sm text-[var(--text-secondary)]">
            No initial confirmation text will send.
          </div>
        )}
      </div>
    </SectionCard>
  );
}
