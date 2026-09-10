export {
  applyMessageTemplateVariables,
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  MESSAGE_TEMPLATE_VARIABLES,
  type MessageTemplateVariables,
  messageContainsMultiEventRestrictedVariables,
  messageContainsQrCodeUrlVariable,
  replaceQrCodeUrlVariable,
  resolveEffectiveIncludeQrCodes,
  resolveMessageTemplateFirstName,
} from "@coucou/sdk/shared/message-template";

export function sortTextBlastMessageEventsNewestFirst<
  MessageEvent extends { eventDate?: number | null },
>(events: readonly MessageEvent[]): MessageEvent[] {
  return [...events].sort(
    (firstEvent, secondEvent) =>
      (secondEvent.eventDate ?? Number.NEGATIVE_INFINITY) -
      (firstEvent.eventDate ?? Number.NEGATIVE_INFINITY),
  );
}
