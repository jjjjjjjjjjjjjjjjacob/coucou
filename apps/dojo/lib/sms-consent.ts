export interface SmsConsentIpResponse {
  ipAddress?: string | null;
}

export const fetchSmsConsentIpAddress = async (): Promise<string | undefined> => {
  try {
    const response = await fetch("/api/sms-consent/ip", { cache: "no-store" });
    if (!response.ok) return undefined;
    const data = (await response.json()) as SmsConsentIpResponse;
    const candidate = typeof data.ipAddress === "string" ? data.ipAddress.trim() : "";
    return candidate.length > 0 ? candidate : undefined;
  } catch (error) {
    console.error("Failed to fetch SMS consent IP address", error);
    return undefined;
  }
};
