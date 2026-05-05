export interface PrimarySocialPlatformConfig {
  platformKey: string;
  label: string;
  placeholder?: string;
  profileUrlPrefix?: string;
}

export interface InvitedByPrimaryFieldConfig {
  enabled: boolean;
  label?: string;
  placeholder?: string;
}

export interface PrimaryFieldConfig {
  socialPlatforms?: PrimarySocialPlatformConfig[];
  invitedBy?: InvitedByPrimaryFieldConfig;
}

export interface WorkspaceEventDefaults extends PrimaryFieldConfig {
  themeBackgroundColor?: string;
  themeTextColor?: string;
  listKeys?: string[];
}

export interface CustomFieldLike {
  key: string;
  label?: string;
}

export interface InvitedBySocialReference {
  platformKey: string;
  handle: string;
}

export const DEFAULT_SOCIAL_PLATFORM_CONFIGS: readonly PrimarySocialPlatformConfig[] =
  [
    {
      platformKey: "instagram",
      label: "Instagram",
      placeholder: "@handle",
      profileUrlPrefix: "https://instagram.com/",
    },
    {
      platformKey: "tiktok",
      label: "TikTok",
      placeholder: "@handle",
      profileUrlPrefix: "https://www.tiktok.com/@",
    },
    {
      platformKey: "beli",
      label: "Beli",
      placeholder: "Beli username",
      profileUrlPrefix: "https://beliapp.com/profile/",
    },
  ];

const socialPlatformAliases: Record<string, readonly string[]> = {
  instagram: [
    "instagram",
    "ig",
    "insta",
    "instagram handle",
    "ig handle",
    "insta handle",
    "instagram username",
  ],
  tiktok: [
    "tiktok",
    "tik tok",
    "tt",
    "tiktok handle",
    "tik tok handle",
    "tiktok username",
  ],
  beli: ["beli", "beli handle", "beli username"],
};

const invitedByAliases = new Set([
  "invited by",
  "invite by",
  "who invited you",
  "who invited you?",
  "referred by",
  "referrer",
  "inviter",
]);

export function normalizePrimaryFieldLookupText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9@./ ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeSocialPlatformKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function detectSocialPlatformKeyFromCustomField(
  field: CustomFieldLike,
): string | null {
  const candidates = [
    normalizePrimaryFieldLookupText(field.key),
    normalizePrimaryFieldLookupText(field.label ?? ""),
  ].filter(Boolean);

  for (const [platformKey, aliases] of Object.entries(socialPlatformAliases)) {
    if (
      candidates.some((candidate) =>
        aliases.some(
          (alias) => candidate === alias || candidate.includes(alias),
        ),
      )
    ) {
      return platformKey;
    }
  }

  return null;
}

export function isInvitedByCustomField(field: CustomFieldLike): boolean {
  const candidates = [
    normalizePrimaryFieldLookupText(field.key),
    normalizePrimaryFieldLookupText(field.label ?? ""),
  ].filter(Boolean);

  return candidates.some((candidate) => invitedByAliases.has(candidate));
}

export function normalizeSocialHandleInput(
  value: string | null | undefined,
  platformKey?: string,
): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return undefined;

  let candidate = trimmedValue;
  try {
    const parsedUrl = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)
        ? candidate
        : `https://${candidate}`,
    );
    const host = parsedUrl.hostname.toLowerCase();
    const firstPathSegment = parsedUrl.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean)[0];

    if (
      firstPathSegment &&
      (host.includes("instagram.com") ||
        host.includes("tiktok.com") ||
        host.includes("beli"))
    ) {
      candidate = firstPathSegment;
    }
  } catch {
    candidate = trimmedValue;
  }

  const withoutLeadingAt = candidate.replace(/^@+/, "").trim();
  const withoutQuery = withoutLeadingAt.split(/[?#]/)[0] ?? withoutLeadingAt;
  const normalizedPlatformKey = platformKey
    ? normalizeSocialPlatformKey(platformKey)
    : "";

  if (normalizedPlatformKey === "tiktok") {
    return withoutQuery.replace(/^@+/, "") || undefined;
  }

  return withoutQuery || undefined;
}

export function normalizeInvitedByName(
  value: string | null | undefined,
): string | undefined {
  const normalizedValue = value?.replace(/\s+/g, " ").trim();
  return normalizedValue || undefined;
}

export function parseInvitedBySocialReference(
  value: string | null | undefined,
): InvitedBySocialReference | null {
  const normalizedValue = normalizeInvitedByName(value);
  if (!normalizedValue) return null;

  const instagramUrlMatch = normalizedValue.match(
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/@?([A-Za-z0-9._-]+)/i,
  );
  if (instagramUrlMatch?.[1]) {
    return {
      platformKey: "instagram",
      handle: normalizeSocialHandleInput(instagramUrlMatch[1], "instagram")!,
    };
  }

  const handleMatch = normalizedValue.match(/@([A-Za-z0-9._-]+)/);
  if (handleMatch?.[1]) {
    return {
      platformKey: "instagram",
      handle: normalizeSocialHandleInput(handleMatch[1], "instagram")!,
    };
  }

  return null;
}

export function dedupeSocialPlatformConfigs(
  platforms: readonly PrimarySocialPlatformConfig[],
): PrimarySocialPlatformConfig[] {
  const seenPlatformKeys = new Set<string>();
  const normalizedPlatforms: PrimarySocialPlatformConfig[] = [];

  for (const platform of platforms) {
    const platformKey = normalizeSocialPlatformKey(platform.platformKey);
    const label = platform.label.trim();
    if (!platformKey || !label || seenPlatformKeys.has(platformKey)) {
      continue;
    }
    seenPlatformKeys.add(platformKey);
    normalizedPlatforms.push({
      platformKey,
      label,
      placeholder: platform.placeholder?.trim() || undefined,
      profileUrlPrefix: platform.profileUrlPrefix?.trim() || undefined,
    });
  }

  return normalizedPlatforms;
}
