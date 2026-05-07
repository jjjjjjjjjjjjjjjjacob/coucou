import { v } from "convex/values";

export const DEFAULT_SECRET_GUEST_DISPLAY_NAME = "SECRET GUEST";

export class EventMetadataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventMetadataValidationError";
  }
}

export const eventStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("past"),
);

export const eventActValidator = v.object({
  name: v.string(),
  descriptorBadges: v.optional(v.array(v.string())),
  socialUrl: v.optional(v.string()),
  isSecretGuest: v.optional(v.boolean()),
  secretDisplayName: v.optional(v.string()),
});

export type EventStatus = "active" | "inactive" | "past";

export type EventActInput = {
  name: string;
  descriptorBadges?: string[];
  socialUrl?: string;
  isSecretGuest?: boolean;
  secretDisplayName?: string;
};

export type SanitizedEventAct = {
  name: string;
  descriptorBadges?: string[];
  socialUrl?: string;
  isSecretGuest?: boolean;
  secretDisplayName?: string;
};

export function sanitizeOptionalEventDescription(
  description: string | undefined,
): string | undefined {
  const trimmedDescription = description?.trim() ?? "";
  return trimmedDescription.length > 0 ? trimmedDescription : undefined;
}

export function sanitizeOptionalEventActs(
  acts: EventActInput[] | undefined,
): SanitizedEventAct[] | undefined {
  if (!acts) return undefined;

  const sanitizedActs: SanitizedEventAct[] = [];

  for (const act of acts) {
    const trimmedName = act.name.trim();
    const isSecretGuest = act.isSecretGuest === true;
    const trimmedSecretDisplayName = act.secretDisplayName?.trim() ?? "";

    if (!trimmedName && !isSecretGuest) {
      continue;
    }

    const descriptorBadges = (act.descriptorBadges ?? [])
      .map((descriptorBadge) => descriptorBadge.trim())
      .filter((descriptorBadge) => descriptorBadge.length > 0);

    const sanitizedAct: SanitizedEventAct = {
      name: trimmedName,
    };

    if (descriptorBadges.length > 0) {
      sanitizedAct.descriptorBadges = descriptorBadges;
    }

    const trimmedSocialUrl = act.socialUrl?.trim() ?? "";
    if (trimmedSocialUrl.length > 0) {
      try {
        const parsedSocialUrl = new URL(trimmedSocialUrl);
        if (
          parsedSocialUrl.protocol !== "http:" &&
            parsedSocialUrl.protocol !== "https:"
        ) {
          throw new EventMetadataValidationError(
            "Act social link must use http or https",
          );
        }
        sanitizedAct.socialUrl = parsedSocialUrl.toString();
      } catch (error) {
        if (error instanceof EventMetadataValidationError) {
          throw error;
        }
        throw new EventMetadataValidationError(
          "Act social link must be a valid URL",
        );
      }
    }

    if (isSecretGuest) {
      sanitizedAct.isSecretGuest = true;
      sanitizedAct.secretDisplayName =
        trimmedSecretDisplayName || DEFAULT_SECRET_GUEST_DISPLAY_NAME;
    }

    sanitizedActs.push(sanitizedAct);
  }

  return sanitizedActs.length > 0 ? sanitizedActs : undefined;
}
