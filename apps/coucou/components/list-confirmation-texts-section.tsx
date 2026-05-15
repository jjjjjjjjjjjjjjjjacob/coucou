import { MessageTemplateVariableButtons } from "@/components/message-template-variable-buttons";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  applyMessageTemplateVariables,
  type MessageTemplateVariables,
} from "@/lib/text-blast-message";
import { cn } from "@/lib/utils";

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
  previewVariables = DEFAULT_PREVIEW_VARIABLES,
  className,
}: ListConfirmationTextsSectionProps<ListRow>) {
  const namedLists = lists
    .map((list, listIndex) => ({ list, listIndex }))
    .filter(({ list }) => list.listKey.trim().length > 0);

  return (
    <div className={cn("space-y-4 rounded-lg border bg-card p-4", className)}>
      <div className="space-y-1">
        <h3 className="font-medium text-sm text-muted-foreground">CONFIRMATION TEXTS</h3>
        <p className="text-sm text-muted-foreground">
          Customize the approval SMS guests receive after being approved from each list.
        </p>
      </div>

      {namedLists.length > 0 ? (
        <div className="space-y-3">
          {namedLists.map(({ list, listIndex }) => {
            const trimmedListKey = list.listKey.trim();
            const qrAttachmentControlsEnabled = Boolean(
              resolveQrAttachmentEnabled && onQrAttachmentChange,
            );
            const qrAttachmentEnabled = resolveQrAttachmentEnabled?.(list, listIndex) ?? false;
            return (
              <div
                key={`${trimmedListKey}-${listIndex}`}
                className="space-y-2 rounded border bg-muted/20 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor={`list-confirmation-text-${listIndex}`}
                    className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
                  >
                    {trimmedListKey}
                  </label>
                  <span className="text-xs text-muted-foreground">Approval SMS</span>
                </div>
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
                {qrAttachmentControlsEnabled ? (
                  <div className="rounded-md border border-border/70 bg-background p-3">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={`list-confirmation-qr-attachment-${listIndex}`}
                        checked={qrAttachmentEnabled}
                        onCheckedChange={(checked) =>
                          onQrAttachmentChange?.(listIndex, checked === true)
                        }
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <label
                          htmlFor={`list-confirmation-qr-attachment-${listIndex}`}
                          className="block cursor-pointer text-sm font-medium"
                        >
                          Attach generated QR code
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Sends a generated QR image with this approval SMS for guests on this list.
                          Use {"{{qrCodeUrl}}"} if you also want the ticket link in the text.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1 rounded-md border border-border/70 bg-background p-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Preview
                  </div>
                  <div className="whitespace-pre-wrap text-sm">
                    {applyMessageTemplateVariables(
                      list.approvalMessage.trim() ? list.approvalMessage : defaultApprovalMessage,
                      previewVariables,
                    )}
                  </div>
                  {qrAttachmentControlsEnabled && qrAttachmentEnabled ? (
                    <div className="mt-2 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                      Generated QR image will be attached with this approval SMS.
                    </div>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default approval message for this event.
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
          Name at least one list before writing confirmation texts.
        </div>
      )}
    </div>
  );
}
