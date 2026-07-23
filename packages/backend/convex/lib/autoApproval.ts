export function validateAutoApproveLimit(autoApproveLimit: number | undefined): void {
  if (autoApproveLimit === undefined) {
    return;
  }
  if (!Number.isSafeInteger(autoApproveLimit) || autoApproveLimit < 0) {
    throw new Error("Auto-approve limit must be a non-negative whole number");
  }
}
