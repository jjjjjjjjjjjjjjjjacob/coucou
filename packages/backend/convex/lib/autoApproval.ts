export function validateAutoApproveLimit(autoApproveLimit: number | undefined): void {
  if (autoApproveLimit === undefined) {
    return;
  }
  if (!Number.isSafeInteger(autoApproveLimit) || autoApproveLimit < 0) {
    throw new Error("Auto-approve limit must be a non-negative whole number");
  }
}

export function validateAutoApproveDelayMinutes(autoApproveDelayMinutes: number | undefined): void {
  if (autoApproveDelayMinutes === undefined) {
    return;
  }
  if (!Number.isSafeInteger(autoApproveDelayMinutes) || autoApproveDelayMinutes < 0) {
    throw new Error("Auto-approve delay must be a non-negative whole number of minutes");
  }
}
