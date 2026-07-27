"use node";
import { createClerkClient } from "@clerk/backend";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import type { ExportContext } from "./exportsQueries";
import { action } from "./functions";
import { resolveApprovalStatus, sanitizeAttendanceStatus } from "./lib/rsvpStatus";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

type ExportRsvpRow = {
  rsvpId: Id<"rsvps">;
  listKey: string;
  name: string;
  attendees: number;
  note: string;
  invitedByName: string;
  referredByName: string;
  socialProfiles: Record<string, string>;
  customFieldValues: Record<string, string>;
  phoneNumber: string;
  approvalStatus: "pending" | "approved" | "denied";
  attendanceStatus: "yes" | "no" | "maybe";
  ticketStatus: "not-issued" | "issued" | "disabled" | "redeemed";
};

type ExportRsvpsCsvArgs = {
  eventId: Id<"events">;
  siteKey?: string;
  workspaceSlug?: string;
  listKeys?: string[];
  statusFilters?: Array<Doc<"rsvps">["status"]>;
  attendanceFilters?: string[];
  ticketStatusFilters?: string[];
  search?: string;
  includeAttendees?: boolean;
  includeNote?: boolean;
  includeCustomFields?: boolean;
  includePrimaryFields?: boolean;
  includeSocialPlatformKeys?: string[];
  includeInvitedBy?: boolean;
  includePhone?: boolean;
  exportTimestamp?: string;
};

type ExportRsvpsCsvResult = {
  csvContent: string;
  filename: string;
};

