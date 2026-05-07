import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./functions";
import { v } from "convex/values";
import { buildApprovalMessageBackfillPatch } from "@coucou/sdk/shared/approval-messages";
import { requireCoucouPlatformMember } from "./lib/platformAuth";
import { upsertWorkspaceRecord } from "./lib/workspaceRecords";
import {
  DEFAULT_SOCIAL_PLATFORM_CONFIGS,
  detectSocialPlatformKeyFromCustomField,
  isInvitedByCustomField,
  normalizePrimaryFieldLookupText,
  normalizeSocialHandleInput,
  type PrimaryFieldConfig,
  type PrimarySocialPlatformConfig,
} from "@coucou/sdk/shared/primary-fields";
import {
  buildInvitedByPatch,
  sanitizePrimaryFieldConfig,
  type SanitizedSubmittedSocialProfile,
} from "./lib/primaryFields";
import { createProfileValuesAndWorkspaceGrantsForSocialProfiles } from "./lib/profileValueRecords";
import { replaceRsvpSocialProfileSnapshots } from "./lib/socialProfileRecords";

type EventCustomFieldDefinition = {
  key: string;
  label?: string;
  trimWhitespace?: boolean;
  canHide?: boolean;
};

type MetadataRecord = Record<string, unknown>;

const dojoPomodoroWorkspaceSlug = "dojo-pomodoro";
const dojoLegacySiteKey = "dojo";
const dojoPomodoroWorkspaceName = "Dojo Pomodoro";
const dojoPomodoroPrimaryDomain = "dojopomodoro.club";

// Create migrations instance and runner
export const migrations = new Migrations(components.migrations);
export const run = migrations.runner();

// User name parsing migration - parse concatenated name to firstName/lastName
export const parseUserNamesToFirstLast = migrations.define({
  table: "users",
  migrateOne: async (ctx, user) => {
    // Only migrate if has name but missing firstName/lastName
    if (!user.name || typeof user.name !== "string" || user.name.trim() === "")
      return;
    if (user.firstName && user.lastName) return; // Already migrated

    const parts = user.name
      .trim()
      .split(" ")
      .filter((p: string) => p.trim());
    if (parts.length === 0) return;

    if (parts.length === 1) {
      // Single name goes to firstName, lastName empty
      return { firstName: parts[0], lastName: "" };
    } else {
      // Last part is lastName, everything else is firstName
      return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1],
      };
    }
  },
});

// RSVP credential migration - migrate listKey to credentialId
export const migrateRsvpsCredentialRefs = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp) => {
    if (rsvp.credentialId) return; // Already migrated
    if (!rsvp.listKey) return; // Nothing to migrate

    const credential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (q: any) =>
        q.eq("eventId", rsvp.eventId).eq("listKey", rsvp.listKey),
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(
      `No credential found for RSVP ${rsvp._id} with listKey: ${rsvp.listKey}`,
    );
  },
});

// Approvals credential migration - migrate listKey to credentialId
export const migrateApprovalsCredentialRefs = migrations.define({
  table: "approvals",
  migrateOne: async (ctx, approval) => {
    if (approval.credentialId) return; // Already migrated
    if (!approval.listKey) return; // Nothing to migrate

    const credential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (q: any) =>
        q.eq("eventId", approval.eventId).eq("listKey", approval.listKey),
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(
      `No credential found for approval ${approval._id} with listKey: ${approval.listKey}`,
    );
  },
});

// Redemptions credential migration - migrate listKey to credentialId
export const migrateRedemptionsCredentialRefs = migrations.define({
  table: "redemptions",
  migrateOne: async (ctx, redemption) => {
    if (redemption.credentialId) return; // Already migrated
    if (!redemption.listKey) return; // Nothing to migrate

    const credential = await ctx.db
      .query("listCredentials")
      .withIndex("by_event_key", (q: any) =>
        q.eq("eventId", redemption.eventId).eq("listKey", redemption.listKey),
      )
      .unique();

    if (credential) {
      return { credentialId: credential._id };
    }
    // If no credential found, log it but don't fail
    console.warn(
      `No credential found for redemption ${redemption._id} with listKey: ${redemption.listKey}`,
    );
  },
});

export const backfillListCredentialApprovalMessagesFromEvents =
  migrations.define({
    table: "listCredentials",
    migrateOne: async (ctx, rawCredential) => {
      const credential = rawCredential as Doc<"listCredentials">;
      const event = (await ctx.db.get(
        credential.eventId as Id<"events">,
      )) as Doc<"events"> | null;
      if (!event) return;

      return buildApprovalMessageBackfillPatch({
        credentialApprovalMessage: credential.approvalMessage,
        eventApprovalMessage: event.approvalMessage,
      });
    },
  });

