import {
  dedupeSocialPlatformConfigs,
  type InvitedByPrimaryFieldConfig,
  normalizeInvitedByName,
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
  type PrimaryFieldConfig,
  type PrimarySocialPlatformConfig,
  parseInvitedBySocialReference,
  type WorkspaceEventDefaults,
} from "@coucou/sdk/shared/primary-fields";
import { normalizeHexColorInput } from "@coucou/sdk/theming/build-event-theme";
import { v } from "convex/values";

export const socialPlatformConfigValidator = v.object({
  platformKey: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  profileUrlPrefix: v.optional(v.string()),
  required: v.optional(v.boolean()),
});

export const invitedByPrimaryFieldConfigValidator = v.object({
  enabled: v.boolean(),
  label: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  required: v.optional(v.boolean()),
});

export const primaryFieldConfigValidator = v.object({
  socialPlatforms: v.optional(v.array(socialPlatformConfigValidator)),
  invitedBy: v.optional(invitedByPrimaryFieldConfigValidator),
});

export const workspaceEventDefaultsValidator = v.object({
  themeBackgroundColor: v.optional(v.string()),
  themeTextColor: v.optional(v.string()),
  themeAccentColor: v.optional(v.string()),
  listKeys: v.optional(v.array(v.string())),
  socialPlatforms: v.optional(v.array(socialPlatformConfigValidator)),
  invitedBy: v.optional(invitedByPrimaryFieldConfigValidator),
  referralSharingEnabled: v.optional(v.boolean()),
});

export const submittedSocialProfileValidator = v.object({
  platformKey: v.string(),
  handle: v.string(),
});

export interface SanitizedSubmittedSocialProfile {
  platformKey: string;
  handle: string;
  normalizedHandle: string;
}

export interface InvitedByPatch {
  invitedByName?: string;
  invitedByNormalizedName?: string;
  invitedBySocialPlatformKey?: string;
  invitedBySocialHandle?: string;
}

function normalizeListKey(value: string): string | undefined {
  const normalizedValue = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalizedValue || undefined;
}

function sanitizeInvitedByConfig(
  config: InvitedByPrimaryFieldConfig | undefined,
): InvitedByPrimaryFieldConfig | undefined {
  if (!config) return undefined;

  return {
    enabled: config.enabled,
    label: config.label?.trim() || undefined,
    placeholder: config.placeholder?.trim() || undefined,
    required: config.required === true ? true : undefined,
  };
}

export function sanitizeSocialPlatformConfigs(
  platforms: readonly PrimarySocialPlatformConfig[] | undefined,
): PrimarySocialPlatformConfig[] | undefined {
  const sanitizedPlatforms = dedupeSocialPlatformConfigs(platforms ?? []);
  return sanitizedPlatforms.length > 0 ? sanitizedPlatforms : undefined;
}

export function sanitizePrimaryFieldConfig(
  config: PrimaryFieldConfig | undefined,
): PrimaryFieldConfig | undefined {
  if (!config) return undefined;

  const socialPlatforms = sanitizeSocialPlatformConfigs(config.socialPlatforms);
  const invitedBy = sanitizeInvitedByConfig(config.invitedBy);

  if (!socialPlatforms && !invitedBy) {
    return undefined;
  }

  return {
    socialPlatforms,
    invitedBy,
  };
}

export function sanitizeWorkspaceEventDefaults(
  defaults: WorkspaceEventDefaults | undefined,
): WorkspaceEventDefaults | undefined {
  if (!defaults) return undefined;

  const listKeys = Array.from(
    new Set(
      (defaults.listKeys ?? [])
        .map((listKey) => normalizeListKey(listKey))
        .filter((listKey): listKey is string => Boolean(listKey)),
    ),
  );
  const socialPlatforms = sanitizeSocialPlatformConfigs(defaults.socialPlatforms);
  const invitedBy = sanitizeInvitedByConfig(defaults.invitedBy);
  const themeBackgroundColor = normalizeHexColorInput(defaults.themeBackgroundColor);
  const themeTextColor = normalizeHexColorInput(defaults.themeTextColor);
  const themeAccentColor = normalizeHexColorInput(defaults.themeAccentColor);
  const referralSharingEnabled =
    typeof defaults.referralSharingEnabled === "boolean"
      ? defaults.referralSharingEnabled
      : undefined;

  if (
    !themeBackgroundColor &&
    !themeTextColor &&
    !themeAccentColor &&
    listKeys.length === 0 &&
    !socialPlatforms &&
    !invitedBy &&
    referralSharingEnabled === undefined
  ) {
    return undefined;
  }

  return {
    themeBackgroundColor,
    themeTextColor,
    themeAccentColor,
    listKeys: listKeys.length > 0 ? listKeys : undefined,
    socialPlatforms,
    invitedBy,
    referralSharingEnabled,
  };
}

