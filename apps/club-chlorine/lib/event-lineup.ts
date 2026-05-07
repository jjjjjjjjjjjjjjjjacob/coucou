import type { EventAct } from "@/lib/types";

const DEFAULT_SECRET_GUEST_DISPLAY_NAME = "SECRET GUEST";

export interface PublicEventAct {
  displayName: string;
  descriptorBadges: string[];
  socialUrl?: string;
  isSecretGuest: boolean;
}

type EventLineupSource = {
  name: string;
  secondaryTitle?: string | null;
  acts?: EventAct[];
};

export function getPublicEventActs(event: EventLineupSource): PublicEventAct[] {
  const structuredActs = (event.acts ?? [])
    .map((act) => buildPublicEventAct(act))
    .filter((act): act is PublicEventAct => act !== null);

  if (structuredActs.length > 0) {
    return structuredActs;
  }

  return buildFallbackEventActs(event.name, event.secondaryTitle);
}

export function formatPublicEventActLabel(act: PublicEventAct): string {
  if (act.descriptorBadges.length === 0) {
    return act.displayName;
  }

  return `${act.displayName} (${act.descriptorBadges.join(" ")})`;
}

function buildPublicEventAct(act: EventAct): PublicEventAct | null {
  const isSecretGuest = act.isSecretGuest === true;
  const displayName = isSecretGuest
    ? act.secretDisplayName?.trim() || DEFAULT_SECRET_GUEST_DISPLAY_NAME
    : act.name.trim();

  if (!displayName) return null;

  return {
    displayName,
    descriptorBadges: (act.descriptorBadges ?? [])
      .map((descriptorBadge) => descriptorBadge.trim())
      .filter((descriptorBadge) => descriptorBadge.length > 0),
    socialUrl: isSecretGuest ? undefined : act.socialUrl,
    isSecretGuest,
  };
}

/**
 * Legacy fallback: split event titles on the editorial middle-dot separator
 * until every Club Chlorine event has structured acts.
 */
function buildFallbackEventActs(
  name: string,
  secondaryTitle: string | null | undefined,
): PublicEventAct[] {
  const lines: string[] = [];
  for (const namePart of name.split("·")) {
    const trimmedNamePart = namePart.trim();
    if (trimmedNamePart.length > 0) lines.push(trimmedNamePart);
  }
  if (secondaryTitle) {
    for (const titlePart of secondaryTitle.split("·")) {
      const trimmedTitlePart = titlePart.trim();
      if (trimmedTitlePart.length > 0) lines.push(trimmedTitlePart);
    }
  }

  const fallbackLines = lines.length > 0 ? lines : [name];
  return fallbackLines.map((line) => ({
    displayName: line,
    descriptorBadges: [],
    isSecretGuest: false,
  }));
}
