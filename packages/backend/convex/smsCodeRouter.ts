import {
  normalizeSocialHandleInput,
  normalizeSocialPlatformKey,
} from "@coucou/sdk/shared/primary-fields";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./functions";
import { isGuestClerkUserId } from "./lib/guestIdentity";
import { normalizeAndHashPhoneNumber } from "./lib/phoneHash";
import { obfuscatePhoneNumber } from "./lib/phoneUtils";
import {
  isSocialProfileFieldKey,
  socialPlatformKeyFromProfileFieldKey,
} from "./lib/profileValueRecords";
import { submitRsvpThroughSharedService } from "./lib/rsvpSubmissionService";
import {
  buildSmsRsvpFieldPrompt,
  isSmsExecutableEvent,
  normalizeSmsCode,
  SMS_RSVP_SESSION_DURATION_MS,
} from "./lib/smsCodeRouting";
import { recordSmsConversationMessage } from "./lib/smsConversationRecords";
import { formatSmsMessageForSite } from "./lib/smsProgramCopy";

const INBOUND_RECEIPT_RETRY_AFTER_MS = 5 * 60 * 1000;

type MissingField = Doc<"smsRsvpSessions">["missingFields"][number];
type SessionValues = Pick<
  Doc<"smsRsvpSessions">,
  "firstName" | "lastName" | "socialProfiles" | "invitedByName" | "customFieldValues"
>;

type EventCodeRoute = {
  kind: "event_code";
  event: Doc<"events">;
  listCredential: Doc<"listCredentials">;
  listKey: string;
  normalizedCode: string;
};

type ActionCodeRoute = {
  kind: "blast_action";
  event: Doc<"events">;
  listCredential: Doc<"listCredentials">;
  listKey: string;
  normalizedCode: string;
  replyAction: Doc<"textBlastReplyActions">;
  textBlast: Doc<"textBlasts">;
  delivery: Doc<"textBlastRecipients">;
};

type SmsCodeRoute = EventCodeRoute | ActionCodeRoute;

type RouteResolution =
  | { status: "matched"; route: SmsCodeRoute }
  | { status: "conflict" }
  | { status: "not_eligible" }
  | { status: "unmatched" };

type SmsIdentity = {
  clerkUserId: string;
  registeredUser?: Doc<"users">;
  participantClerkUserIds: string[];
  ambiguous: boolean;
};

type ProcessedInboundResult = {
  duplicate?: boolean;
  shouldRespond: boolean;
  responseMessage?: string;
  outcome:
    | "unmatched_message"
    | "not_eligible"
    | "session_pending"
    | "submitted"
    | "existing"
    | "conflict"
    | "target_unavailable"
    | "invalid_values";
  targetEventId?: Id<"events">;
  phoneHash?: string;
  phoneObfuscated?: string;
  participantClerkUserIds?: string[];
};

function eventSharesWorkspace(
  candidateEvent: Doc<"events">,
  destinationEvent: Doc<"events">,
): boolean {
  if (destinationEvent.workspaceSlug) {
    return candidateEvent.workspaceSlug === destinationEvent.workspaceSlug;
  }
  return Boolean(destinationEvent.siteKey && candidateEvent.siteKey === destinationEvent.siteKey);
}

function profileGrantSharesWorkspace(
  profileGrant: Doc<"workspaceProfileValueGrants">,
  destinationEvent: Doc<"events">,
): boolean {
  if (destinationEvent.workspaceSlug) {
    return profileGrant.workspaceSlug === destinationEvent.workspaceSlug;
  }
  return Boolean(destinationEvent.siteKey && profileGrant.siteKey === destinationEvent.siteKey);
}

async function findEventCodeRoutes(
  ctx: MutationCtx,
  normalizedCode: string,
  now: number,
): Promise<EventCodeRoute[]> {
  const credentials = await ctx.db
    .query("listCredentials")
    .withIndex("by_passwordNormalized", (queryBuilder) =>
      queryBuilder.eq("passwordNormalized", normalizedCode),
    )
    .collect();
  const routes: EventCodeRoute[] = [];
  for (const listCredential of credentials) {
    const event = await ctx.db.get(listCredential.eventId);
    if (!event || !isSmsExecutableEvent(event, now)) continue;
    routes.push({
      kind: "event_code",
      event,
      listCredential,
      listKey: listCredential.listKey,
      normalizedCode,
    });
  }
  return routes;
}

async function findExecutableActionRoutes(
  ctx: MutationCtx,
  normalizedCode: string,
  phoneHash: string,
  now: number,
): Promise<{ executableCount: number; eligibleRoutes: ActionCodeRoute[] }> {
  const replyActions = await ctx.db
    .query("textBlastReplyActions")
    .withIndex("by_code", (queryBuilder) => queryBuilder.eq("replyCodeNormalized", normalizedCode))
    .collect();
  let executableCount = 0;
  const eligibleRoutes: ActionCodeRoute[] = [];

  for (const replyAction of replyActions) {
    if (!replyAction.isEnabled) continue;
    const event = await ctx.db.get(replyAction.targetEventId);
    if (!event || !isSmsExecutableEvent(event, now)) continue;
    const listCredential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (queryBuilder) =>
        queryBuilder.eq("eventId", event._id).eq("listKey", replyAction.targetListKey),
      )
      .unique();
    const textBlast = await ctx.db.get(replyAction.textBlastId);
    if (!listCredential || !textBlast) continue;
    executableCount += 1;

    const delivery = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_phone", (queryBuilder) =>
        queryBuilder.eq("textBlastId", textBlast._id).eq("phoneHash", phoneHash),
      )
      .unique();
    if (!delivery || delivery.status !== "sent") continue;
    eligibleRoutes.push({
      kind: "blast_action",
      event,
      listCredential,
      listKey: replyAction.targetListKey,
      normalizedCode,
      replyAction,
      textBlast,
      delivery,
    });
  }

  return { executableCount, eligibleRoutes };
}