export const backfillDojoPomodoroWorkspaceScope = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    clerkOrganizationId: v.optional(v.string()),
    clerkOrganizationSlug: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { dryRun = false, clerkOrganizationId, clerkOrganizationSlug },
  ) => {
    await requireCoucouPlatformMember(ctx);

    let workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (query) =>
        query.eq("slug", dojoPomodoroWorkspaceSlug),
      )
      .unique();

    if (
      workspace?.clerkOrganizationId &&
      clerkOrganizationId &&
      workspace.clerkOrganizationId !== clerkOrganizationId
    ) {
      throw new Error(
        "Dojo Pomodoro workspace is already linked to another Clerk organization",
      );
    }

    if (!dryRun && !workspace?.clerkOrganizationId && !clerkOrganizationId) {
      throw new Error(
        "clerkOrganizationId is required before migrating Dojo Pomodoro production scope",
      );
    }

    let workspaceAction:
      | "unchanged"
      | "created"
      | "updated"
      | "would-create"
      | "would-update" = "unchanged";
    const workspaceNeedsUpdate =
      workspace !== null &&
      (workspace.name !== dojoPomodoroWorkspaceName ||
        workspace.kind !== "client" ||
        workspace.primaryDomain !== dojoPomodoroPrimaryDomain ||
        (clerkOrganizationId !== undefined &&
          workspace.clerkOrganizationId !== clerkOrganizationId) ||
        (clerkOrganizationSlug !== undefined &&
          workspace.clerkOrganizationSlug !== clerkOrganizationSlug));

    if (!workspace) {
      workspaceAction = dryRun ? "would-create" : "created";
    } else if (workspaceNeedsUpdate) {
      workspaceAction = dryRun ? "would-update" : "updated";
    }

    if (!dryRun && (!workspace || workspaceNeedsUpdate)) {
      const workspaceId = await upsertWorkspaceRecord(ctx, {
        slug: dojoPomodoroWorkspaceSlug,
        name: dojoPomodoroWorkspaceName,
        kind: "client",
        primaryDomain: dojoPomodoroPrimaryDomain,
        clerkOrganizationId,
        clerkOrganizationSlug,
      });
      workspace = await ctx.db.get(workspaceId);
      if (!workspace) {
        throw new Error("Dojo Pomodoro workspace could not be loaded");
      }
    }

    const existingWorkspaceSite = await ctx.db
      .query("workspaceSites")
      .withIndex("by_siteKey", (query) =>
        query.eq("siteKey", dojoLegacySiteKey),
      )
      .unique();

    let workspaceSiteAction:
      | "unchanged"
      | "created"
      | "reassigned"
      | "updated"
      | "would-create"
      | "would-reassign"
      | "would-update" = "unchanged";
    if (!existingWorkspaceSite) {
      workspaceSiteAction = dryRun ? "would-create" : "created";
      if (!dryRun) {
        if (!workspace) {
          throw new Error("Dojo Pomodoro workspace not found");
        }
        const now = Date.now();
        await ctx.db.insert("workspaceSites", {
          workspaceId: workspace._id,
          siteKey: dojoLegacySiteKey,
          domain: dojoPomodoroPrimaryDomain,
          appKind: "client",
          createdAt: now,
          updatedAt: now,
        });
      }
    } else if (!workspace || existingWorkspaceSite.workspaceId !== workspace._id) {
      workspaceSiteAction = dryRun ? "would-reassign" : "reassigned";
      if (!dryRun) {
        if (!workspace) {
          throw new Error("Dojo Pomodoro workspace not found");
        }
        await ctx.db.patch(existingWorkspaceSite._id, {
          workspaceId: workspace._id,
          domain: dojoPomodoroPrimaryDomain,
          appKind: "client",
          updatedAt: Date.now(),
        });
      }
    } else if (
      existingWorkspaceSite.domain !== dojoPomodoroPrimaryDomain ||
      existingWorkspaceSite.appKind !== "client"
    ) {
      workspaceSiteAction = dryRun ? "would-update" : "updated";
      if (!dryRun) {
        await ctx.db.patch(existingWorkspaceSite._id, {
          domain: dojoPomodoroPrimaryDomain,
          appKind: "client",
          updatedAt: Date.now(),
        });
      }
    }

    const events = await ctx.db.query("events").collect();
    const matchingEvents = events.filter((event) => {
      const eventSiteKey = event.siteKey ?? dojoLegacySiteKey;
      if (eventSiteKey !== dojoLegacySiteKey) {
        return false;
      }

      const eventWorkspaceSlug = event.workspaceSlug ?? dojoLegacySiteKey;
      return (
        eventWorkspaceSlug === dojoLegacySiteKey ||
        eventWorkspaceSlug === dojoPomodoroWorkspaceSlug
      );
    });

    const eventsNeedingPatch = matchingEvents.filter(
      (event) =>
        event.siteKey !== dojoLegacySiteKey ||
        event.workspaceSlug !== dojoPomodoroWorkspaceSlug,
    );

    if (!dryRun) {
      const now = Date.now();
      for (const event of eventsNeedingPatch) {
        await ctx.db.patch(event._id, {
          siteKey: dojoLegacySiteKey,
          workspaceSlug: dojoPomodoroWorkspaceSlug,
          updatedAt: now,
        });
      }
    }

    return {
      dryRun,
      workspaceId: workspace?._id ?? null,
      workspaceSlug: workspace?.slug ?? dojoPomodoroWorkspaceSlug,
      workspaceAction,
      workspaceSiteAction,
      matchingEventCount: matchingEvents.length,
      patchedEventCount: eventsNeedingPatch.length,
      patchedEvents: eventsNeedingPatch.map((event) => ({
        id: event._id,
        name: event.name,
        previousSiteKey: event.siteKey ?? null,
        previousWorkspaceSlug: event.workspaceSlug ?? null,
      })),
    };
  },
});

