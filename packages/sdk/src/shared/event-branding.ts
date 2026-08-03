export interface EventMessagingBrandSource {
  name?: string | null;
  secondaryTitle?: string | null;
  hosts?: Array<string | null | undefined> | null;
  eventHostNames?: Array<string | null | undefined> | null;
  productionCompany?: string | null | undefined;
}

export interface ResolveEventMessagingBrandNameOptions {
  fallback?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeBrandCandidate = (value: string | null | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmedValue = value.trim();
  if (!trimmedValue) return undefined;
  if (EMAIL_PATTERN.test(trimmedValue.toLowerCase())) return undefined;
  return trimmedValue;
};

export function formatHostNames(
  hostNames: Array<string | null | undefined> | null | undefined,
): string | undefined {
  if (!hostNames || hostNames.length === 0) return undefined;

  const validNames = hostNames
    .map((hostName) => {
      if (!hostName) return undefined;
      const trimmedHostName = hostName.trim();
      if (!trimmedHostName) return undefined;
      if (EMAIL_PATTERN.test(trimmedHostName.toLowerCase())) return undefined;
      return trimmedHostName;
    })
    .filter((hostName): hostName is string => hostName !== undefined);

  if (validNames.length === 0) return undefined;
  if (validNames.length === 1) return validNames[0];
  if (validNames.length === 2) return `${validNames[0]} & ${validNames[1]}`;

  const allButLastHostName = validNames.slice(0, -1);
  const lastHostName = validNames[validNames.length - 1];
  return `${allButLastHostName.join(", ")}, & ${lastHostName}`;
}

const extractBrandFromSecondaryTitle = (
  secondaryTitle: string | null | undefined,
): string | undefined => {
  if (!secondaryTitle) return undefined;
  const trimmedSecondaryTitle = secondaryTitle.trim();
  if (!trimmedSecondaryTitle) return undefined;

  const hostedMatch = trimmedSecondaryTitle.match(/hosted by\s+(.+)/i);
  if (hostedMatch?.[1]) {
    return sanitizeBrandCandidate(hostedMatch[1]);
  }

  const presentedMatch = trimmedSecondaryTitle.match(/presented by\s+(.+)/i);
  if (presentedMatch?.[1]) {
    return sanitizeBrandCandidate(presentedMatch[1]);
  }

  const byMatch = trimmedSecondaryTitle.match(/by\s+(.+)/i);
  if (byMatch?.[1]) {
    return sanitizeBrandCandidate(byMatch[1]);
  }

  return sanitizeBrandCandidate(trimmedSecondaryTitle);
};

export function resolveEventMessagingBrandName(
  source: EventMessagingBrandSource | null | undefined,
  { fallback = "Event Host" }: ResolveEventMessagingBrandNameOptions = {},
): string {
  const productionCompanyBrand = sanitizeBrandCandidate(source?.productionCompany ?? undefined);
  if (productionCompanyBrand) {
    return productionCompanyBrand;
  }

  const hostCandidates = source?.eventHostNames ?? source?.hosts ?? [];
  const formattedHostNames = formatHostNames(hostCandidates);
  if (formattedHostNames) {
    return formattedHostNames;
  }

  const secondaryTitleBrand = extractBrandFromSecondaryTitle(source?.secondaryTitle ?? undefined);
  if (secondaryTitleBrand) {
    return secondaryTitleBrand;
  }

  const nameBrand = sanitizeBrandCandidate(source?.name ?? undefined);
  if (nameBrand) {
    return nameBrand;
  }

  return fallback;
}

export function formatOrganizerSmsPrefix(organizerName: string): string {
  const trimmedOrganizerName = organizerName.trim();
  return trimmedOrganizerName ? `${trimmedOrganizerName.toUpperCase()}:` : "";
}

export function formatOrganizerSmsMessage(organizerName: string, message: string): string {
  const trimmedMessage = message.trim();
  const organizerPrefix = formatOrganizerSmsPrefix(organizerName);
  if (!organizerPrefix) return trimmedMessage;
  if (trimmedMessage.toLowerCase().startsWith(organizerPrefix.toLowerCase())) {
    return `${organizerPrefix}${trimmedMessage.slice(organizerPrefix.length)}`;
  }
  return trimmedMessage ? `${organizerPrefix} ${trimmedMessage}` : organizerPrefix;
}
