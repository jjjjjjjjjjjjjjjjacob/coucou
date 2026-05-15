export const MESSAGE_TEMPLATE_VARIABLES = [
  "firstName",
  "eventName",
  "eventDate",
  "eventLocation",
  "qrCodeUrl",
] as const;

export type MessageTemplateVariableName = (typeof MESSAGE_TEMPLATE_VARIABLES)[number];

export type MessageTemplateVariables = {
  firstName: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  qrCodeUrl?: string;
};

const variableReplacementPatterns: Record<MessageTemplateVariableName, RegExp> = {
  firstName: /\{\{\s*firstName\s*\}\}/g,
  eventName: /\{\{\s*eventName\s*\}\}/g,
  eventDate: /\{\{\s*eventDate\s*\}\}/g,
  eventLocation: /\{\{\s*eventLocation\s*\}\}/g,
  qrCodeUrl: /\{\{\s*qrCodeUrl\s*\}\}/g,
};

const multiEventRestrictedVariablePattern =
  /\{\{\s*(eventName|eventDate|eventLocation|qrCodeUrl)\s*\}\}/;

const qrCodeUrlVariablePattern = /\{\{\s*qrCodeUrl\s*\}\}/;

export const FIRST_NAME_TEMPLATE_FALLBACK = "there";

export function messageContainsMultiEventRestrictedVariables(message: string): boolean {
  return multiEventRestrictedVariablePattern.test(message);
}

export function messageContainsQrCodeUrlVariable(message: string): boolean {
  return qrCodeUrlVariablePattern.test(message);
}

export function resolveEffectiveIncludeQrCodes(args: {
  isMultiEventBlast: boolean;
  includeQrCodes: boolean;
  message: string;
}): boolean {
  if (args.isMultiEventBlast) {
    return false;
  }

  return args.includeQrCodes || messageContainsQrCodeUrlVariable(args.message);
}

export function applyMessageTemplateVariables(
  template: string,
  variables: MessageTemplateVariables,
): string {
  return template
    .replace(variableReplacementPatterns.firstName, variables.firstName)
    .replace(variableReplacementPatterns.eventName, variables.eventName)
    .replace(variableReplacementPatterns.eventDate, variables.eventDate)
    .replace(variableReplacementPatterns.eventLocation, variables.eventLocation)
    .replace(variableReplacementPatterns.qrCodeUrl, variables.qrCodeUrl ?? "");
}

export function replaceQrCodeUrlVariable(message: string, qrCodeUrl: string): string {
  return message.replace(variableReplacementPatterns.qrCodeUrl, qrCodeUrl);
}

export function formatEventDateForMessageTemplate(
  timestamp: number | null | undefined,
  timezone?: string | null,
): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp)
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
      timeZone: timezone ?? "UTC",
    })
    .replace(/\//g, ".");
}

export function formatEventTitleForMessageTemplate(event: {
  name?: string | null;
  secondaryTitle?: string | null;
}): string {
  const name = event.name?.trim();
  const secondaryTitle = event.secondaryTitle?.trim();
  if (name && secondaryTitle) {
    return `${name}: ${secondaryTitle}`;
  }
  if (name) return name;
  if (secondaryTitle) return secondaryTitle;
  return "Event";
}

export function resolveMessageTemplateFirstName(args: {
  firstName?: string | null;
  fullName?: string | null;
  fallback?: string;
}): string {
  const firstName = args.firstName?.trim();
  if (firstName) return firstName;

  const firstToken = args.fullName?.trim().split(/\s+/)[0];
  if (firstToken) return firstToken;

  return args.fallback ?? FIRST_NAME_TEMPLATE_FALLBACK;
}