// Backfill userName field for search functionality
export const backfillUserNameInRsvps = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp) => {
    // Skip if userName is already populated
    if (
      rsvp.userName &&
      typeof rsvp.userName === "string" &&
      rsvp.userName.trim() !== ""
    )
      return;

    // Get user data via clerkUserId
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q: any) =>
        q.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique();

    if (user) {
      // Construct display name from users table
      let displayName = "";
      if (
        user.firstName &&
        user.lastName &&
        typeof user.firstName === "string" &&
        typeof user.lastName === "string"
      ) {
        displayName = `${user.firstName} ${user.lastName}`;
      } else if (user.firstName && typeof user.firstName === "string") {
        displayName = user.firstName;
      } else if (user.name && typeof user.name === "string") {
        displayName = user.name;
      }

      if (displayName.trim()) {
        return { userName: displayName.trim() };
      }
    }
  },
});

// Backfill RSVP customFieldValues from user metadata when possible
export const backfillRsvpCustomFieldsFromUserMetadata = migrations.define({
  table: "rsvps",
  migrateOne: async (
    ctx,
    rawRsvp,
  ): Promise<{ customFieldValues?: Record<string, string> } | void> => {
    const rsvp = rawRsvp as Doc<"rsvps">;
    const existingValues: Record<string, string> = {};
    const storedCustomFields = rsvp.customFieldValues;
    if (storedCustomFields && typeof storedCustomFields === "object") {
      for (const [key, value] of Object.entries(storedCustomFields)) {
        if (typeof value === "string") {
          existingValues[key] = value;
        }
      }
    }

    const user = (await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (query) =>
        query.eq("clerkUserId", rsvp.clerkUserId),
      )
      .unique()) as Doc<"users"> | null;

    const userMetadata: MetadataRecord | undefined =
      user?.metadata && typeof user.metadata === "object"
        ? (user.metadata as MetadataRecord)
        : undefined;
    if (!userMetadata || Object.keys(userMetadata).length === 0) {
      return;
    }

    const event = (await ctx.db.get(
      rsvp.eventId as Id<"events">,
    )) as Doc<"events"> | null;
    const customFields = event?.customFields as
      | EventCustomFieldDefinition[]
      | undefined;
    if (!customFields || customFields.length === 0) {
      return;
    }

    const fieldMap = new Map<string, EventCustomFieldDefinition>(
      customFields.map((definition) => [definition.key, definition]),
    );

    let modified = false;
    const nextValues: Record<string, string> = { ...existingValues };

    for (const [metadataKey, metadataValue] of Object.entries(userMetadata)) {
      const definition = fieldMap.get(metadataKey);
      if (!definition) continue;
      if (nextValues[metadataKey] !== undefined) continue;
      if (metadataValue === undefined || metadataValue === null) continue;
      const stringValue = String(metadataValue);
      const finalValue = definition.trimWhitespace === false
        ? stringValue
        : stringValue.trim();
      if (!finalValue) continue;
      nextValues[metadataKey] = finalValue;
      modified = true;
    }

    if (!modified) {
      return;
    }

    const sanitizedEntries: Array<[string, string]> = [];
    for (const [key, value] of Object.entries(nextValues)) {
      if (typeof value === "string" && value !== "") {
        sanitizedEntries.push([key, value]);
      }
    }

    if (sanitizedEntries.length === 0) {
      return;
    }

    const sanitizedValues = Object.fromEntries(sanitizedEntries) as Record<string, string>;

    return { customFieldValues: sanitizedValues };
  },
});

