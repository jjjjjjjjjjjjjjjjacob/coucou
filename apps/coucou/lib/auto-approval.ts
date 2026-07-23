export function parseAutoApproveLimitInput(autoApproveLimitInput: string): number | undefined {
  const trimmedAutoApproveLimitInput = autoApproveLimitInput.trim();
  if (!trimmedAutoApproveLimitInput) {
    return undefined;
  }

  const autoApproveLimit = Number(trimmedAutoApproveLimitInput);
  if (!Number.isSafeInteger(autoApproveLimit) || autoApproveLimit <= 0) {
    throw new Error("Auto-approve limit must be a positive whole number");
  }
  return autoApproveLimit;
}
