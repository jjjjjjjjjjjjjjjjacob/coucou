import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldSwitchRow, FieldTitle } from "@/components/ui/field";
import { SectionCard } from "@/components/ui/section-card";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMessageTemplateVariables,
  type MessageTemplateVariables,
  messageContainsQrCodeUrlVariable,
} from "@/lib/text-blast-message";

export interface ListConfirmationTextRow {
  listKey: string;
  approvalMessage: string;
}

export interface ListConfirmationTextsSectionProps<ListRow extends ListConfirmationTextRow> {
  lists: ListRow[];
  defaultApprovalMessage: string;
  onApprovalMessageChange: (listIndex: number, approvalMessage: string) => void;
  resolveQrAttachmentEnabled?: (list: ListRow, listIndex: number) => boolean;
  onQrAttachmentChange?: (listIndex: number, qrAttachmentEnabled: boolean) => void;
  resolveTicketLinkEnabled?: (list: ListRow, listIndex: number) => boolean;
  onTicketLinkChange?: (listIndex: number, ticketLinkEnabled: boolean) => void;
  previewVariables?: MessageTemplateVariables;
  className?: string;
}

const DEFAULT_PREVIEW_VARIABLES: MessageTemplateVariables = {
  firstName: "John",
  eventName: "Sample Event",
  eventDate: "12.31.2024",
  eventLocation: "Sample Location",
  qrCodeUrl: "https://example.com/ticket",
};

export function ListConfirmationTextsSection<ListRow extends ListConfirmationTextRow>({
  lists,
  defaultApprovalMessage,
  onApprovalMessageChange,
  resolveQrAttachmentEnabled,
  onQrAttachmentChange,
  resolveTicketLinkEnabled,
  onTicketLinkChange,
  previewVariables = DEFAULT_PREVIEW_VARIABLES,
  className,
}: ListConfirmationTextsSectionProps<ListRow>) {
  const namedLists = lists
    .map((list, listIndex) => ({ list, listIndex }))
    .filter(({ list }) => list.listKey.trim().length > 0);

  return (
    <SectionCard
      title="Approval messages by list"
      description="Customize the approval SMS guests receive after being approved from each list."
      className={className}
    >
      {namedLists.length > 0 ? (
        <div className="space-y-3">
          {namedLists.map(({ list, listIndex }) => {
            const trimmedListKey = list.listKey.trim();
            const qrAttachmentControlsEnabled = Boolean(
              resolveQrAttachmentEnabled && onQrAttachmentChange,
            );
            const qrAttachmentEnabled = resolveQrAttachmentEnabled?.(list, listIndex) ?? false;
            const ticketLinkControlsEnabled = Boolean(
              resolveTicketLinkEnabled && onTicketLinkChange,
            );
            const ticketLinkEnabled = resolveTicketLinkEnabled?.(list, listIndex) ?? false;
            const approvalMessageTemplate = list.approvalMessage.trim()
              ? list.approvalMessage
              : defaultApprovalMessage;
            const approvalMessagePreview = applyMessageTemplateVariables(approvalMessageTemplate, {
              ...previewVariables,
              qrCodeUrl: ticketLinkEnabled ? previewVariables.qrCodeUrl : "",
            });
            const ticketLinkPreviewFooter =
              ticketLinkControlsEnabled &&
              ticketLinkEnabled &&
              !messageContainsQrCodeUrlVariable(approvalMessageTemplate)
                ? `\n\nView your ticket here: ${previewVariables.qrCodeUrl ?? ""}`
                : "";
            return (
              <div
                key={`${trimmedListKey}-${listIndex}`}
                className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <FieldTitle>
                    <label htmlFor={`list-confirmation-text-${listIndex}`}>{trimmedListKey}</label>
                  </FieldTitle>
                  <Badge variant="outline" className="text-xs text-[var(--text-secondary)]">
                    Approval SMS
                  </Badge>
                </div>
                <Field>
                  <Textarea
                    id={`list-confirmation-text-${listIndex}`}
                    rows={3}
                    placeholder={`${defaultApprovalMessage} Use {{firstName}}, {{eventName}}, {{eventDate}}, {{eventLocation}}, or {{qrCodeUrl}}.`}
                    value={list.approvalMessage}
                    onChange={(event) => onApprovalMessageChange(listIndex, event.target.value)}
                  />
                  <MessageTemplateVariableButtons
                    message={list.approvalMessage}
                    onMessageChange={(approvalMessage) =>
                      onApprovalMessageChange(listIndex, approvalMessage)
                    }
                  />
                  <FieldDescription className="text-xs">
                    Leave blank to use the default approval message for this event.
                  </FieldDescription>
                </Field>
                {qrAttachmentControlsEnabled ? (
                  <FieldSwitchRow
                    compact
                    title="Attach generated QR code"
                    description={
                      <>
                        Sends a generated QR image with this approval SMS for guests on this list.
                        Use {"{{qrCodeUrl}}"} if you also want the ticket link in the text.
                      </>
                    }
                    checked={qrAttachmentEnabled}
                    onCheckedChange={(checked) => onQrAttachmentChange?.(listIndex, checked)}
                    switchId={`list-confirmation-qr-attachment-${listIndex}`}
                  />
                ) : null}
                {ticketLinkControlsEnabled ? (
                  <FieldSwitchRow
                    compact
                    title="Include ticket link"
                    description="Adds the guest's ticket URL to this approval SMS. Turn this off to send approval copy without a ticket link."
                    checked={ticketLinkEnabled}
                    onCheckedChange={(checked) => onTicketLinkChange?.(listIndex, checked)}
                    switchId={`list-confirmation-ticket-link-${listIndex}`}
                  />
                ) : null}
                <div className="space-y-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-3)]/40 p-3">
                  <div className="text-xs font-medium text-[var(--text-tertiary)]">Preview</div>
                  <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">
                    {approvalMessagePreview}
                    {ticketLinkPreviewFooter}
                  </div>
                  {qrAttachmentControlsEnabled && qrAttachmentEnabled ? (
                    <div className="mt-2 border-t border-[var(--border-subtle)] pt-2 text-xs text-[var(--text-secondary)]">
                      Generated QR image will be attached with this approval SMS.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[var(--border-subtle)] p-4 text-sm text-[var(--text-secondary)]">
          Name at least one list before writing confirmation texts.
        </div>
      )}
    </SectionCard>
  );
}