// Consolidate user metadata into RSVP customFieldValues and drop metadata field
export const migrateUserMetadataIntoRsvpCustomFields = migrations.define({
  table: "users",
  migrateOne: async (
    ctx,
    rawUser,
  ): Promise<{ metadata?: undefined } | void> => {
    const user = rawUser as Doc<"users">;
    const userMetadata: MetadataRecord | undefined =
      user.metadata && typeof user.metadata === "object"
        ? (user.metadata as MetadataRecord)
        : undefined;
    if (!userMetadata || Object.keys(userMetadata).length === 0) {
      return { metadata: undefined };
    }

    const clerkUserId = user.clerkUserId;
    if (!clerkUserId) {
      return { metadata: undefined };
    }

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_user", (query) =>
        query.eq("clerkUserId", clerkUserId),
      )
      .collect();

    for (const rsvp of rsvps) {
      const existingValues: Record<string, string> = {};
      if (rsvp.customFieldValues && typeof rsvp.customFieldValues === "object") {
        for (const [key, value] of Object.entries(rsvp.customFieldValues)) {
          if (typeof value === "string") {
            existingValues[key] = value;
          }
        }
      }
      const nextValues: Record<string, string> = { ...existingValues };

      const event = (await ctx.db.get(
        rsvp.eventId as Id<"events">,
      )) as Doc<"events"> | null;
      const customFields = event?.customFields as
        | EventCustomFieldDefinition[]
        | undefined;
      if (!customFields || customFields.length === 0) continue;

      const fieldMap = new Map<string, EventCustomFieldDefinition>(
        customFields.map((definition) => [definition.key, definition]),
      );

      let modified = false;
      for (const [key, value] of Object.entries(userMetadata)) {
        const definition = fieldMap.get(key);
        if (!definition) continue;
        if (nextValues[key] !== undefined) continue;
        if (value === undefined || value === null) continue;
        const stringValue = String(value);
        const finalValue = definition.trimWhitespace === false
          ? stringValue
          : stringValue.trim();
        if (!finalValue) continue;
        nextValues[key] = finalValue;
        modified = true;
      }

      if (!modified) {
        continue;
      }

      const sanitizedEntries: Array<[string, string]> = [];
      for (const [key, value] of Object.entries(nextValues)) {
        if (typeof value === "string" && value !== "") {
          sanitizedEntries.push([key, value]);
        }
      }

      if (sanitizedEntries.length === 0) {
        continue;
      }

      const sanitizedValues = Object.fromEntries(sanitizedEntries) as Record<string, string>;

      await ctx.db.patch(rsvp._id as Id<"rsvps">, {
        customFieldValues: sanitizedValues,
        updatedAt: Date.now(),
      });
      console.log(
        `[METADATA MIGRATION] Applied metadata from user ${user._id} to RSVP ${rsvp._id}`,
      );
    }

    console.log(`[METADATA MIGRATION] Clearing metadata for user ${user._id}`);

    return { metadata: undefined };
  },
});

// Backfill smsConsent for RSVPs of a specific event
export const backfillSmsConsentForEvent = internalMutation({
  args: {
    eventId: v.id("events"),
    statusFilter: v.optional(v.array(v.string())), // e.g., ["approved", "attending"]
  },
  handler: async (ctx, args) => {
    const allowedStatuses = args.statusFilter ?? ["approved", "attending"];

    const rsvps = await ctx.db
      .query("rsvps")
      .withIndex("by_event", (q: any) => q.eq("eventId", args.eventId))
      .collect();

    const results = {
      processed: 0,
      updated: 0,
      skipped: 0,
    };

    for (const rsvp of rsvps) {
      results.processed++;

      // Skip if already has smsConsent
      if (rsvp.smsConsent === true) {
        results.skipped++;
        continue;
      }

      // Skip if status doesn't match filter
      if (!allowedStatuses.includes(rsvp.status)) {
        results.skipped++;
        continue;
      }

      await ctx.db.patch(rsvp._id as Id<"rsvps">, {
        smsConsent: true,
        smsConsentTimestamp: Date.now(),
        updatedAt: Date.now(),
      });

      results.updated++;
      console.log(
        `[SMS BACKFILL] Set smsConsent=true for RSVP ${rsvp._id} (status: ${rsvp.status})`,
      );
    }

    console.log(
      `[SMS BACKFILL] Complete: ${results.processed} processed, ${results.updated} updated, ${results.skipped} skipped`,
    );

    return results;
  },
});

// ==================== CREDENTIALID SUNSET MIGRATIONS ====================

