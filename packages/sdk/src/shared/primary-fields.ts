export interface PrimarySocialPlatformConfig {
  platformKey: string;
  label: string;
  placeholder?: string;
  profileUrlPrefix?: string;
  required?: boolean;
}

export interface InvitedByPrimaryFieldConfig {
  enabled: boolean;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export interface PrimaryFieldConfig {
  socialPlatforms?: PrimarySocialPlatformConfig[];
  invitedBy?: InvitedByPrimaryFieldConfig;
}

export interface WorkspaceEventDefaults extends PrimaryFieldConfig {
  themeBackgroundColor?: string;
  themeTextColor?: string;
  themeAccentColor?: string;
  listKeys?: string[];
  referralSharingEnabled?: boolean;
}

export interface CustomFieldLike {
  key: string;
  label?: string;
}

export interface InvitedBySocialReference {
  platformKey: string;
  handle: string;
}

export const DEFAULT_SOCIAL_PLATFORM_CONFIGS: readonly PrimarySocialPlatformConfig[] = [
  {
    platformKey: "instagram",
    label: "Instagram",
    placeholder: "@handle",
    profileUrlPrefix: "https://instagram.com/",
    required: true,
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
  {
    platformKey: "x",
    label: "X",
    placeholder: "@handle",
    profileUrlPrefix: "https://x.com/",
  },
  {
    platformKey: "linkedin",
    label: "LinkedIn",
    placeholder: "LinkedIn profile",
    profileUrlPrefix: "https://www.linkedin.com/in/",
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
  tiktok: ["tiktok", "tik tok", "tt", "tiktok handle", "tik tok handle", "tiktok username"],
  beli: ["beli", "beli handle", "beli username"],
  x: ["x", "twitter", "x handle", "twitter handle", "x username", "twitter username"],
  linkedin: [
    "linkedin",
    "linked in",
    "linked-in",
    "linkedin handle",
    "linked in handle",
    "linkedin profile",
    "linked in profile",
    "linkedin url",
  ],
};

const canonicalSocialPlatformKeyByAlias: Record<string, string> = {
  ig: "instagram",
  insta: "instagram",
  "ig-handle": "instagram",
  "insta-handle": "instagram",
  "instagram-handle": "instagram",
  "instagram-username": "instagram",
  tt: "tiktok",
  "tik-tok": "tiktok",
  "tiktok-handle": "tiktok",
  "tiktok-username": "tiktok",
  "beli-handle": "beli",
  "beli-username": "beli",
  twitter: "x",
  "x-twitter": "x",
  "twitter-handle": "x",
  "twitter-username": "x",
  "x-handle": "x",
  "linked-in": "linkedin",
  "linked-in-profile": "linkedin",
  "linkedin-handle": "linkedin",
  "linkedin-profile": "linkedin",
  "linkedin-url": "linkedin",
};

const PRESET_PLATFORM_KEYS = new Set<string>(
  DEFAULT_SOCIAL_PLATFORM_CONFIGS.map((platform) => platform.platformKey),
);

export function isPresetSocialPlatformKey(key: string): boolean {
  return PRESET_PLATFORM_KEYS.has(normalizeSocialPlatformKey(key));
}

export function getPresetSocialPlatformConfig(
  key: string,
): PrimarySocialPlatformConfig | undefined {
  const normalized = normalizeSocialPlatformKey(key);
  return DEFAULT_SOCIAL_PLATFORM_CONFIGS.find((platform) => platform.platformKey === normalized);
}

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
  const normalizedKey = value
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return canonicalSocialPlatformKeyByAlias[normalizedKey] ?? normalizedKey;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function candidateMatchesSocialAlias(candidate: string, alias: string): boolean {
  const normalizedAlias = normalizePrimaryFieldLookupText(alias);
  if (!normalizedAlias) return false;
  if (candidate === normalizedAlias) return true;

  const words = normalizedAlias.split(" ");
  if (words.length === 1 && normalizedAlias.length <= 2) {
    return false;
  }

  return new RegExp(`(?:^|\\s)${escapeRegExp(normalizedAlias)}(?:\\s|$)`).test(candidate);
}

export function detectSocialPlatformKeyFromCustomField(field: CustomFieldLike): string | null {
  const candidates = [
    normalizePrimaryFieldLookupText(field.key),
    normalizePrimaryFieldLookupText(field.label ?? ""),
  ].filter(Boolean);

  for (const [platformKey, aliases] of Object.entries(socialPlatformAliases)) {
    if (
      candidates.some((candidate) =>
        aliases.some((alias) => candidateMatchesSocialAlias(candidate, alias)),
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
      /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`,
    );
    const host = parsedUrl.hostname.toLowerCase();
    const pathSegments = parsedUrl.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const firstPathSegment = pathSegments[0];
    const secondPathSegment = pathSegments[1];

    if (
      firstPathSegment &&
      (host.includes("instagram.com") || host.includes("tiktok.com") || host.includes("beli"))
    ) {
      candidate = firstPathSegment;
    } else if (
      firstPathSegment &&
      (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter.com"))
    ) {
      candidate = firstPathSegment;
    } else if (host.includes("linkedin.com")) {
      candidate =
        firstPathSegment === "in" && secondPathSegment
          ? secondPathSegment
          : (firstPathSegment ?? candidate);
    }
  } catch {
    candidate = trimmedValue;
  }

  const withoutLeadingAt = candidate.replace(/^@+/, "").trim();
  const withoutQuery = withoutLeadingAt.split(/[?#]/)[0] ?? withoutLeadingAt;
  const normalizedPlatformKey = platformKey ? normalizeSocialPlatformKey(platformKey) : "";

  if (normalizedPlatformKey === "tiktok") {
    return withoutQuery.replace(/^@+/, "") || undefined;
  }

  return withoutQuery || undefined;
}

export function normalizeInvitedByName(value: string | null | undefined): string | undefined {
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
      required: platform.required === true ? true : undefined,
    });
  }

  return normalizedPlatforms;
}
