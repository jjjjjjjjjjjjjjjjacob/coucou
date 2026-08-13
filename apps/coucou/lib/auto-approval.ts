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

export type AutoApproveDelayUnit = "minutes" | "hours" | "days";

const AUTO_APPROVE_DELAY_MINUTES_BY_UNIT: Record<AutoApproveDelayUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 24 * 60,
};

export function parseAutoApproveDelayInput(
  autoApproveDelayInput: string,
  autoApproveDelayUnit: AutoApproveDelayUnit,
): number | undefined {
  const trimmedAutoApproveDelayInput = autoApproveDelayInput.trim();
  if (!trimmedAutoApproveDelayInput) {
    return undefined;
  }

  const autoApproveDelayAmount = Number(trimmedAutoApproveDelayInput);
  const autoApproveDelayMinutes =
    autoApproveDelayAmount * AUTO_APPROVE_DELAY_MINUTES_BY_UNIT[autoApproveDelayUnit];
  if (
    !Number.isSafeInteger(autoApproveDelayAmount) ||
    autoApproveDelayAmount <= 0 ||
    !Number.isSafeInteger(autoApproveDelayMinutes)
  ) {
    throw new Error("Auto-approve delay must be a positive whole number");
  }
  return autoApproveDelayMinutes;
}

export function splitAutoApproveDelayMinutes(autoApproveDelayMinutes: number | undefined): {
  value: string;
  unit: AutoApproveDelayUnit;
} {
  if (
    typeof autoApproveDelayMinutes !== "number" ||
    !Number.isSafeInteger(autoApproveDelayMinutes) ||
    autoApproveDelayMinutes <= 0
  ) {
    return { value: "", unit: "hours" };
  }
  if (autoApproveDelayMinutes % AUTO_APPROVE_DELAY_MINUTES_BY_UNIT.days === 0) {
    return {
      value: String(autoApproveDelayMinutes / AUTO_APPROVE_DELAY_MINUTES_BY_UNIT.days),
      unit: "days",
    };
  }
  if (autoApproveDelayMinutes % AUTO_APPROVE_DELAY_MINUTES_BY_UNIT.hours === 0) {
    return {
      value: String(autoApproveDelayMinutes / AUTO_APPROVE_DELAY_MINUTES_BY_UNIT.hours),
      unit: "hours",
    };
  }
  return { value: String(autoApproveDelayMinutes), unit: "minutes" };
}

export function formatAutoApproveDelay(
  autoApproveDelayInput: string,
  autoApproveDelayUnit: AutoApproveDelayUnit,
): string {
  const trimmedAutoApproveDelayInput = autoApproveDelayInput.trim();
  if (!trimmedAutoApproveDelayInput) {
    return "immediately";
  }
  const singularUnit = autoApproveDelayUnit.slice(0, -1);
  const displayedUnit = trimmedAutoApproveDelayInput === "1" ? singularUnit : autoApproveDelayUnit;
  return `after ${trimmedAutoApproveDelayInput} ${displayedUnit}`;
}
