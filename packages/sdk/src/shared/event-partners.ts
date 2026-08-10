export interface EventPartner<LogoStorageId extends string = string> {
  label: string;
  logoStorageId: LogoStorageId;
  url?: string;
}

export class EventPartnerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventPartnerValidationError";
  }
}

export function sanitizeEventPartners<LogoStorageId extends string>(
  partners: readonly EventPartner<LogoStorageId>[] | undefined,
): EventPartner<LogoStorageId>[] | undefined {
  if (!partners) return undefined;

  const sanitizedPartners = partners.map((partner) => {
    const label = partner.label.trim();
    if (!label) {
      throw new EventPartnerValidationError("Partner label is required");
    }
    if (!partner.logoStorageId) {
      throw new EventPartnerValidationError(`${label} logo is required`);
    }

    const url = partner.url?.trim();
    if (!url) {
      return {
        label,
        logoStorageId: partner.logoStorageId,
      };
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        throw new EventPartnerValidationError(`${label} link must use http or https`);
      }
      return {
        label,
        logoStorageId: partner.logoStorageId,
        url: parsedUrl.toString(),
      };
    } catch (error) {
      if (error instanceof EventPartnerValidationError) throw error;
      throw new EventPartnerValidationError(`${label} link must be a valid URL`);
    }
  });

  return sanitizedPartners.length > 0 ? sanitizedPartners : undefined;
}
