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