export const exportRsvpsCsv = action({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    listKeys: v.optional(v.array(v.string())),
    statusFilters: v.optional(v.array(v.string())),
    attendanceFilters: v.optional(v.array(v.string())),
    ticketStatusFilters: v.optional(v.array(v.string())),
    search: v.optional(v.string()),
    includeAttendees: v.optional(v.boolean()),
    includeNote: v.optional(v.boolean()),
    includeCustomFields: v.optional(v.boolean()),
    includePrimaryFields: v.optional(v.boolean()),
    includeSocialPlatformKeys: v.optional(v.array(v.string())),
    includeInvitedBy: v.optional(v.boolean()),
    includePhone: v.optional(v.boolean()),
    exportTimestamp: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    {
      eventId,
      siteKey,
      workspaceSlug,
      listKeys,
      statusFilters,
      attendanceFilters,
      ticketStatusFilters,
      search,
      includeAttendees = true,
      includeNote = true,
      includeCustomFields = true,
      includePrimaryFields = true,
      includeSocialPlatformKeys,
      includeInvitedBy = true,
      includePhone = true,
      exportTimestamp,
    }: ExportRsvpsCsvArgs,
  ): Promise<ExportRsvpsCsvResult> => {
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const { event, rsvps, rsvpSocialProfiles, listCredentials, usersByClerkUserId }: ExportContext =
      await ctx.runQuery(internal.exportsQueries.getRsvpsForExportInternal, {
        eventId,
        siteKey,
        workspaceSlug,
        listKeys,
        statusFilters,
        attendanceFilters,
        ticketStatusFilters,
        search,
      });

    const listKeyToName: Record<string, string> = Object.fromEntries(
      listCredentials.map((credential) => [credential.listKey, credential.listKey] as const),
    );

    const phoneCache = new Map<string, string | null>();
    const clerkSecretKey = process.env.CLERK_SECRET_KEY;
    let clerkClient: ReturnType<typeof createClerkClient> | null = null;

    const resolvePhoneForUser = async (clerkUserId: string): Promise<string | null> => {
      if (phoneCache.has(clerkUserId)) {
        return phoneCache.get(clerkUserId) ?? null;
      }

      let resolvedPhone: string | null = null;
      const userRecord = usersByClerkUserId[clerkUserId];
      if (userRecord?.phone) {
        resolvedPhone = userRecord.phone;
      }

      if (!resolvedPhone && clerkSecretKey) {
        try {
          if (!clerkClient) {
            clerkClient = createClerkClient({ secretKey: clerkSecretKey });
          }
          const clerkUser = await clerkClient.users.getUser(clerkUserId);
          const preferredPhone =
            (clerkUser.primaryPhoneNumberId &&
              clerkUser.phoneNumbers.find((phone) => phone.id === clerkUser.primaryPhoneNumberId)
                ?.phoneNumber) ||
            clerkUser.phoneNumbers[0]?.phoneNumber;
          if (preferredPhone) {
            resolvedPhone = preferredPhone;
          }
        } catch (error) {
          console.error(
            `[EXPORT] Failed to fetch phone from Clerk for user ${clerkUserId}:`,
            error,
          );
        }
      }

      phoneCache.set(clerkUserId, resolvedPhone ?? null);
      return resolvedPhone;
    };

    const enrichedRsvps: ExportRsvpRow[] = [];
    const socialProfilesByRsvpId = new Map<string, Record<string, string>>();
    for (const socialProfile of rsvpSocialProfiles) {
      const profilesForRsvp = socialProfilesByRsvpId.get(socialProfile.rsvpId) ?? {};
      profilesForRsvp[socialProfile.platformKey] = socialProfile.handle;
      socialProfilesByRsvpId.set(socialProfile.rsvpId, profilesForRsvp);
    }

    for (const rsvp of rsvps) {
      const userRecord = usersByClerkUserId[rsvp.clerkUserId];
      const firstName = userRecord?.firstName ?? "";
      const lastName = userRecord?.lastName ?? "";
      const metadataName = userRecord?.metadata?.name ?? "";
      const fullName =
        [firstName, lastName].filter((segment) => segment && segment.length > 0).join(" ") ||
        metadataName ||
        rsvp.userName ||
        "";

      let phoneNumber = "";
      if (includePhone && rsvp.shareContact) {
        const resolvedPhone = await resolvePhoneForUser(rsvp.clerkUserId);
        phoneNumber = resolvedPhone ?? "";
      }

      enrichedRsvps.push({
        rsvpId: rsvp._id,
        listKey: rsvp.listKey,
        name: fullName,
        attendees: rsvp.attendees ?? 1,
        note: rsvp.note || "",
        invitedByName: rsvp.invitedByName ?? "",
        referredByName: rsvp.referredByName ?? "",
        socialProfiles: socialProfilesByRsvpId.get(rsvp._id) ?? {},
        customFieldValues: rsvp.customFieldValues ?? {},
        phoneNumber,
        approvalStatus: resolveApprovalStatus(rsvp),
        attendanceStatus: sanitizeAttendanceStatus(rsvp.attendanceStatus),
        ticketStatus:
          rsvp.ticketStatus === "issued" ||
          rsvp.ticketStatus === "disabled" ||
          rsvp.ticketStatus === "redeemed"
            ? rsvp.ticketStatus
            : "not-issued",
      });
    }

    enrichedRsvps.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

    const customFieldKeys = includeCustomFields
      ? (event.customFields ?? []).map((field) => field.key)
      : [];
    const customFieldLabels = includeCustomFields
      ? (event.customFields ?? []).map((field) => field.label)
      : [];
    const selectedSocialPlatformKeys = new Set(includeSocialPlatformKeys);
    const socialPlatforms = includePrimaryFields
      ? (event.primaryFieldConfig?.socialPlatforms ?? []).filter(
          (platform) =>
            includeSocialPlatformKeys === undefined ||
            selectedSocialPlatformKeys.has(platform.platformKey),
        )
      : [];
    const shouldIncludeInvitedBy =
      includePrimaryFields &&
      includeInvitedBy &&
      event.primaryFieldConfig?.invitedBy?.enabled === true;

    const groupedByList = enrichedRsvps.reduce<Record<string, ExportRsvpRow[]>>(
      (accumulator, rsvp) => {
        if (!accumulator[rsvp.listKey]) {
          accumulator[rsvp.listKey] = [];
        }
        accumulator[rsvp.listKey]!.push(rsvp);
        return accumulator;
      },
      {},
    );

    const csvSections: string[] = [];
    const exportTimestampText = exportTimestamp || new Date().toISOString();

    for (const listKey of Object.keys(groupedByList)) {
      const rsvps = groupedByList[listKey] ?? [];
      const listName = listKeyToName[listKey] || listKey;

      csvSections.push(`Event: ${event.name}`);
      csvSections.push(`List: ${listName.toUpperCase()}`);
      csvSections.push(`Export Date: ${exportTimestampText}`);
      csvSections.push("");

      const headerRow: string[] = [
        "Name",
        "Approval Status",
        "Attendance Status",
        "Ticket Status",
        "Entry Status",
      ];
      if (includePhone) headerRow.push("Phone");
      if (shouldIncludeInvitedBy) {
        headerRow.push(event.primaryFieldConfig?.invitedBy?.label ?? "Invited By");
      }
      headerRow.push("Referred By");
      headerRow.push(...socialPlatforms.map((platform) => platform.label));
      if (includeAttendees) headerRow.push("Attendees");
      if (includeNote) headerRow.push("Note");
      if (includeCustomFields) headerRow.push(...customFieldLabels);

      csvSections.push(headerRow.map(escapeCsvField).join(","));

      for (const rsvp of rsvps) {
        const row: string[] = [
          rsvp.name,
          rsvp.approvalStatus,
          rsvp.attendanceStatus,
          rsvp.ticketStatus,
          rsvp.ticketStatus === "redeemed" ? "checked-in" : "not-checked-in",
        ];
        if (includePhone) row.push(rsvp.phoneNumber);
        if (shouldIncludeInvitedBy) row.push(rsvp.invitedByName);
        row.push(rsvp.referredByName);
        row.push(
          ...socialPlatforms.map((platform) => rsvp.socialProfiles[platform.platformKey] ?? ""),
        );
        if (includeAttendees) row.push(String(rsvp.attendees));
        if (includeNote) row.push(rsvp.note);
        if (includeCustomFields) {
          const customFieldValues = customFieldKeys.map(
            (key) => rsvp.customFieldValues?.[key] || "",
          );
          row.push(...customFieldValues);
        }
        csvSections.push(row.map(escapeCsvField).join(","));
      }

      csvSections.push("");
      csvSections.push("");
      csvSections.push("=".repeat(80));
      csvSections.push("");
    }

    const filenameSafeEventName: string = event.name.replace(/[^a-z0-9]/gi, "_");
    return {
      csvContent: csvSections.join("\n"),
      filename: `${filenameSafeEventName}_rsvps_${Date.now()}.csv`,
    };
  },
});

function escapeCsvField(field: string): string {
  if (field.includes(",") || field.includes('"') || field.includes("\n")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