export function primaryFieldConfigFromWorkspaceDefaults(
  defaults: WorkspaceEventDefaults | undefined,
): PrimaryFieldConfig | undefined {
  return sanitizePrimaryFieldConfig({
    socialPlatforms: defaults?.socialPlatforms,
    invitedBy: defaults?.invitedBy,
  });
}

export function primaryFieldConfigHasEffectiveContent(
  config: PrimaryFieldConfig | undefined | null,
): boolean {
  if (!config) return false;
  const hasPlatforms = (config.socialPlatforms?.length ?? 0) > 0;
  const hasInvitedBy = config.invitedBy?.enabled === true;
  return hasPlatforms || hasInvitedBy;
}

export function sanitizeSubmittedSocialProfiles(
  submittedProfiles: readonly { platformKey: string; handle: string }[] | undefined,
  primaryFieldConfig: PrimaryFieldConfig | undefined,
): SanitizedSubmittedSocialProfile[] {
  const configuredPlatformKeys = new Set(
    (primaryFieldConfig?.socialPlatforms ?? []).map((platform) =>
      normalizeSocialPlatformKey(platform.platformKey),
    ),
  );
  if (configuredPlatformKeys.size === 0) return [];

  const sanitizedProfiles: SanitizedSubmittedSocialProfile[] = [];
  const seenPlatformKeys = new Set<string>();

  for (const profile of submittedProfiles ?? []) {
    const platformKey = normalizeSocialPlatformKey(profile.platformKey);
    if (
      !platformKey ||
      !configuredPlatformKeys.has(platformKey) ||
      seenPlatformKeys.has(platformKey)
    ) {
      continue;
    }

    const handle = normalizeSocialHandleInput(profile.handle, platformKey);
    if (!handle) continue;

    seenPlatformKeys.add(platformKey);
    sanitizedProfiles.push({
      platformKey,
      handle,
      normalizedHandle: normalizePrimaryFieldLookupText(handle),
    });
  }

  return sanitizedProfiles;
}

export function collectRequiredPrimaryFieldErrors({
  primaryFieldConfig,
  submittedProfiles,
  invitedByName,
}: {
  primaryFieldConfig: PrimaryFieldConfig | undefined;
  submittedProfiles: readonly SanitizedSubmittedSocialProfile[];
  invitedByName: string | null | undefined;
}): string[] {
  if (!primaryFieldConfig) return [];

  const errors: string[] = [];
  const submittedPlatformKeys = new Set(
    submittedProfiles.map((profile) => normalizeSocialPlatformKey(profile.platformKey)),
  );

  for (const platform of primaryFieldConfig.socialPlatforms ?? []) {
    if (platform.required !== true) continue;

    const platformKey = normalizeSocialPlatformKey(platform.platformKey);
    if (!platformKey || submittedPlatformKeys.has(platformKey)) continue;

    errors.push(`${platform.label} is required`);
  }

  const invitedByConfig = primaryFieldConfig.invitedBy;
  if (
    invitedByConfig?.enabled === true &&
    invitedByConfig.required === true &&
    !normalizeInvitedByName(invitedByName)
  ) {
    errors.push(`${invitedByConfig.label ?? "Invited by"} is required`);
  }

  return errors;
}

export function assertRequiredPrimaryFieldValues(input: {
  primaryFieldConfig: PrimaryFieldConfig | undefined;
  submittedProfiles: readonly SanitizedSubmittedSocialProfile[];
  invitedByName: string | null | undefined;
}) {
  const errors = collectRequiredPrimaryFieldErrors(input);
  if (errors.length > 0) {
    throw new Error(`Missing required fields: ${errors.join(", ")}`);
  }
}

export function buildInvitedByPatch(value: string | null | undefined): InvitedByPatch {
  const invitedByName = normalizeInvitedByName(value);
  if (!invitedByName) {
    return {
      invitedByName: undefined,
      invitedByNormalizedName: undefined,
      invitedBySocialPlatformKey: undefined,
      invitedBySocialHandle: undefined,
    };
  }

  const socialReference = parseInvitedBySocialReference(invitedByName);
  return {
    invitedByName,
    invitedByNormalizedName: normalizePrimaryFieldLookupText(invitedByName),
    invitedBySocialPlatformKey: socialReference?.platformKey,
    invitedBySocialHandle: socialReference?.handle,
  };
}
