/**
 * Shared recipient/audience filter logic for text blasts and the guest directory.
 * Extracted verbatim from textBlasts.ts so segment semantics never drift between
 * the blast sender and person-level directory queries. The SMS-consent hard gate
 * intentionally stays in textBlasts.getFilteredRsvpsForTargeting — the guest
 * directory shows non-consented people; blasts must not.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ApprovalStatus } from "./rsvpStatus";
import { ensureEventInSiteScope } from "./siteScope";

export type RsvpStatus = ApprovalStatus;

export type RecipientFilterConfig =
  | { type: "all" }
  | { type: "approved_no_approval_sms" }
  | { type: "approved_with_approval_sms" }
  | { type: "qr_code_received" }
  | { type: "qr_code_not_received" }
  | { type: "status"; status: RsvpStatus }
  | { type: "custom_field_missing"; fieldKey: string }
  | { type: "rsvp_before"; timestamp: number }
  | { type: "previous_approved_not_rsvped"; excludedEventId: Id<"events"> };

export type RecipientHistoryFilterConfig =
  | { type: "received_any"; textBlastIds: Id<"textBlasts">[] }
  | { type: "not_received_any"; textBlastIds: Id<"textBlasts">[] };

export type SiteScopeArgs = {
  siteKey?: string;
  workspaceSlug?: string;
};

export const ALL_RSVP_STATUSES: RsvpStatus[] = ["pending", "approved", "denied"];
export const DEFAULT_APPROVED_STATUSES: RsvpStatus[] = ["approved"];

export const recipientHistoryFilterValidator = v.optional(
  v.object({
    type: v.union(v.literal("received_any"), v.literal("not_received_any")),
    textBlastIds: v.array(v.id("textBlasts")),
  }),
);

export const parseRecipientFilter = (
  rawFilter: string | null | undefined,
): RecipientFilterConfig => {
  if (!rawFilter) {
    return { type: "all" };
  }

  if (rawFilter === "approved_no_approval_sms") {
    return { type: "approved_no_approval_sms" };
  }

  if (rawFilter === "approved_with_approval_sms") {
    return { type: "approved_with_approval_sms" };
  }

  if (rawFilter === "qr_code_received") {
    return { type: "qr_code_received" };
  }

  if (rawFilter === "qr_code_not_received") {
    return { type: "qr_code_not_received" };
  }

  try {
    const parsed = JSON.parse(rawFilter) as Partial<RecipientFilterConfig>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
      return { type: "all" };
    }

    switch (parsed.type) {
      case "all":
        return { type: "all" };
      case "approved_no_approval_sms":
        return { type: "approved_no_approval_sms" };
      case "approved_with_approval_sms":
        return { type: "approved_with_approval_sms" };
      case "qr_code_received":
        return { type: "qr_code_received" };
      case "qr_code_not_received":
        return { type: "qr_code_not_received" };
      case "status":
        if (
          typeof parsed.status === "string" &&
          ALL_RSVP_STATUSES.includes(parsed.status as RsvpStatus)
        ) {
          return { type: "status", status: parsed.status as RsvpStatus };
        }
        break;
      case "custom_field_missing":
        if (typeof (parsed as { fieldKey?: unknown }).fieldKey === "string") {
          return {
            type: "custom_field_missing",
            fieldKey: (parsed as { fieldKey: string }).fieldKey,
          };
        }
        break;
      case "rsvp_before":
        if (
          typeof (parsed as { timestamp?: unknown }).timestamp === "number" &&
          Number.isFinite((parsed as { timestamp: number }).timestamp)
        ) {
          return {
            type: "rsvp_before",
            timestamp: (parsed as { timestamp: number }).timestamp,
          };
        }
        break;
      case "previous_approved_not_rsvped":
        if (typeof (parsed as { excludedEventId?: unknown }).excludedEventId === "string") {
          return {
            type: "previous_approved_not_rsvped",
            excludedEventId: (parsed as { excludedEventId: Id<"events"> }).excludedEventId,
          };
        }
        break;
      default:
        break;
    }
  } catch (error) {
    console.warn(`[parseRecipientFilter] Failed to parse recipient filter: ${rawFilter}`, error);
  }

  return { type: "all" };
};

export const statusesForFilter = (filter: RecipientFilterConfig): RsvpStatus[] => {
  switch (filter.type) {
    case "all":
    case "approved_no_approval_sms":
    case "approved_with_approval_sms":
    case "qr_code_received":
    case "qr_code_not_received":
      return DEFAULT_APPROVED_STATUSES;
    case "status":
      return [filter.status];
    case "custom_field_missing":
    case "rsvp_before":
      return ["pending", "approved"];
    case "previous_approved_not_rsvped":
      return DEFAULT_APPROVED_STATUSES;
    default:
      return DEFAULT_APPROVED_STATUSES;
  }
};

export const customFieldIsMissing = (rsvp: Doc<"rsvps">, fieldKey: string): boolean => {
  const value = rsvp.customFieldValues?.[fieldKey];
  if (value === undefined) {
    return true;
  }
  if (typeof value !== "string") {
    return true;
  }
  return value.trim().length === 0;
};

export async function rsvpHasSentApprovalSms(
  ctx: Pick<QueryCtx, "db">,
  rsvp: Doc<"rsvps">,
): Promise<boolean> {
  const approvalSms = await ctx.db
    .query("smsNotifications")
    .withIndex("by_event", (queryBuilder) => queryBuilder.eq("eventId", rsvp.eventId))
    .filter((queryBuilder) =>
      queryBuilder.and(
        queryBuilder.eq(queryBuilder.field("recipientClerkUserId"), rsvp.clerkUserId),
        queryBuilder.eq(queryBuilder.field("type"), "approval"),
        queryBuilder.eq(queryBuilder.field("status"), "sent"),
      ),
    )
    .first();

  return approvalSms !== null;
}

export async function rsvpHasReceivedQrCode(
  ctx: Pick<QueryCtx, "db">,
  rsvp: Doc<"rsvps">,
): Promise<boolean> {
  const redemption = await ctx.db
    .query("redemptions")
    .withIndex("by_event_user", (queryBuilder) =>
      queryBuilder.eq("eventId", rsvp.eventId).eq("clerkUserId", rsvp.clerkUserId),
    )
    .unique();

  return redemption?.qrDeliveredAt !== undefined;
}

export async function hasSentDeliveryForAnyBlast(
  ctx: Pick<QueryCtx, "db">,
  phoneHash: string,
  textBlastIds: Id<"textBlasts">[],
): Promise<boolean> {
  for (const textBlastId of textBlastIds) {
    const sentDelivery = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_phone", (queryBuilder) =>
        queryBuilder.eq("textBlastId", textBlastId).eq("phoneHash", phoneHash),
      )
      .filter((queryBuilder) => queryBuilder.eq(queryBuilder.field("status"), "sent"))
      .first();

    if (sentDelivery) {
      return true;
    }
  }

  return false;
}

export async function passesRecipientHistoryFilter(
  ctx: Pick<QueryCtx, "db">,
  phoneHash: string,
  recipientHistoryFilter?: RecipientHistoryFilterConfig,
): Promise<boolean> {
  if (!recipientHistoryFilter || recipientHistoryFilter.textBlastIds.length === 0) {
    return true;
  }

  const hasSentDelivery = await hasSentDeliveryForAnyBlast(
    ctx,
    phoneHash,
    recipientHistoryFilter.textBlastIds,
  );

  return recipientHistoryFilter.type === "received_any" ? hasSentDelivery : !hasSentDelivery;
}

export function isPreviousApprovedNotRsvpedFilter(
  filterConfig: RecipientFilterConfig,
): filterConfig is Extract<RecipientFilterConfig, { type: "previous_approved_not_rsvped" }> {
  return filterConfig.type === "previous_approved_not_rsvped";
}

export async function getExcludedEventRsvpsForFilter(
  ctx: Pick<QueryCtx, "db">,
  filterConfig: RecipientFilterConfig,
  scope: SiteScopeArgs,
): Promise<Doc<"rsvps">[]> {
  if (!isPreviousApprovedNotRsvpedFilter(filterConfig)) {
    return [];
  }

  await ensureEventInSiteScope(ctx, filterConfig.excludedEventId, scope);

  return await ctx.db
    .query("rsvps")
    .withIndex("by_event", (queryBuilder) =>
      queryBuilder.eq("eventId", filterConfig.excludedEventId),
    )
    .collect();
}

export async function getExcludedClerkUserIdsForFilter(
  ctx: Pick<QueryCtx, "db">,
  filterConfig: RecipientFilterConfig,
  scope: SiteScopeArgs,
): Promise<Set<string>> {
  const excludedEventRsvps = await getExcludedEventRsvpsForFilter(ctx, filterConfig, scope);
  return new Set(excludedEventRsvps.map((rsvp) => rsvp.clerkUserId));
}