// Phase 1: Validation migrations - Ensure all records have complete listKey data
export const validateDataIntegrityBeforeCredentialIdSunset = migrations.define({
  table: "rsvps",
  migrateOne: async (
    ctx,
    rawRsvp,
    { showLogs = false }: { showLogs?: boolean } = {},
  ) => {
    const rsvp = rawRsvp as Doc<"rsvps">;
    if (!rsvp.listKey || rsvp.listKey.trim() === "") {
      if (showLogs) {
        console.warn(
          `[VALIDATION] RSVP ${rsvp._id} missing listKey. Attempting to recover from associated credential.`,
        );
      }

      const credentialId = (rsvp as { credentialId?: Id<"listCredentials"> }).credentialId;

      if (credentialId) {
        const credential = await ctx.db.get(
          credentialId as Id<"listCredentials">,
        );
        if (credential?.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovered listKey for RSVP ${rsvp._id} from credential ${credential._id}.`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      throw new Error(
        `RSVP ${rsvp._id} missing listKey and no credential fallback available.`,
      );
    }

    return;
  },
});

export const validateApprovalsDataIntegrity = migrations.define({
  table: "approvals",
  migrateOne: async (
    ctx,
    rawApproval,
    { showLogs = false }: { showLogs?: boolean } = {},
  ) => {
    const approval = rawApproval as Doc<"approvals">;
    if (!approval.listKey || approval.listKey.trim() === "") {
      if (showLogs) {
        console.warn(
          `[VALIDATION] Approval ${approval._id} missing listKey. Attempting to recover from credential.`,
        );
      }

      const credentialId = (approval as { credentialId?: Id<"listCredentials"> }).credentialId;

      if (credentialId) {
        const credential = await ctx.db.get(
          credentialId as Id<"listCredentials">,
        );
        if (credential?.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovered listKey for approval ${approval._id} from credential ${credential._id}.`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      throw new Error(
        `Approval ${approval._id} missing listKey and no credential fallback available.`,
      );
    }
    return;
  },
});

export const validateRedemptionsDataIntegrity = migrations.define({
  table: "redemptions",
  migrateOne: async (
    ctx,
    rawRedemption,
    { showLogs = false }: { showLogs?: boolean } = {},
  ) => {
    const redemption = rawRedemption as Doc<"redemptions">;
    if (!redemption.listKey || redemption.listKey.trim() === "") {
      if (showLogs) {
        console.warn(
          `[VALIDATION] Redemption ${redemption._id} missing listKey. Attempting to recover from credential.`,
        );
      }

      const credentialId = (redemption as { credentialId?: Id<"listCredentials"> }).credentialId;

      if (credentialId) {
        const credential = await ctx.db.get(
          credentialId as Id<"listCredentials">,
        );
        if (credential?.listKey) {
          if (showLogs) {
            console.log(
              `[VALIDATION] Recovered listKey for redemption ${redemption._id} from credential ${credential._id}.`,
            );
          }
          return { listKey: credential.listKey };
        }
      }

      throw new Error(
        `Redemption ${redemption._id} missing listKey and no credential fallback available.`,
      );
    }
    return;
  },
});

// Phase 2: CredentialId removal migrations - Remove credentialId fields completely
export const sunsetCredentialIdFromRsvps = migrations.define({
  table: "rsvps",
  migrateOne: async (ctx, rsvp, { showLogs = false } = {}) => {
    // Only remove credentialId if it exists
    if (rsvp.credentialId !== undefined) {
      if (showLogs) {
        console.log(`[SUNSET] Removing credentialId from RSVP ${rsvp._id}`);
      }
      return { credentialId: undefined };
    }
    return;
  },
});

export const sunsetCredentialIdFromApprovals = migrations.define({
  table: "approvals",
  migrateOne: async (ctx, approval, { showLogs = false } = {}) => {
    if (approval.credentialId !== undefined) {
      if (showLogs) {
        console.log(
          `[SUNSET] Removing credentialId from approval ${approval._id}`,
        );
      }
      return { credentialId: undefined };
    }
    return;
  },
});

export const sunsetCredentialIdFromRedemptions = migrations.define({
  table: "redemptions",
  migrateOne: async (ctx, redemption, { showLogs = false } = {}) => {
    if (redemption.credentialId !== undefined) {
      if (showLogs) {
        console.log(
          `[SUNSET] Removing credentialId from redemption ${redemption._id}`,
        );
      }
      return { credentialId: undefined };
    }
    return;
  },
});

// Remove legacy name field from users when firstName/lastName are present
export const removeNameFromUsersWithFirstLastName = migrations.define({
  table: "users",
  migrateOne: async (ctx, user, { showLogs = false } = {}) => {
    // Only remove name if user has firstName OR lastName populated
    if (
      (user.firstName && typeof user.firstName === "string" && user.firstName.trim()) ||
      (user.lastName && typeof user.lastName === "string" && user.lastName.trim())
    ) {
      // Only remove if name field actually exists
      if (user.name !== undefined) {
        if (showLogs) {
          console.log(
            `[CLEANUP] Removing legacy name field from user ${user._id} (has firstName: ${!!user.firstName}, lastName: ${!!user.lastName})`,
          );
        }
        return { name: undefined };
      }
    }
    return;
  },
});

// Rename customFieldValues keys in RSVPs
// Accepts a mapping of old keys to new keys
// Example: { "IG:": "INSTAGRAM", "FB:": "FACEBOOK" }
// This is an internal mutation so it can be called from scripts or the dashboard
export const renameCustomFieldKeys = internalMutation({
  args: {
    keyMappings: v.record(v.string(), v.string()), // oldKey -> newKey
    eventId: v.optional(v.id("events")), // Optional: if provided, only process RSVPs for this event
  },
  handler: async (ctx, args) => {
    const keyMappings = args.keyMappings;
    if (!keyMappings || Object.keys(keyMappings).length === 0) {
      throw new Error("keyMappings must not be empty");
    }

    const results = {
      processed: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Get RSVPs - either for a specific event or all RSVPs
    const eventId = args.eventId;
    const allRsvps = eventId
      ? await ctx.db
          .query("rsvps")
          .withIndex("by_event", (q) => q.eq("eventId", eventId))
          .collect()
      : await ctx.db.query("rsvps").collect();

    for (const rsvp of allRsvps) {
      try {
        results.processed++;

        // Skip if no customFieldValues
        if (!rsvp.customFieldValues || typeof rsvp.customFieldValues !== "object") {
          results.skipped++;
          continue;
        }

        const existingValues: Record<string, string> = {};
        for (const [key, value] of Object.entries(rsvp.customFieldValues)) {
          if (typeof value === "string") {
            existingValues[key] = value;
          }
        }

        // Check if any old keys exist that need to be renamed
        let modified = false;
        const updatedValues: Record<string, string> = { ...existingValues };

        for (const [oldKey, newKey] of Object.entries(keyMappings)) {
          // Skip if old key doesn't exist
          if (!(oldKey in existingValues)) {
            continue;
          }

          // Skip if new key already exists with a different value (preserve existing data)
          if (newKey in existingValues && existingValues[newKey] !== existingValues[oldKey]) {
            console.warn(
              `[RENAME KEYS] RSVP ${rsvp._id}: New key "${newKey}" already exists with different value. Skipping rename for "${oldKey}".`,
            );
            continue;
          }

          // Move value from old key to new key
          // Only overwrite if new key doesn't exist or has same value
          if (!(newKey in existingValues) || existingValues[newKey] === existingValues[oldKey]) {
            updatedValues[newKey] = existingValues[oldKey];
          }

          // Remove old key
          delete updatedValues[oldKey];
          modified = true;
        }

        if (!modified) {
          results.skipped++;
          continue;
        }

        // Sanitize: remove empty values
        const sanitizedEntries: Array<[string, string]> = [];
        for (const [key, value] of Object.entries(updatedValues)) {
          if (typeof value === "string" && value !== "") {
            sanitizedEntries.push([key, value]);
          }
        }

        const sanitizedValues =
          sanitizedEntries.length > 0
            ? (Object.fromEntries(sanitizedEntries) as Record<string, string>)
            : undefined;

        // Update RSVP
        await ctx.db.patch(rsvp._id as Id<"rsvps">, {
          customFieldValues: sanitizedValues,
          updatedAt: Date.now(),
        });

        results.updated++;
        console.log(
          `[RENAME KEYS] Updated RSVP ${rsvp._id}: Renamed ${Object.keys(keyMappings).join(", ")}`,
        );
      } catch (error) {
        const errorMessage = `Failed to update RSVP ${rsvp._id}: ${error}`;
        results.errors.push(errorMessage);
        console.error(`[RENAME KEYS] ${errorMessage}`);
      }
    }

    return results;
  },
});

const defaultSocialPlatformByKey = new Map(
  DEFAULT_SOCIAL_PLATFORM_CONFIGS.map((platform) => [
    platform.platformKey,
    platform,
  ]),
);

function getSocialPlatformConfig(
  platformKey: string,
): PrimarySocialPlatformConfig {
  const defaultConfig = defaultSocialPlatformByKey.get(platformKey);
  return (
    defaultConfig ?? {
      platformKey,
      label: platformKey
        .split("-")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" "),
    }
  );
}

function buildPrimaryFieldBackfillCandidates(
  eventCustomFields: EventCustomFieldDefinition[] | undefined,
  customFieldValues: Record<string, string>,
): EventCustomFieldDefinition[] {
  const customFieldDefinitionsByKey = new Map<
    string,
    EventCustomFieldDefinition
  >();

  for (const customField of eventCustomFields ?? []) {
    customFieldDefinitionsByKey.set(customField.key, {
      ...customField,
      canHide: true,
    });
  }

  for (const fieldKey of Object.keys(customFieldValues)) {
    if (customFieldDefinitionsByKey.has(fieldKey)) continue;

    customFieldDefinitionsByKey.set(fieldKey, {
      key: fieldKey,
      label: fieldKey,
      canHide: false,
    });
  }

  return Array.from(customFieldDefinitionsByKey.values());
}

export const backfillPrimaryFieldsFromCustomFields = mutation({
  args: {
    dryRun: v.optional(v.boolean()),
    workspaceSlug: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    hideMigratedCustomFields: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    {
      dryRun = true,
      workspaceSlug,
      limit,
      cursor,
      hideMigratedCustomFields = false,
    },
  ): Promise<{
    dryRun: boolean;
    hideMigratedCustomFields: boolean;
    scannedRsvpCount: number;
    nextCursor: string | null;
    isDone: boolean;
    matchedSocialValueCount: number;
    matchedInvitedByValueCount: number;
    linkedProfileFieldValueCount: number;
    linkedWorkspaceGrantCount: number;
    hiddenCustomFieldDefinitionCount: number;
    patchedEventCount: number;
    patchedRsvpCount: number;
  }> => {
    await requireCoucouPlatformMember(ctx);

    const allEvents = await ctx.db.query("events").collect();
    const eventById = new Map(
      allEvents
        .filter(
          (event) =>
            !workspaceSlug ||
            event.workspaceSlug === workspaceSlug ||
            event.siteKey === workspaceSlug,
        )
        .map((event) => [event._id, event]),
    );
    const batchSize = Math.min(
      Math.max(Math.floor(limit && limit > 0 ? limit : 100), 1),
      250,
    );
    const rsvpPage = await ctx.db.query("rsvps").order("asc").paginate({
      cursor: cursor ?? null,
      numItems: batchSize,
    });
    const scopedRsvps = rsvpPage.page.filter((rsvp) =>
      eventById.has(rsvp.eventId),
    );

    let matchedSocialValueCount = 0;
    let matchedInvitedByValueCount = 0;
    let linkedProfileFieldValueCount = 0;
    let linkedWorkspaceGrantCount = 0;
    let patchedEventCount = 0;
    let patchedRsvpCount = 0;
    const userByClerkUserId = new Map<
      string,
      Doc<"users"> | null
    >();
    const eventPrimaryFieldPatches = new Map<
      Id<"events">,
      {
        socialPlatformsByKey: Map<string, PrimarySocialPlatformConfig>;
        invitedByEnabled: boolean;
        customFieldKeysToHide: Set<string>;
      }
    >();
    const getOrCreateEventPrimaryFieldPatch = (eventId: Id<"events">) => {
      const existingPatch = eventPrimaryFieldPatches.get(eventId);
      if (existingPatch) return existingPatch;

      const patch = {
        socialPlatformsByKey: new Map<string, PrimarySocialPlatformConfig>(),
        invitedByEnabled: false,
        customFieldKeysToHide: new Set<string>(),
      };
      eventPrimaryFieldPatches.set(eventId, patch);
      return patch;
    };

    for (const event of eventById.values()) {
      for (const customField of
        buildPrimaryFieldBackfillCandidates(
          event.customFields as EventCustomFieldDefinition[] | undefined,
          {},
        )) {
        const socialPlatformKey =
          detectSocialPlatformKeyFromCustomField(customField);
        const isInvitedByField = isInvitedByCustomField(customField);
        if (!socialPlatformKey && !isInvitedByField) continue;

        const patch = getOrCreateEventPrimaryFieldPatch(event._id);
        patch.customFieldKeysToHide.add(customField.key);
        if (socialPlatformKey) {
          patch.socialPlatformsByKey.set(
            socialPlatformKey,
            getSocialPlatformConfig(socialPlatformKey),
          );
        }
        if (isInvitedByField) {
          patch.invitedByEnabled = true;
        }
      }
    }
    const candidateCustomFieldDefinitionCount = Array.from(
      eventPrimaryFieldPatches.values(),
    ).reduce(
      (totalHiddenCustomFields, patch) =>
        totalHiddenCustomFields + patch.customFieldKeysToHide.size,
      0,
    );

    for (const rsvp of scopedRsvps) {
      const event = eventById.get(rsvp.eventId);
      if (!event || !rsvp.customFieldValues) continue;

      const submittedProfiles: SanitizedSubmittedSocialProfile[] = [];
      let invitedByName: string | undefined;
      const customFieldDefinitions = buildPrimaryFieldBackfillCandidates(
        event.customFields as EventCustomFieldDefinition[] | undefined,
        rsvp.customFieldValues,
      );

      for (const customField of customFieldDefinitions) {
        const rawValue = rsvp.customFieldValues[customField.key];
        if (!rawValue?.trim()) continue;

        const socialPlatformKey =
          detectSocialPlatformKeyFromCustomField(customField);
        if (socialPlatformKey) {
          const handle = normalizeSocialHandleInput(rawValue, socialPlatformKey);
          if (!handle) continue;
          submittedProfiles.push({
            platformKey: socialPlatformKey,
            handle,
            normalizedHandle: normalizePrimaryFieldLookupText(handle),
          });
          matchedSocialValueCount += 1;
          const patch = getOrCreateEventPrimaryFieldPatch(event._id);
          if (customField.canHide) {
            patch.customFieldKeysToHide.add(customField.key);
          }
          patch.socialPlatformsByKey.set(
            socialPlatformKey,
            getSocialPlatformConfig(socialPlatformKey),
          );
        }

        if (isInvitedByCustomField(customField)) {
          invitedByName = rawValue;
          matchedInvitedByValueCount += 1;
          const patch = getOrCreateEventPrimaryFieldPatch(event._id);
          if (customField.canHide) {
            patch.customFieldKeysToHide.add(customField.key);
          }
          patch.invitedByEnabled = true;
        }
      }

      if (dryRun || (submittedProfiles.length === 0 && !invitedByName)) {
        continue;
      }

      let user = userByClerkUserId.get(rsvp.clerkUserId);
      if (!userByClerkUserId.has(rsvp.clerkUserId)) {
        user = await ctx.db
          .query("users")
          .withIndex("by_clerkUserId", (queryBuilder) =>
            queryBuilder.eq("clerkUserId", rsvp.clerkUserId),
          )
          .unique();
        userByClerkUserId.set(rsvp.clerkUserId, user ?? null);
      }
      const configuredPlatformKeys = new Set(
        submittedProfiles.map((profile) => profile.platformKey),
      );
      if (submittedProfiles.length > 0) {
        const profileGrantSyncResult =
          await createProfileValuesAndWorkspaceGrantsForSocialProfiles(ctx, {
            event,
            rsvpId: rsvp._id,
            clerkUserId: rsvp.clerkUserId,
            userId: user?._id,
            submittedProfiles,
          });
        linkedProfileFieldValueCount +=
          profileGrantSyncResult.profileFieldValueCount;
        linkedWorkspaceGrantCount += profileGrantSyncResult.workspaceGrantCount;
        await replaceRsvpSocialProfileSnapshots(ctx, {
          eventId: rsvp.eventId,
          rsvpId: rsvp._id,
          clerkUserId: rsvp.clerkUserId,
          userId: user?._id,
          configuredPlatformKeys,
          submittedProfiles,
        });
      }

      if (invitedByName) {
        await ctx.db.patch(rsvp._id, {
          ...buildInvitedByPatch(invitedByName),
          updatedAt: Date.now(),
        });
      }
      patchedRsvpCount += 1;
    }

    if (!dryRun && rsvpPage.isDone) {
      for (const [eventId, patch] of eventPrimaryFieldPatches.entries()) {
        const event = eventById.get(eventId);
        if (!event) continue;
        const existingSocialPlatforms =
          event.primaryFieldConfig?.socialPlatforms ?? [];
        const socialPlatformsByKey = new Map(
          existingSocialPlatforms.map((platform) => [
            platform.platformKey,
            platform,
          ]),
        );
        for (const [platformKey, platform] of patch.socialPlatformsByKey) {
          if (!socialPlatformsByKey.has(platformKey)) {
            socialPlatformsByKey.set(platformKey, platform);
          }
        }
        const primaryFieldConfig = sanitizePrimaryFieldConfig({
          socialPlatforms: Array.from(socialPlatformsByKey.values()),
          invitedBy:
            patch.invitedByEnabled || event.primaryFieldConfig?.invitedBy
              ? {
                  enabled:
                    event.primaryFieldConfig?.invitedBy?.enabled ??
                    patch.invitedByEnabled,
                  label:
                    event.primaryFieldConfig?.invitedBy?.label ??
                    "Invited by",
                  placeholder:
                    event.primaryFieldConfig?.invitedBy?.placeholder ??
                    "Who invited you?",
                }
              : undefined,
        });
        const eventUpdate: {
          primaryFieldConfig: PrimaryFieldConfig | undefined;
          customFields?: Doc<"events">["customFields"];
          updatedAt: number;
        } = {
          primaryFieldConfig,
          updatedAt: Date.now(),
        };

        if (hideMigratedCustomFields && patch.customFieldKeysToHide.size > 0) {
          const visibleCustomFields = (event.customFields ?? []).filter(
            (customField) => !patch.customFieldKeysToHide.has(customField.key),
          );
          eventUpdate.customFields =
            visibleCustomFields.length > 0 ? visibleCustomFields : undefined;
        }

        await ctx.db.patch(eventId, eventUpdate);
        patchedEventCount += 1;
      }
    }

    return {
      dryRun,
      hideMigratedCustomFields,
      scannedRsvpCount: rsvpPage.page.length,
      nextCursor: rsvpPage.isDone ? null : rsvpPage.continueCursor,
      isDone: rsvpPage.isDone,
      matchedSocialValueCount,
      matchedInvitedByValueCount,
      linkedProfileFieldValueCount,
      linkedWorkspaceGrantCount,
      hiddenCustomFieldDefinitionCount: hideMigratedCustomFields
        ? candidateCustomFieldDefinitionCount
        : 0,
      patchedEventCount,
      patchedRsvpCount,
    };
  },
});
