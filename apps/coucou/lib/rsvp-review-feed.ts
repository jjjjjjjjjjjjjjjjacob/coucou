import {
  DEFAULT_SOCIAL_PLATFORM_CONFIGS,
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import type { ApprovalStatusOption } from "@/components/rsvps/rsvp-controls";
import type { Event, HostRsvp } from "@/lib/types";

interface SearchParamsReader {
  get: (name: string) => string | null;
  getAll: (name: string) => string[];
}

interface BuildRsvpReviewFeedSearchParamsOptions {
  eventId: string;
  rsvpIds: readonly string[];
}

export interface RsvpReviewFeedDraftState {
  approvalStatus: ApprovalStatusOption;
  listKey: string;
}

export interface RsvpReviewFeedComparableState extends RsvpReviewFeedDraftState {
  rsvpId: string;
}

export interface RsvpReviewFeedDiffs {
  listUpdates: Array<{
    rsvpId: string;
    listKey: string;
  }>;
  approvalUpdates: Array<{
    rsvpId: string;
    approvalStatus: ApprovalStatusOption;
  }>;
}

export interface RsvpReviewFeedInstagramProfile {
  handle: string;
  profileUrl: string;
  embedUrl: string | null;
}

export function getRsvpReviewFeedSelectedIds(searchParams: SearchParamsReader): string[] {
  const repeatedRsvpIds = searchParams
    .getAll("rsvpId")
    .map((rsvpId) => rsvpId.trim())
    .filter((rsvpId) => rsvpId.length > 0);
  const commaSeparatedRsvpIds = (searchParams.get("rsvpIds") ?? "")
    .split(",")
    .map((rsvpId) => rsvpId.trim())
    .filter((rsvpId) => rsvpId.length > 0);

  const selectedRsvpIds: string[] = [];
  const seenRsvpIds = new Set<string>();
  for (const rsvpId of [...repeatedRsvpIds, ...commaSeparatedRsvpIds]) {
    if (seenRsvpIds.has(rsvpId)) {
      continue;
    }
    seenRsvpIds.add(rsvpId);
    selectedRsvpIds.push(rsvpId);
  }

  return selectedRsvpIds;
}

export function buildRsvpReviewFeedSearchParams({
  eventId,
  rsvpIds,
}: BuildRsvpReviewFeedSearchParamsOptions): URLSearchParams {
  const reviewFeedSearchParams = new URLSearchParams();
  reviewFeedSearchParams.set("eventId", eventId);
  for (const rsvpId of rsvpIds) {
    reviewFeedSearchParams.append("rsvpId", rsvpId);
  }
  return reviewFeedSearchParams;
}

export function getRsvpReviewFeedDiffs(
  baselineStates: readonly RsvpReviewFeedComparableState[],
  draftStatesByRsvpId: Record<string, RsvpReviewFeedDraftState | undefined>,
): RsvpReviewFeedDiffs {
  const listUpdates: RsvpReviewFeedDiffs["listUpdates"] = [];
  const approvalUpdates: RsvpReviewFeedDiffs["approvalUpdates"] = [];

  for (const baselineState of baselineStates) {
    const draftState = draftStatesByRsvpId[baselineState.rsvpId];
    if (!draftState) {
      continue;
    }
    if (draftState.listKey !== baselineState.listKey) {
      listUpdates.push({
        rsvpId: baselineState.rsvpId,
        listKey: draftState.listKey,
      });
    }
    if (draftState.approvalStatus !== baselineState.approvalStatus) {
      approvalUpdates.push({
        rsvpId: baselineState.rsvpId,
        approvalStatus: draftState.approvalStatus,
      });
    }
  }

  return {
    listUpdates,
    approvalUpdates,
  };
}

function getDefaultInstagramProfileUrlPrefix(): string {
  return (
    DEFAULT_SOCIAL_PLATFORM_CONFIGS.find((platform) => platform.platformKey === "instagram")
      ?.profileUrlPrefix ?? "https://instagram.com/"
  );
}

function buildSocialProfileUrl(profileUrlPrefix: string, handle: string): string {
  const normalizedProfileUrlPrefix = profileUrlPrefix.trim();
  if (normalizedProfileUrlPrefix.endsWith("/") || normalizedProfileUrlPrefix.endsWith("@")) {
    return `${normalizedProfileUrlPrefix}${handle}`;
  }
  return `${normalizedProfileUrlPrefix}/${handle}`;
}

function isSupportedInstagramHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === "instagram.com" || normalizedHostname === "www.instagram.com";
}

function getInstagramEmbedPath(pathSegments: string[]): string | null {
  const normalizedPathSegments =
    pathSegments[pathSegments.length - 1] === "embed" ? pathSegments.slice(0, -1) : pathSegments;
  const firstPathSegment = normalizedPathSegments[0];
  const secondPathSegment = normalizedPathSegments[1];
  if (!firstPathSegment) {
    return null;
  }

  if (
    (firstPathSegment === "p" || firstPathSegment === "reel" || firstPathSegment === "tv") &&
    secondPathSegment
  ) {
    return `/${firstPathSegment}/${secondPathSegment}/embed`;
  }

  const unsupportedFirstPathSegments = new Set([
    "accounts",
    "about",
    "api",
    "developer",
    "developers",
    "directory",
    "explore",
    "legal",
    "oauth",
    "stories",
  ]);
  if (unsupportedFirstPathSegments.has(firstPathSegment)) {
    return null;
  }

  return `/${firstPathSegment}/embed`;
}

export function getInstagramEmbedUrl(instagramUrl: string): string | null {
  try {
    const parsedInstagramUrl = new URL(instagramUrl);
    if (!isSupportedInstagramHost(parsedInstagramUrl.hostname)) {
      return null;
    }

    const instagramEmbedPath = getInstagramEmbedPath(
      parsedInstagramUrl.pathname
        .split("/")
        .map((pathSegment) => pathSegment.trim())
        .filter((pathSegment) => pathSegment.length > 0),
    );
    return instagramEmbedPath ? `https://www.instagram.com${instagramEmbedPath}` : null;
  } catch {
    return null;
  }
}

export function getRsvpReviewFeedInstagramProfile(
  rsvp: HostRsvp,
  event: Event | null | undefined,
): RsvpReviewFeedInstagramProfile | null {
  const instagramPlatformConfig = event?.primaryFieldConfig?.socialPlatforms?.find(
    (platform) => normalizeSocialPlatformKey(platform.platformKey) === "instagram",
  );
  const instagramProfile = rsvp.socialProfiles.find(
    (profile) => normalizeSocialPlatformKey(profile.platformKey) === "instagram",
  );
  const normalizedHandle = normalizeSocialHandleInput(instagramProfile?.handle, "instagram");
  if (!normalizedHandle) {
    return null;
  }

  const profileUrlPrefix =
    instagramPlatformConfig?.profileUrlPrefix?.trim() || getDefaultInstagramProfileUrlPrefix();
  const profileUrl = buildSocialProfileUrl(profileUrlPrefix, normalizedHandle);

  return {
    handle: normalizedHandle,
    profileUrl,
    embedUrl: getInstagramEmbedUrl(profileUrl),
  };
}
