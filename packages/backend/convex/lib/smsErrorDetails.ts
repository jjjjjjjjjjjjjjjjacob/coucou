export type SmsErrorDetails = {
  errorMessage: string;
  errorCode?: string;
  errorDetails?: string;
  errorStack?: string;
};

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue || undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function propertyFromUnknown(value: unknown, propertyName: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return Reflect.get(value, propertyName);
}

export function getSmsErrorDetails(error: unknown): SmsErrorDetails {
  const errorMessage =
    error instanceof Error
      ? error.message
      : (stringFromUnknown(error) ?? "Unknown SMS delivery error");
  const errorCode =
    stringFromUnknown(propertyFromUnknown(error, "code")) ??
    stringFromUnknown(propertyFromUnknown(error, "errorCode"));
  const providerStatus = stringFromUnknown(propertyFromUnknown(error, "status"));
  const providerMoreInfo = stringFromUnknown(propertyFromUnknown(error, "moreInfo"));
  const providerDetails = [
    providerStatus ? `HTTP status: ${providerStatus}` : undefined,
    providerMoreInfo ? `Provider details: ${providerMoreInfo}` : undefined,
  ].filter((detail): detail is string => detail !== undefined);

  return {
    errorMessage,
    errorCode,
    errorDetails: providerDetails.length > 0 ? providerDetails.join("\n") : undefined,
    errorStack: error instanceof Error ? error.stack : undefined,
  };
}
