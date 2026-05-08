import type { EventAct } from "@/lib/types";

export const DEFAULT_SECRET_GUEST_DISPLAY_NAME = "SECRET GUEST";

export function sanitizeEventActsForSubmit(acts: EventAct[]): EventAct[] | undefined {
  const sanitizedActs = acts.flatMap((act) => {
    const name = act.name.trim();
    const descriptorBadges = (act.descriptorBadges ?? [])
      .map((descriptorBadge) => descriptorBadge.trim())
      .filter((descriptorBadge) => descriptorBadge.length > 0);
    const isSecretGuest = act.isSecretGuest === true;
    const secretDisplayName = act.secretDisplayName?.trim();
    const socialUrl = act.socialUrl?.trim();

    if (!name && !isSecretGuest) return [];

    const sanitizedAct: EventAct = {
      name,
      descriptorBadges: descriptorBadges.length > 0 ? descriptorBadges : undefined,
      socialUrl: socialUrl || undefined,
      isSecretGuest: isSecretGuest || undefined,
      secretDisplayName: isSecretGuest
        ? secretDisplayName || DEFAULT_SECRET_GUEST_DISPLAY_NAME
        : undefined,
    };
    return [sanitizedAct];
  });

  return sanitizedActs.length > 0 ? sanitizedActs : undefined;
}

export function formatActSummary(acts: EventAct[]): string {
  if (acts.length === 0) return "No acts";

  return acts
    .map((act) =>
      act.isSecretGuest
        ? act.secretDisplayName?.trim() || DEFAULT_SECRET_GUEST_DISPLAY_NAME
        : act.name.trim(),
    )
    .filter(Boolean)
    .join(", ");
}
