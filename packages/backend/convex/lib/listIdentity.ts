import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeCredentialPassword } from "./credentialPasswords";
import { isSmsExecutableEvent } from "./smsCodeRouting";

export function listDisplayName(list: { listKey: string; displayName?: string }): string {
  return list.displayName || list.listKey;
}

export function listPassword(list: { password?: string; passwordNormalized?: string }): string {
  return normalizeCredentialPassword(list.passwordNormalized ?? list.password ?? "");
}

export async function codeAssignment(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">,
  normalizedCode: string,
) {
  return ctx.db
    .query("listCodeAssignments")
    .withIndex("by_event_code", (builder) =>
      builder.eq("eventId", eventId).eq("normalizedCode", normalizedCode),
    )
    .unique();
}

export async function effectiveCodeList(
  ctx: Pick<QueryCtx, "db">,
  list: Doc<"listCredentials">,
  code: string,
) {
  const assignment = await codeAssignment(ctx, list.eventId, code);
  return assignment ? ctx.db.get(assignment.listCredentialId) : list;
}

function conflict(): never {
  throw new ConvexError({
    code: "SMS_CODE_CONFLICT",
    message:
      "This password or SMS code belongs to another active list. Choose another code, or archive that list first.",
  });
}

/** Ordinary edits do not call this: ownership changes require an explicit code assignment. */
export async function assignListCode(
  ctx: MutationCtx,
  event: Doc<"events">,
  list: Doc<"listCredentials">,
  code: string,
  source: "password" | "blast" = "password",
) {
  if (!code || list.archivedAt !== undefined) return;
  const previousAssignment = await codeAssignment(ctx, event._id, code);
  const previousOwner = previousAssignment
    ? await ctx.db.get(previousAssignment.listCredentialId)
    : null;
  if (previousOwner && previousOwner._id !== list._id && previousOwner.archivedAt === undefined)
    conflict();

  const passwords = await ctx.db
    .query("listCredentials")
    .withIndex("by_passwordNormalized", (builder) => builder.eq("passwordNormalized", code))
    .collect();
  for (const candidate of passwords) {
    if (candidate._id === list._id) continue;
    const owner = await effectiveCodeList(ctx, candidate, code);
    if (!owner || owner._id === list._id) continue;
    const candidateEvent = await ctx.db.get(candidate.eventId);
    if (candidate.eventId === event._id) {
      if (candidate.archivedAt === undefined && owner.archivedAt === undefined) conflict();
    } else if (candidateEvent && isSmsExecutableEvent(candidateEvent)) conflict();
  }
  const actions = await ctx.db
    .query("textBlastReplyActions")
    .withIndex("by_code", (builder) => builder.eq("replyCodeNormalized", code))
    .collect();
  for (const action of actions) {
    if (!action.isEnabled || (source === "blast" && action.targetEventId !== event._id)) continue;
    const targetEvent = await ctx.db.get(action.targetEventId);
    if (!targetEvent || (targetEvent._id !== event._id && !isSmsExecutableEvent(targetEvent)))
      continue;
    const originalList = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (builder) =>
        builder.eq("eventId", action.targetEventId).eq("listKey", action.targetListKey),
      )
      .unique();
    if (!originalList) continue;
    const owner = await effectiveCodeList(ctx, originalList, code);
    if (
      !owner ||
      owner._id === list._id ||
      (owner.eventId === event._id && owner.archivedAt !== undefined)
    )
      continue;
    const delivery = await ctx.db
      .query("textBlastRecipients")
      .withIndex("by_text_blast_status", (builder) =>
        builder.eq("textBlastId", action.textBlastId).eq("status", "sent"),
      )
      .first();
    if (delivery) conflict();
  }
  const claims = await ctx.db
    .query("smsCodeClaims")
    .withIndex("by_code", (builder) => builder.eq("normalizedCode", code))
    .collect();
  for (const claim of claims) {
    if (source === "blast" && claim.eventId !== event._id) continue;
    if (claim.status !== "reserved" || (claim.reservationExpiresAt ?? 0) <= Date.now()) continue;
    const action = claim.replyActionId ? await ctx.db.get(claim.replyActionId) : null;
    const originalList = claim.listCredentialId
      ? await ctx.db.get(claim.listCredentialId)
      : action
        ? await ctx.db
            .query("listCredentials")
            .withIndex("by_event_key", (builder) =>
              builder.eq("eventId", action.targetEventId).eq("listKey", action.targetListKey),
            )
            .unique()
        : null;
    if (originalList) {
      const owner = await effectiveCodeList(ctx, originalList, code);
      if (
        owner &&
        owner._id !== list._id &&
        (owner.eventId !== event._id || owner.archivedAt === undefined)
      )
        conflict();
    }
  }
  if (previousAssignment?.listCredentialId === list._id) return;
  if (previousAssignment)
    await ctx.db.patch(previousAssignment._id, {
      listCredentialId: list._id,
      assignedAt: Date.now(),
    });
  else
    await ctx.db.insert("listCodeAssignments", {
      eventId: event._id,
      normalizedCode: code,
      listCredentialId: list._id,
      assignedAt: Date.now(),
    });
}

export async function releaseRotatedPassword(
  ctx: MutationCtx,
  previous: Doc<"listCredentials">,
  next: Doc<"listCredentials">,
) {
  const code = listPassword(previous);
  if (!code || code === listPassword(next)) return;
  const assignment = await codeAssignment(ctx, previous.eventId, code);
  if (!assignment || assignment.listCredentialId !== previous._id) return;
  const actions = await ctx.db
    .query("textBlastReplyActions")
    .withIndex("by_code", (builder) => builder.eq("replyCodeNormalized", code))
    .collect();
  if (!actions.some((action) => action.isEnabled && action.targetEventId === previous.eventId))
    await ctx.db.delete(assignment._id);
}

export async function resolveListDisplayName(
  ctx: Pick<QueryCtx, "db">,
  eventId: Id<"events">,
  listKey: string,
): Promise<string> {
  const list = await ctx.db
    .query("listCredentials")
    .withIndex("by_event_key", (builder) => builder.eq("eventId", eventId).eq("listKey", listKey))
    .unique();
  return list ? listDisplayName(list) : listKey;
}

export async function resolveActionCodeList(
  ctx: Pick<QueryCtx, "db">,
  action: Pick<
    Doc<"textBlastReplyActions">,
    "targetEventId" | "targetListKey" | "replyCodeNormalized"
  >,
) {
  const original = await ctx.db
    .query("listCredentials")
    .withIndex("by_event_key", (builder) =>
      builder.eq("eventId", action.targetEventId).eq("listKey", action.targetListKey),
    )
    .unique();
  return original ? effectiveCodeList(ctx, original, action.replyCodeNormalized) : null;
}

export async function resolveClaimCodeList(ctx: Pick<QueryCtx, "db">, claim: Doc<"smsCodeClaims">) {
  if (claim.listCredentialId) {
    const original = await ctx.db.get(claim.listCredentialId);
    return original ? effectiveCodeList(ctx, original, claim.normalizedCode) : null;
  }
  const action = claim.replyActionId ? await ctx.db.get(claim.replyActionId) : null;
  return action?.isEnabled ? resolveActionCodeList(ctx, action) : null;
}
