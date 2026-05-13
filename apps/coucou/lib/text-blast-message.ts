const MULTI_EVENT_RESTRICTED_VARIABLE_PATTERN =
  /\{\{\s*(eventName|eventDate|eventLocation|qrCodeUrl)\s*\}\}/;
const QR_CODE_URL_VARIABLE_PATTERN = /\{\{\s*qrCodeUrl\s*\}\}/;
const QR_CODE_URL_VARIABLE_REPLACEMENT_PATTERN = /\{\{\s*qrCodeUrl\s*\}\}/g;

export const messageContainsMultiEventRestrictedVariables = (message: string): boolean =>
  MULTI_EVENT_RESTRICTED_VARIABLE_PATTERN.test(message);

export const messageContainsQrCodeUrlVariable = (message: string): boolean =>
  QR_CODE_URL_VARIABLE_PATTERN.test(message);

export const resolveEffectiveIncludeQrCodes = (args: {
  isMultiEventBlast: boolean;
  includeQrCodes: boolean;
  message: string;
}): boolean => {
  if (args.isMultiEventBlast) {
    return false;
  }

  return args.includeQrCodes || messageContainsQrCodeUrlVariable(args.message);
};

export const replaceQrCodeUrlVariable = (message: string, qrCodeUrl: string): string => {
  return message.replace(QR_CODE_URL_VARIABLE_REPLACEMENT_PATTERN, qrCodeUrl);
};
