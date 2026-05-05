export interface ApprovalMessageSource {
  eventName?: string | null;
  listApprovalMessage?: string | null;
  eventApprovalMessage?: string | null;
}

export interface ApprovalMessageBackfillSource {
  credentialApprovalMessage?: string | null;
  eventApprovalMessage?: string | null;
}

export function sanitizeOptionalApprovalMessage(
  approvalMessage: string | null | undefined,
): string | undefined {
  if (!approvalMessage) return undefined;
  const trimmedApprovalMessage = approvalMessage.trim();
  return trimmedApprovalMessage.length > 0 ? trimmedApprovalMessage : undefined;
}

export function getDefaultApprovalMessage(
  eventName: string | null | undefined,
): string {
  const trimmedEventName = eventName?.trim();
  if (trimmedEventName) {
    return `You have been approved for ${trimmedEventName.toUpperCase()}. We're looking forward to seeing you.`;
  }
  return "You have been approved. We're looking forward to seeing you.";
}

export function resolveApprovalMessageText({
  eventName,
  listApprovalMessage,
  eventApprovalMessage,
}: ApprovalMessageSource): string {
  return (
    sanitizeOptionalApprovalMessage(listApprovalMessage) ??
    sanitizeOptionalApprovalMessage(eventApprovalMessage) ??
    getDefaultApprovalMessage(eventName)
  );
}

export function buildApprovalMessageBackfillPatch({
  credentialApprovalMessage,
  eventApprovalMessage,
}: ApprovalMessageBackfillSource): { approvalMessage: string } | undefined {
  if (sanitizeOptionalApprovalMessage(credentialApprovalMessage)) {
    return undefined;
  }

  const backfilledApprovalMessage = sanitizeOptionalApprovalMessage(
    eventApprovalMessage,
  );
  if (!backfilledApprovalMessage) {
    return undefined;
  }

  return { approvalMessage: backfilledApprovalMessage };
}
