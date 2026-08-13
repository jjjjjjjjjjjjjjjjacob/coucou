import {
  getDefaultQrDeliveryMessage,
  getDefaultSmsOptInConfirmationMessage,
  getDefaultSmsOptOutConfirmationMessage,
} from "@coucou/sdk/shared/automated-event-messages";
import { formatOrganizerSmsMessage } from "@coucou/sdk/shared/event-branding";
import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMessageTemplateVariables,
  type MessageTemplateVariables,
} from "@/lib/text-blast-message";

const EVENT_MESSAGE_VARIABLES = ["firstName", "eventName", "eventDate", "eventLocation"] as const;

interface SmsSubscriptionTextsSectionProps {
  organizerName: string;
  smsOptInConfirmationMessage: string;
  smsOptOutConfirmationMessage: string;
  onSmsOptInConfirmationMessageChange: (message: string) => void;
  onSmsOptOutConfirmationMessageChange: (message: string) => void;
  previewVariables: MessageTemplateVariables;
}

interface QrDeliveryTextSectionProps {
  qrDeliveryMessage: string;
  onQrDeliveryMessageChange: (message: string) => void;
  previewVariables: MessageTemplateVariables;
}

function MessagePreview({ message }: { message: string }) {
  return (
    <div className="space-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)]/40 p-3">
      <div className="text-xs font-medium text-[var(--text-tertiary)]">Preview</div>
      <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{message}</div>
    </div>
  );
}

export function SmsSubscriptionTextsSection({
  organizerName,
  smsOptInConfirmationMessage,
  smsOptOutConfirmationMessage,
  onSmsOptInConfirmationMessageChange,
  onSmsOptOutConfirmationMessageChange,
  previewVariables,
}: SmsSubscriptionTextsSectionProps) {
  const defaultSmsOptInConfirmationMessage = getDefaultSmsOptInConfirmationMessage(organizerName);
  const defaultSmsOptOutConfirmationMessage = getDefaultSmsOptOutConfirmationMessage(organizerName);
  const smsOptInPreview = formatOrganizerSmsMessage(
    organizerName,
    applyMessageTemplateVariables(
      smsOptInConfirmationMessage.trim()
        ? smsOptInConfirmationMessage
        : defaultSmsOptInConfirmationMessage,
      previewVariables,
    ),
  );
  const smsOptOutPreview = formatOrganizerSmsMessage(
    organizerName,
    applyMessageTemplateVariables(
      smsOptOutConfirmationMessage.trim()
        ? smsOptOutConfirmationMessage
        : defaultSmsOptOutConfirmationMessage,
      previewVariables,
    ),
  );
  return (
    <SectionCard
      title="Subscription status"
      description="Sent when a guest turns event texts on or off. These messages confirm the preference change."
      contentClassName="space-y-5"
    >
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor="sms-opt-in-confirmation-message">Subscribed copy</FieldLabel>
          <Badge variant="outline" className="text-xs text-[var(--text-secondary)]">
            Texts on
          </Badge>
        </div>
        <Textarea
          id="sms-opt-in-confirmation-message"
          rows={4}
          placeholder={defaultSmsOptInConfirmationMessage}
          value={smsOptInConfirmationMessage}
          onChange={(event) => onSmsOptInConfirmationMessageChange(event.target.value)}
        />
        <MessageTemplateVariableButtons
          message={smsOptInConfirmationMessage}
          onMessageChange={onSmsOptInConfirmationMessageChange}
          variableNames={EVENT_MESSAGE_VARIABLES}
        />
        <FieldDescription className="text-xs">
          Leave blank to use the default. Keep message frequency, data-rate, HELP, and STOP details
          in custom opt-in copy.
        </FieldDescription>
        <MessagePreview message={smsOptInPreview} />
      </Field>

      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor="sms-opt-out-confirmation-message">Unsubscribed copy</FieldLabel>
          <Badge variant="outline" className="text-xs text-[var(--text-secondary)]">
            Texts off
          </Badge>
        </div>
        <Textarea
          id="sms-opt-out-confirmation-message"
          rows={3}
          placeholder={defaultSmsOptOutConfirmationMessage}
          value={smsOptOutConfirmationMessage}
          onChange={(event) => onSmsOptOutConfirmationMessageChange(event.target.value)}
        />
        <MessageTemplateVariableButtons
          message={smsOptOutConfirmationMessage}
          onMessageChange={onSmsOptOutConfirmationMessageChange}
          variableNames={EVENT_MESSAGE_VARIABLES}
        />
        <FieldDescription className="text-xs">
          Leave blank to use the default unsubscribe confirmation.
        </FieldDescription>
        <MessagePreview message={smsOptOutPreview} />
      </Field>
    </SectionCard>
  );
}

export function QrDeliveryTextSection({
  qrDeliveryMessage,
  onQrDeliveryMessageChange,
  previewVariables,
}: QrDeliveryTextSectionProps) {
  const defaultQrDeliveryMessage = getDefaultQrDeliveryMessage();
  const qrDeliveryPreview = applyMessageTemplateVariables(
    qrDeliveryMessage.trim() ? qrDeliveryMessage : defaultQrDeliveryMessage,
    previewVariables,
  );

  return (
    <SectionCard
      title="Ticket delivery"
      description="Sent when you deliver deferred QR codes from this event. The generated QR image is attached automatically."
      contentClassName="space-y-4"
    >
      <Field>
        <div className="flex items-center justify-between gap-3">
          <FieldLabel htmlFor="qr-delivery-message">Ticket copy</FieldLabel>
          <Badge variant="outline" className="text-xs text-[var(--text-secondary)]">
            QR attached
          </Badge>
        </div>
        <Textarea
          id="qr-delivery-message"
          rows={3}
          placeholder={defaultQrDeliveryMessage}
          value={qrDeliveryMessage}
          onChange={(event) => onQrDeliveryMessageChange(event.target.value)}
        />
        <MessageTemplateVariableButtons
          message={qrDeliveryMessage}
          onMessageChange={onQrDeliveryMessageChange}
        />
        <FieldDescription className="text-xs">
          Leave blank to use the default. Include {"{{qrCodeUrl}}"} wherever the ticket link should
          appear.
        </FieldDescription>
        <MessagePreview message={qrDeliveryPreview} />
      </Field>
    </SectionCard>
  );
}
