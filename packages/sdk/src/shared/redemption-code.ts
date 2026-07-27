export const REDEMPTION_CODE_PATTERN = /^[A-Z0-9]{8}$/;

export type ParsedRedemptionPayload =
  | { valid: true; code: string }
  | { valid: false; reason: "empty" | "unsupported" };

export function normalizeRedemptionCode(value: string): string {
  return value.trim().toUpperCase();
}

export function parseRedemptionPayload(
  payload: string,
): ParsedRedemptionPayload {
  const normalizedPayload = payload.trim();
  if (!normalizedPayload) {
    return { valid: false, reason: "empty" };
  }

  const normalizedCode = normalizeRedemptionCode(normalizedPayload);
  if (REDEMPTION_CODE_PATTERN.test(normalizedCode)) {
    return { valid: true, code: normalizedCode };
  }

  try {
    const parsedUrl = new URL(normalizedPayload);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const redeemSegmentIndex = pathSegments.lastIndexOf("redeem");
    const code =
      redeemSegmentIndex >= 0
        ? normalizeRedemptionCode(pathSegments[redeemSegmentIndex + 1] ?? "")
        : "";
    if (REDEMPTION_CODE_PATTERN.test(code)) {
      return { valid: true, code };
    }
  } catch {
    return { valid: false, reason: "unsupported" };
  }

  return { valid: false, reason: "unsupported" };
}