async function ensureResolvedRouteClaim(
  ctx: MutationCtx,
  route: SmsCodeRoute,
  phoneHash: string,
  now: number,
): Promise<boolean> {
  const claimPhoneHash = route.kind === "blast_action" ? phoneHash : undefined;
  const claims = await ctx.db
    .query("smsCodeClaims")
    .withIndex("by_code_phone", (queryBuilder) =>
      queryBuilder.eq("normalizedCode", route.normalizedCode).eq("phoneHash", claimPhoneHash),
    )
    .collect();
  const liveClaims = claims.filter(
    (claim) =>
      claim.status === "active" ||
      (claim.reservationExpiresAt !== undefined && claim.reservationExpiresAt > now),
  );
  const ownsClaim = liveClaims.some((claim) =>
    route.kind === "event_code"
      ? claim.kind === "event_list" && claim.listCredentialId === route.listCredential._id
      : claim.kind === "blast_action" && claim.replyActionId === route.replyAction._id,
  );
  if (liveClaims.length > 0 && !ownsClaim) {
    return false;
  }
  if (ownsClaim) {
    return true;
  }

  await ctx.db.insert("smsCodeClaims", {
    normalizedCode: route.normalizedCode,
    kind: route.kind === "event_code" ? "event_list" : "blast_action",
    eventId: route.event._id,
    listCredentialId: route.listCredential._id,
    replyActionId: route.kind === "blast_action" ? route.replyAction._id : undefined,
    textBlastId: route.kind === "blast_action" ? route.textBlast._id : undefined,
    phoneHash: claimPhoneHash,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return true;
}

async function resolveSmsCode(
  ctx: MutationCtx,
  normalizedCode: string,
  phoneHash: string,
  now: number,
): Promise<RouteResolution> {
  if (!normalizedCode) return { status: "unmatched" };
  const eventRoutes = await findEventCodeRoutes(ctx, normalizedCode, now);
  const actionRoutes = await findExecutableActionRoutes(ctx, normalizedCode, phoneHash, now);

  if (
    eventRoutes.length > 1 ||
    (eventRoutes.length > 0 && actionRoutes.executableCount > 0) ||
    actionRoutes.eligibleRoutes.length > 1
  ) {
    return { status: "conflict" };
  }

  const route = eventRoutes[0] ?? actionRoutes.eligibleRoutes[0];
  if (route) {
    const claimIsValid = await ensureResolvedRouteClaim(ctx, route, phoneHash, now);
    return claimIsValid ? { status: "matched", route } : { status: "conflict" };
  }
  if (actionRoutes.executableCount > 0) {
    return { status: "not_eligible" };
  }
  return { status: "unmatched" };
}

async function findActiveSession(
  ctx: MutationCtx,
  phoneHash: string,
  now: number,
): Promise<Doc<"smsRsvpSessions"> | null> {
  const sessions = await ctx.db
    .query("smsRsvpSessions")
    .withIndex("by_phone_status", (queryBuilder) =>
      queryBuilder.eq("phoneHash", phoneHash).eq("status", "active"),
    )
    .collect();
  const orderedSessions = sessions.sort(
    (firstSession, secondSession) => secondSession.updatedAt - firstSession.updatedAt,
  );
  let activeSession: Doc<"smsRsvpSessions"> | null = null;
  for (const session of orderedSessions) {
    if (session.expiresAt <= now) {
      await ctx.db.patch(session._id, { status: "expired", updatedAt: now });
    } else if (!activeSession) {
      activeSession = session;
    } else {
      await ctx.db.patch(session._id, { status: "cancelled", updatedAt: now });
    }
  }
  return activeSession;
}

async function cancelActiveSessions(
  ctx: MutationCtx,
  phoneHash: string,
  now: number,
): Promise<void> {
  const sessions = await ctx.db
    .query("smsRsvpSessions")
    .withIndex("by_phone_status", (queryBuilder) =>
      queryBuilder.eq("phoneHash", phoneHash).eq("status", "active"),
    )
    .collect();
  for (const session of sessions) {
    await ctx.db.patch(session._id, { status: "cancelled", updatedAt: now });
  }
}

async function resolveRegisteredUsers(
  ctx: MutationCtx,
  normalizedPhoneNumber: string,
  rawPhoneNumber: string,
  participantClerkUserIds: readonly string[],
): Promise<Doc<"users">[]> {
  const usersByIdentifier = new Map<string, Doc<"users">>();
  const directPhoneValues = Array.from(new Set([normalizedPhoneNumber, rawPhoneNumber.trim()]));
  for (const phoneValue of directPhoneValues) {
    const phoneUsers = await ctx.db
      .query("users")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phone", phoneValue))
      .collect();
    for (const user of phoneUsers) {
      if (user.clerkUserId && !isGuestClerkUserId(user.clerkUserId)) {
        usersByIdentifier.set(user.clerkUserId, user);
      }
    }
  }

  for (const clerkUserId of participantClerkUserIds) {
    if (isGuestClerkUserId(clerkUserId) || usersByIdentifier.has(clerkUserId)) {
      continue;
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (queryBuilder) => queryBuilder.eq("clerkUserId", clerkUserId))
      .unique();
    if (user) usersByIdentifier.set(clerkUserId, user);
  }

  return Array.from(usersByIdentifier.values());
}

async function resolveSmsIdentity(
  ctx: MutationCtx,
  route: SmsCodeRoute,
  rawPhoneNumber: string,
  normalizedPhoneNumber: string,
  phoneHash: string,
): Promise<SmsIdentity> {
  const threadParticipants = (
    await ctx.db
      .query("smsConversationThreads")
      .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", phoneHash))
      .collect()
  ).flatMap((thread) => thread.participantClerkUserIds);
  const deliveryParticipants =
    route.kind === "blast_action" ? route.delivery.recipientClerkUserIds : [];
  const registeredUsers = await resolveRegisteredUsers(ctx, normalizedPhoneNumber, rawPhoneNumber, [
    ...threadParticipants,
    ...deliveryParticipants,
  ]);
  const participantClerkUserIds = Array.from(
    new Set([
      ...threadParticipants,
      ...deliveryParticipants,
      ...registeredUsers
        .map((user) => user.clerkUserId)
        .filter((clerkUserId): clerkUserId is string => Boolean(clerkUserId)),
    ]),
  );

  if (registeredUsers.length === 1 && registeredUsers[0].clerkUserId) {
    return {
      clerkUserId: registeredUsers[0].clerkUserId,
      registeredUser: registeredUsers[0],
      participantClerkUserIds,
      ambiguous: false,
    };
  }

  return {
    clerkUserId: `guest:${phoneHash}`,
    participantClerkUserIds,
    ambiguous: registeredUsers.length > 1,
  };
}

async function findMostRecentWorkspaceRsvp(
  ctx: MutationCtx,
  route: SmsCodeRoute,
  identity: SmsIdentity,
  phoneHash: string,
): Promise<Doc<"rsvps"> | null> {
  if (route.kind === "blast_action" && !identity.ambiguous) {
    const sourceRsvps = (
      await Promise.all(route.delivery.sourceRsvpIds.map((rsvpId) => ctx.db.get(rsvpId)))
    )
      .filter((rsvp): rsvp is Doc<"rsvps"> => rsvp !== null)
      .filter((rsvp) => rsvp.clerkUserId === identity.clerkUserId)
      .sort((firstRsvp, secondRsvp) => secondRsvp.updatedAt - firstRsvp.updatedAt);
    if (sourceRsvps[0]) return sourceRsvps[0];
  }

  const candidateRsvps = identity.registeredUser
    ? await ctx.db
        .query("rsvps")
        .withIndex("by_user", (queryBuilder) =>
          queryBuilder.eq("clerkUserId", identity.clerkUserId),
        )
        .collect()
    : await ctx.db
        .query("rsvps")
        .withIndex("by_guestPhoneHash", (queryBuilder) =>
          queryBuilder.eq("guestPhoneHash", phoneHash),
        )
        .collect();
  const matchingRsvps: Doc<"rsvps">[] = [];
  for (const rsvp of candidateRsvps) {
    if (!identity.registeredUser && rsvp.clerkUserId !== identity.clerkUserId) {
      continue;
    }
    const candidateEvent = await ctx.db.get(rsvp.eventId);
    if (candidateEvent && eventSharesWorkspace(candidateEvent, route.event)) {
      matchingRsvps.push(rsvp);
    }
  }
  return (
    matchingRsvps.sort((firstRsvp, secondRsvp) => secondRsvp.updatedAt - firstRsvp.updatedAt)[0] ??
    null
  );
}

function splitFullName(fullName: string | null | undefined): {
  firstName?: string;
  lastName?: string;
} {
  const nameParts = fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (nameParts.length < 2) return {};
  return {
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(" "),
  };
}

async function getWorkspaceGrantedSocialProfiles(
  ctx: MutationCtx,
  route: SmsCodeRoute,
  identity: SmsIdentity,
): Promise<Array<{ platformKey: string; handle: string }>> {
  if (!identity.registeredUser) return [];
  const grants = await ctx.db
    .query("workspaceProfileValueGrants")
    .withIndex("by_user", (queryBuilder) => queryBuilder.eq("clerkUserId", identity.clerkUserId))
    .collect();
  const profiles: Array<{ platformKey: string; handle: string }> = [];
  for (const grant of grants) {
    if (
      grant.revokedAt !== undefined ||
      !isSocialProfileFieldKey(grant.fieldKey) ||
      !profileGrantSharesWorkspace(grant, route.event)
    ) {
      continue;
    }
    const fieldValue = await ctx.db.get(grant.profileFieldValueId);
    const platformKey = socialPlatformKeyFromProfileFieldKey(grant.fieldKey);
    if (fieldValue && platformKey) {
      profiles.push({ platformKey, handle: fieldValue.value });
    }
  }
  return profiles;
}

async function buildInitialSessionValues(
  ctx: MutationCtx,
  route: SmsCodeRoute,
  identity: SmsIdentity,
  phoneHash: string,
): Promise<SessionValues> {
  if (identity.ambiguous) {
    return {
      socialProfiles: [],
      customFieldValues: {},
    };
  }

  const sourceRsvp = await findMostRecentWorkspaceRsvp(ctx, route, identity, phoneHash);
  const registeredName = identity.registeredUser
    ? {
        firstName: identity.registeredUser.firstName?.trim() || undefined,
        lastName: identity.registeredUser.lastName?.trim() || undefined,
      }
    : {};
  const rsvpName = splitFullName(sourceRsvp?.userName);
  const sourceSocialProfiles = sourceRsvp
    ? await ctx.db
        .query("rsvpSocialProfiles")
        .withIndex("by_rsvp", (queryBuilder) => queryBuilder.eq("rsvpId", sourceRsvp._id))
        .collect()
    : [];
  const grantedSocialProfiles = await getWorkspaceGrantedSocialProfiles(ctx, route, identity);
  const socialProfilesByPlatform = new Map<string, { platformKey: string; handle: string }>();
  for (const profile of [...grantedSocialProfiles, ...sourceSocialProfiles]) {
    const platformKey = normalizeSocialPlatformKey(profile.platformKey);
    if (platformKey && !socialProfilesByPlatform.has(platformKey)) {
      socialProfilesByPlatform.set(platformKey, {
        platformKey,
        handle: profile.handle,
      });
    }
  }

  const customFieldValues: Record<string, string> = {};
  for (const field of route.event.customFields ?? []) {
    const value = sourceRsvp?.customFieldValues?.[field.key]?.trim();
    if (value) customFieldValues[field.key] = value;
  }
  return {
    firstName: registeredName.firstName ?? rsvpName.firstName,
    lastName: registeredName.lastName ?? rsvpName.lastName,
    socialProfiles: Array.from(socialProfilesByPlatform.values()),
    invitedByName: sourceRsvp?.invitedByName,
    customFieldValues,
  };
}

function collectMissingFields(event: Doc<"events">, values: SessionValues): MissingField[] {
  const missingFields: MissingField[] = [];
  if (!values.firstName?.trim() || !values.lastName?.trim()) {
    missingFields.push({
      kind: "full_name",
      key: "full_name",
      label: "your full name",
    });
  }
  const socialProfilesByPlatform = new Map(
    values.socialProfiles.map((profile) => [
      normalizeSocialPlatformKey(profile.platformKey),
      profile.handle,
    ]),
  );
  for (const platform of event.primaryFieldConfig?.socialPlatforms ?? []) {
    if (platform.required !== true) continue;
    const platformKey = normalizeSocialPlatformKey(platform.platformKey);
    const handle = socialProfilesByPlatform.get(platformKey)?.trim();
    if (!platformKey || handle) continue;
    missingFields.push({
      kind: "social",
      key: platformKey,
      label: platform.label,
    });
  }
  const invitedByConfig = event.primaryFieldConfig?.invitedBy;
  if (
    invitedByConfig?.enabled === true &&
    invitedByConfig.required === true &&
    !values.invitedByName?.trim()
  ) {
    missingFields.push({
      kind: "invited_by",
      key: "invited_by",
      label: invitedByConfig.label?.trim() || "who invited you",
    });
  }
  for (const field of event.customFields ?? []) {
    if (field.required === true && !values.customFieldValues[field.key]?.trim()) {
      missingFields.push({
        kind: "custom",
        key: field.key,
        label: field.label,
      });
    }
  }
  return missingFields;
}

function routeSessionReferencePatch(
  route: SmsCodeRoute,
): Pick<
  Doc<"smsRsvpSessions">,
  "listCredentialId" | "replyActionId" | "textBlastId" | "textBlastRecipientId"
> {
  return {
    listCredentialId: route.listCredential._id,
    replyActionId: route.kind === "blast_action" ? route.replyAction._id : undefined,
    textBlastId: route.kind === "blast_action" ? route.textBlast._id : undefined,
    textBlastRecipientId: route.kind === "blast_action" ? route.delivery._id : undefined,
  };
}

async function recordResolvedInbound(
  ctx: MutationCtx,
  args: {
    route: SmsCodeRoute;
    phoneHash: string;
    phoneObfuscated: string;
    participantClerkUserIds: string[];
    body: string;
    providerMessageId: string;
    rawPayload?: Record<string, string>;
    receivedAt: number;
  },
): Promise<void> {
  await recordSmsConversationMessage(ctx, {
    eventId: args.route.event._id,
    phoneHash: args.phoneHash,
    phoneObfuscated: args.phoneObfuscated,
    participantClerkUserIds: args.participantClerkUserIds,
    direction: "inbound",
    kind: "sms",
    body: args.body,
    providerMessageId: args.providerMessageId,
    providerStatus: "received",
    textBlastId: args.route.kind === "blast_action" ? args.route.textBlast._id : undefined,
    textBlastRecipientId: args.route.kind === "blast_action" ? args.route.delivery._id : undefined,
    rawPayload: args.rawPayload,
    createdAt: args.receivedAt,
  });
}

async function recordOrdinaryInbound(
  ctx: MutationCtx,
  args: {
    phoneHash: string;
    phoneObfuscated: string;
    body: string;
    providerMessageId: string;
    rawPayload?: Record<string, string>;
    receivedAt: number;
  },
): Promise<void> {
  const threads = await ctx.db
    .query("smsConversationThreads")
    .withIndex("by_phone", (queryBuilder) => queryBuilder.eq("phoneHash", args.phoneHash))
    .collect();
  const thread = threads
    .filter((candidateThread) => candidateThread.lastOutboundAt !== undefined)
    .sort(
      (firstThread, secondThread) =>
        (secondThread.lastOutboundAt ?? 0) - (firstThread.lastOutboundAt ?? 0),
    )[0];
  if (!thread) return;

  await recordSmsConversationMessage(ctx, {
    eventId: thread.eventId,
    phoneHash: args.phoneHash,
    phoneObfuscated: thread.phoneObfuscated || args.phoneObfuscated,
    participantClerkUserIds: thread.participantClerkUserIds,
    direction: "inbound",
    kind: "sms",
    body: args.body,
    providerMessageId: args.providerMessageId,
    providerStatus: "received",
    rawPayload: args.rawPayload,
    createdAt: args.receivedAt,
  });
}

async function revalidateSessionRoute(
  ctx: MutationCtx,
  session: Doc<"smsRsvpSessions">,
  now: number,
): Promise<SmsCodeRoute | null> {
  const event = await ctx.db.get(session.eventId);
  const listCredential = session.listCredentialId
    ? await ctx.db.get(session.listCredentialId)
    : null;
  if (
    !event ||
    !listCredential ||
    listCredential.eventId !== event._id ||
    listCredential.listKey !== session.listKey ||
    !isSmsExecutableEvent(event, now)
  ) {
    return null;
  }
  if (session.sourceKind === "event_code") {
    if (listCredential.passwordNormalized !== session.normalizedCode) return null;
    return {
      kind: "event_code",
      event,
      listCredential,
      listKey: session.listKey,
      normalizedCode: session.normalizedCode,
    };
  }

  const replyAction = session.replyActionId ? await ctx.db.get(session.replyActionId) : null;
  const textBlast = session.textBlastId ? await ctx.db.get(session.textBlastId) : null;
  const delivery = session.textBlastRecipientId
    ? await ctx.db.get(session.textBlastRecipientId)
    : null;
  if (
    !replyAction ||
    !replyAction.isEnabled ||
    replyAction.replyCodeNormalized !== session.normalizedCode ||
    replyAction.targetEventId !== event._id ||
    replyAction.targetListKey !== session.listKey ||
    !textBlast ||
    replyAction.textBlastId !== textBlast._id ||
    !delivery ||
    delivery.textBlastId !== textBlast._id ||
    delivery.phoneHash !== session.phoneHash ||
    delivery.status !== "sent"
  ) {
    return null;
  }
  return {
    kind: "blast_action",
    event,
    listCredential,
    listKey: session.listKey,
    normalizedCode: session.normalizedCode,
    replyAction,
    textBlast,
    delivery,
  };
}

async function finalizeSessionSubmission(
  ctx: MutationCtx,
  args: {
    session: Doc<"smsRsvpSessions">;
    route: SmsCodeRoute;
    identity: SmsIdentity;
    normalizedPhoneNumber: string;
    now: number;
  },
): Promise<ProcessedInboundResult> {
  const submissionResult = await submitRsvpThroughSharedService(ctx, {
    submissionOrigin: "sms",
    event: args.route.event,
    listKey: args.route.listKey,
    clerkUserId: args.session.clerkUserId,
    registeredUser: args.identity.registeredUser,
    firstName: args.session.firstName ?? "",
    lastName: args.session.lastName ?? "",
    socialProfiles: args.session.socialProfiles,
    invitedByName: args.session.invitedByName,
    customFieldValues: args.session.customFieldValues,
    smsConsent: true,
    guestPhoneHash: args.identity.registeredUser ? undefined : args.session.phoneHash,
    guestPhoneObfuscated: args.identity.registeredUser ? undefined : args.session.phoneObfuscated,
    normalizedPhoneNumber: args.identity.registeredUser ? undefined : args.normalizedPhoneNumber,
    now: args.now,
  });
  await ctx.db.patch(args.session._id, {
    status: "completed",
    missingFields: [],
    updatedAt: args.now,
  });
  return {
    shouldRespond: Boolean(submissionResult.responseMessage),
    responseMessage: submissionResult.responseMessage,
    outcome: submissionResult.disposition === "existing" ? "existing" : "submitted",
    targetEventId: args.route.event._id,
    phoneHash: args.session.phoneHash,
    phoneObfuscated: args.session.phoneObfuscated,
    participantClerkUserIds: args.identity.participantClerkUserIds,
  };
}

async function startRouteSession(
  ctx: MutationCtx,
  args: {
    route: SmsCodeRoute;
    rawPhoneNumber: string;
    normalizedPhoneNumber: string;
    phoneHash: string;
    phoneObfuscated: string;
    body: string;
    providerMessageId: string;
    rawPayload?: Record<string, string>;
    receivedAt: number;
  },
): Promise<ProcessedInboundResult> {
  await cancelActiveSessions(ctx, args.phoneHash, args.receivedAt);
  const identity = await resolveSmsIdentity(
    ctx,
    args.route,
    args.rawPhoneNumber,
    args.normalizedPhoneNumber,
    args.phoneHash,
  );
  const initialValues = await buildInitialSessionValues(ctx, args.route, identity, args.phoneHash);
  const missingFields = collectMissingFields(args.route.event, initialValues);
  const sessionId = await ctx.db.insert("smsRsvpSessions", {
    phoneHash: args.phoneHash,
    phoneObfuscated: args.phoneObfuscated,
    eventId: args.route.event._id,
    listKey: args.route.listKey,
    sourceKind: args.route.kind,
    normalizedCode: args.route.normalizedCode,
    ...routeSessionReferencePatch(args.route),
    clerkUserId: identity.clerkUserId,
    registeredUserId: identity.registeredUser?._id,
    ...initialValues,
    missingFields,
    status: "active",
    expiresAt: args.receivedAt + SMS_RSVP_SESSION_DURATION_MS,
    createdAt: args.receivedAt,
    updatedAt: args.receivedAt,
  });
  const session = await ctx.db.get(sessionId);
  if (!session) throw new Error("SMS RSVP session could not be created");
  await recordResolvedInbound(ctx, {
    route: args.route,
    phoneHash: args.phoneHash,
    phoneObfuscated: args.phoneObfuscated,
    participantClerkUserIds: identity.participantClerkUserIds,
    body: args.body,
    providerMessageId: args.providerMessageId,
    rawPayload: args.rawPayload,
    receivedAt: args.receivedAt,
  });

  if (missingFields.length === 0) {
    return await finalizeSessionSubmission(ctx, {
      session,
      route: args.route,
      identity,
      normalizedPhoneNumber: args.normalizedPhoneNumber,
      now: args.receivedAt,
    });
  }
  const responseMessage = formatSmsMessageForSite(
    args.route.event.siteKey,
    buildSmsRsvpFieldPrompt(missingFields.map((field) => field.label)),
  );
  return {
    shouldRespond: true,
    responseMessage,
    outcome: "session_pending",
    targetEventId: args.route.event._id,
    phoneHash: args.phoneHash,
    phoneObfuscated: args.phoneObfuscated,
    participantClerkUserIds: identity.participantClerkUserIds,
  };
}

function applySessionValue(
  values: SessionValues,
  field: MissingField,
  rawValue: string,
): { values: SessionValues; valid: boolean } {
  const value = rawValue.trim();
  if (!value) return { values, valid: false };
  if (field.kind === "full_name") {
    const name = splitFullName(value);
    if (!name.firstName || !name.lastName) return { values, valid: false };
    return { values: { ...values, ...name }, valid: true };
  }
  if (field.kind === "social") {
    const handle = normalizeSocialHandleInput(value, field.key);
    if (!handle) return { values, valid: false };
    return {
      values: {
        ...values,
        socialProfiles: [
          ...values.socialProfiles.filter(
            (profile) => normalizeSocialPlatformKey(profile.platformKey) !== field.key,
          ),
          { platformKey: field.key, handle },
        ],
      },
      valid: true,
    };
  }
  if (field.kind === "invited_by") {
    return { values: { ...values, invitedByName: value }, valid: true };
  }
  return {
    values: {
      ...values,
      customFieldValues: { ...values.customFieldValues, [field.key]: value },
    },
    valid: true,
  };
}

async function continueRouteSession(
  ctx: MutationCtx,
  args: {
    session: Doc<"smsRsvpSessions">;
    rawPhoneNumber: string;
    normalizedPhoneNumber: string;
    phoneHash: string;
    phoneObfuscated: string;
    body: string;
    providerMessageId: string;
    rawPayload?: Record<string, string>;
    receivedAt: number;
  },
): Promise<ProcessedInboundResult> {
  const route = await revalidateSessionRoute(ctx, args.session, args.receivedAt);
  if (!route) {
    await ctx.db.patch(args.session._id, {
      status: "cancelled",
      updatedAt: args.receivedAt,
    });
    const event = await ctx.db.get(args.session.eventId);
    if (event) {
      await recordSmsConversationMessage(ctx, {
        eventId: event._id,
        phoneHash: args.phoneHash,
        phoneObfuscated: args.phoneObfuscated,
        direction: "inbound",
        kind: "sms",
        body: args.body,
        providerMessageId: args.providerMessageId,
        providerStatus: "received",
        rawPayload: args.rawPayload,
        createdAt: args.receivedAt,
      });
    }
    return {
      shouldRespond: true,
      responseMessage: formatSmsMessageForSite(
        event?.siteKey,
        "This RSVP is no longer accepting responses.",
      ),
      outcome: "target_unavailable",
      targetEventId: event?._id,
      phoneHash: args.phoneHash,
      phoneObfuscated: args.phoneObfuscated,
      participantClerkUserIds: [],
    };
  }

  const identity = await resolveSmsIdentity(
    ctx,
    route,
    args.rawPhoneNumber,
    args.normalizedPhoneNumber,
    args.phoneHash,
  );
  const currentValues: SessionValues = {
    firstName: args.session.firstName,
    lastName: args.session.lastName,
    socialProfiles: args.session.socialProfiles,
    invitedByName: args.session.invitedByName,
    customFieldValues: args.session.customFieldValues,
  };
  const currentMissingFields = collectMissingFields(route.event, currentValues);
  const submittedValues = args.body.split(",").map((value) => value.trim());
  await recordResolvedInbound(ctx, {
    route,
    phoneHash: args.phoneHash,
    phoneObfuscated: args.phoneObfuscated,
    participantClerkUserIds: identity.participantClerkUserIds,
    body: args.body,
    providerMessageId: args.providerMessageId,
    rawPayload: args.rawPayload,
    receivedAt: args.receivedAt,
  });

  if (submittedValues.length > currentMissingFields.length) {
    return {
      shouldRespond: true,
      responseMessage: formatSmsMessageForSite(
        route.event.siteKey,
        `Too many values were provided. ${buildSmsRsvpFieldPrompt(
          currentMissingFields.map((field) => field.label),
        )}`,
      ),
      outcome: "invalid_values",
      targetEventId: route.event._id,
      phoneHash: args.phoneHash,
      phoneObfuscated: args.phoneObfuscated,
      participantClerkUserIds: identity.participantClerkUserIds,
    };
  }

  let nextValues = currentValues;
  let hadInvalidValue = false;
  let hadInvalidFullName = false;
  for (const [valueIndex, submittedValue] of submittedValues.entries()) {
    const missingField = currentMissingFields[valueIndex];
    if (!missingField) break;
    const result = applySessionValue(nextValues, missingField, submittedValue);
    nextValues = result.values;
    hadInvalidValue ||= !result.valid;
    hadInvalidFullName ||= !result.valid && missingField.kind === "full_name";
  }
  const nextMissingFields = collectMissingFields(route.event, nextValues);
  await ctx.db.patch(args.session._id, {
    ...nextValues,
    missingFields: nextMissingFields,
    expiresAt: args.receivedAt + SMS_RSVP_SESSION_DURATION_MS,
    updatedAt: args.receivedAt,
  });
  const updatedSession = await ctx.db.get(args.session._id);
  if (!updatedSession) throw new Error("SMS RSVP session was removed");

  if (nextMissingFields.length > 0) {
    const invalidPrefix = hadInvalidFullName
      ? "A full name must include first and last name. "
      : hadInvalidValue
        ? "One or more values could not be used. "
        : "";
    return {
      shouldRespond: true,
      responseMessage: formatSmsMessageForSite(
        route.event.siteKey,
        `${invalidPrefix}${buildSmsRsvpFieldPrompt(nextMissingFields.map((field) => field.label))}`,
      ),
      outcome: hadInvalidValue ? "invalid_values" : "session_pending",
      targetEventId: route.event._id,
      phoneHash: args.phoneHash,
      phoneObfuscated: args.phoneObfuscated,
      participantClerkUserIds: identity.participantClerkUserIds,
    };
  }

  return await finalizeSessionSubmission(ctx, {
    session: updatedSession,
    route,
    identity,
    normalizedPhoneNumber: args.normalizedPhoneNumber,
    now: args.receivedAt,
  });
}

async function finishReceipt(
  ctx: MutationCtx,
  providerMessageId: string,
  result: ProcessedInboundResult,
  now: number,
): Promise<void> {
  const receipt = await ctx.db
    .query("smsInboundReceipts")
    .withIndex("by_provider_message", (queryBuilder) =>
      queryBuilder.eq("providerMessageId", providerMessageId),
    )
    .unique();
  if (!receipt) return;
  await ctx.db.patch(receipt._id, {
    status: "processed",
    outcome: result.outcome,
    responseMessage: result.responseMessage,
    targetEventId: result.targetEventId,
    updatedAt: now,
  });
}

export const beginInboundReceipt = internalMutation({
  args: {
    providerMessageId: v.string(),
    fromPhoneNumber: v.string(),
    toPhoneNumber: v.string(),
    body: v.string(),
    receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ accepted: boolean }> => {
    const now = args.receivedAt ?? Date.now();
    const phoneResolution = await normalizeAndHashPhoneNumber(args.fromPhoneNumber);
    const existingReceipt = await ctx.db
      .query("smsInboundReceipts")
      .withIndex("by_provider_message", (queryBuilder) =>
        queryBuilder.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (existingReceipt) {
      const mayRetry =
        existingReceipt.status === "failed" ||
        (existingReceipt.status === "processing" &&
          existingReceipt.updatedAt + INBOUND_RECEIPT_RETRY_AFTER_MS <= now);
      if (!mayRetry) return { accepted: false };
      await ctx.db.patch(existingReceipt._id, {
        status: "processing",
        updatedAt: now,
      });
      return { accepted: true };
    }
    await ctx.db.insert("smsInboundReceipts", {
      providerMessageId: args.providerMessageId,
      phoneHash: phoneResolution.phoneHash,
      toPhoneNumber: args.toPhoneNumber,
      body: args.body,
      status: "processing",
      receivedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { accepted: true };
  },
});

export const completeComplianceInbound = internalMutation({
  args: {
    providerMessageId: v.string(),
    fromPhoneNumber: v.string(),
    body: v.string(),
    outcome: v.union(v.literal("opt_out"), v.literal("opt_in"), v.literal("help")),
    kind: v.union(v.literal("opt_out"), v.literal("help")),
    rawPayload: v.optional(v.record(v.string(), v.string())),
    receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = args.receivedAt ?? Date.now();
    const phoneResolution = await normalizeAndHashPhoneNumber(args.fromPhoneNumber);
    await cancelActiveSessions(ctx, phoneResolution.phoneHash, now);
    const phoneObfuscated = obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber);
    const threads = await ctx.db
      .query("smsConversationThreads")
      .withIndex("by_phone", (queryBuilder) =>
        queryBuilder.eq("phoneHash", phoneResolution.phoneHash),
      )
      .collect();
    for (const thread of threads) {
      await recordSmsConversationMessage(ctx, {
        eventId: thread.eventId,
        phoneHash: phoneResolution.phoneHash,
        phoneObfuscated: thread.phoneObfuscated || phoneObfuscated,
        participantClerkUserIds: thread.participantClerkUserIds,
        direction: "inbound",
        kind: args.kind,
        body: args.body,
        providerMessageId: args.providerMessageId,
        providerStatus: "received",
        rawPayload: args.rawPayload,
        createdAt: now,
      });
    }
    const receipt = await ctx.db
      .query("smsInboundReceipts")
      .withIndex("by_provider_message", (queryBuilder) =>
        queryBuilder.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (receipt) {
      await ctx.db.patch(receipt._id, {
        status: "processed",
        outcome: args.outcome,
        updatedAt: now,
      });
    }
  },
});

export const completeInboundWithoutRouting = internalMutation({
  args: {
    providerMessageId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const receipt = await ctx.db
      .query("smsInboundReceipts")
      .withIndex("by_provider_message", (queryBuilder) =>
        queryBuilder.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (!receipt || receipt.status !== "processing") return;
    await ctx.db.patch(receipt._id, {
      status: "processed",
      outcome: "unmatched_message",
      updatedAt: Date.now(),
    });
  },
});

export const failInboundReceipt = internalMutation({
  args: {
    providerMessageId: v.string(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const receipt = await ctx.db
      .query("smsInboundReceipts")
      .withIndex("by_provider_message", (queryBuilder) =>
        queryBuilder.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (receipt) {
      await ctx.db.patch(receipt._id, {
        status: "failed",
        outcome: "error",
        responseMessage: args.errorMessage.slice(0, 500),
        updatedAt: Date.now(),
      });
    }
  },
});

export const processReservedInbound = internalMutation({
  args: {
    providerMessageId: v.string(),
    fromPhoneNumber: v.string(),
    messageBody: v.string(),
    rawPayload: v.optional(v.record(v.string(), v.string())),
    receivedAt: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProcessedInboundResult> => {
    const receivedAt = args.receivedAt ?? Date.now();
    const inboundMessage = args.messageBody.trim().slice(0, 1600);
    const normalizedCode = normalizeSmsCode(inboundMessage);
    const phoneResolution = await normalizeAndHashPhoneNumber(args.fromPhoneNumber);
    const phoneObfuscated = obfuscatePhoneNumber(phoneResolution.normalizedPhoneNumber);
    const receipt = await ctx.db
      .query("smsInboundReceipts")
      .withIndex("by_provider_message", (queryBuilder) =>
        queryBuilder.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (!receipt || receipt.status !== "processing") {
      return {
        duplicate: true,
        shouldRespond: false,
        outcome: "unmatched_message",
      };
    }

    const routeResolution = await resolveSmsCode(
      ctx,
      normalizedCode,
      phoneResolution.phoneHash,
      receivedAt,
    );
    let result: ProcessedInboundResult;
    if (routeResolution.status === "conflict") {
      result = { shouldRespond: false, outcome: "conflict" };
    } else if (routeResolution.status === "matched") {
      result = await startRouteSession(ctx, {
        route: routeResolution.route,
        rawPhoneNumber: args.fromPhoneNumber,
        normalizedPhoneNumber: phoneResolution.normalizedPhoneNumber,
        phoneHash: phoneResolution.phoneHash,
        phoneObfuscated,
        body: inboundMessage,
        providerMessageId: args.providerMessageId,
        rawPayload: args.rawPayload,
        receivedAt,
      });
    } else {
      const session = await findActiveSession(ctx, phoneResolution.phoneHash, receivedAt);
      if (session) {
        result = await continueRouteSession(ctx, {
          session,
          rawPhoneNumber: args.fromPhoneNumber,
          normalizedPhoneNumber: phoneResolution.normalizedPhoneNumber,
          phoneHash: phoneResolution.phoneHash,
          phoneObfuscated,
          body: inboundMessage,
          providerMessageId: args.providerMessageId,
          rawPayload: args.rawPayload,
          receivedAt,
        });
      } else {
        await recordOrdinaryInbound(ctx, {
          phoneHash: phoneResolution.phoneHash,
          phoneObfuscated,
          body: inboundMessage,
          providerMessageId: args.providerMessageId,
          rawPayload: args.rawPayload,
          receivedAt,
        });
        result = {
          shouldRespond: false,
          outcome: routeResolution.status === "not_eligible" ? "not_eligible" : "unmatched_message",
        };
      }
    }

    await finishReceipt(ctx, args.providerMessageId, result, receivedAt);
    return result;
  },
});
