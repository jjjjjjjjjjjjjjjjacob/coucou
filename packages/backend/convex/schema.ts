import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  eventActValidator,
  eventLifecycleValidator,
  eventStatusValidator,
} from "./lib/eventMetadata";

const socialPlatformConfigValidator = v.object({
  platformKey: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  profileUrlPrefix: v.optional(v.string()),
  required: v.optional(v.boolean()),
});

const invitedByPrimaryFieldConfigValidator = v.object({
  enabled: v.boolean(),
  label: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  required: v.optional(v.boolean()),
});

const primaryFieldConfigValidator = v.object({
  socialPlatforms: v.optional(v.array(socialPlatformConfigValidator)),
  invitedBy: v.optional(invitedByPrimaryFieldConfigValidator),
});

const workspaceEventDefaultsValidator = v.object({
  themeBackgroundColor: v.optional(v.string()),
  themeTextColor: v.optional(v.string()),
  listKeys: v.optional(v.array(v.string())),
  socialPlatforms: v.optional(v.array(socialPlatformConfigValidator)),
  invitedBy: v.optional(invitedByPrimaryFieldConfigValidator),
  referralSharingEnabled: v.optional(v.boolean()),
});

const smsRsvpMissingFieldValidator = v.object({
  kind: v.union(
    v.literal("full_name"),
    v.literal("social"),
    v.literal("invited_by"),
    v.literal("custom"),
  ),
  key: v.string(),
  label: v.string(),
});

const inviterHistoryEntryValidator = v.object({
  displayName: v.string(),
  normalizedName: v.string(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
});

export default defineSchema({
  workspaces: defineTable({
    slug: v.string(),
    name: v.string(),
    kind: v.optional(v.string()),
    primaryDomain: v.optional(v.string()),
    clerkOrganizationId: v.optional(v.string()),
    clerkOrganizationSlug: v.optional(v.string()),
    preset: v.optional(
      v.union(v.literal("maison"), v.literal("dojo"), v.literal("atrium"), v.literal("coucou")),
    ),
    authBranding: v.optional(
      v.object({
        heading: v.optional(v.string()),
        sub: v.optional(v.string()),
        eyebrow: v.optional(v.string()),
        brandMarkStyle: v.optional(
          v.union(
            v.literal("filled-circle"),
            v.literal("square-serif"),
            v.literal("thin-ring"),
            v.literal("logo-upload"),
            v.literal("wordmark-only"),
          ),
        ),
        logoStorageId: v.optional(v.id("_storage")),
        showCoucouAttribution: v.optional(v.boolean()),
      }),
    ),
    showCoucouProfileLink: v.optional(v.boolean()),
    plan: v.optional(
      v.object({
        tier: v.string(),
        priceCents: v.optional(v.number()),
        billingStatus: v.optional(
          v.union(v.literal("ok"), v.literal("watch"), v.literal("overdue")),
        ),
        nextInvoiceAt: v.optional(v.number()),
        lastInvoiceAt: v.optional(v.number()),
      }),
    ),
    limits: v.optional(
      v.object({
        smsPerDay: v.optional(v.number()),
        smsPerMonth: v.optional(v.number()),
        rsvpsPerEvent: v.optional(v.number()),
      }),
    ),
    eventDefaults: v.optional(workspaceEventDefaultsValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_kind", ["kind"])
    .index("by_clerkOrg", ["clerkOrganizationId"])
    .index("by_clerkOrgSlug", ["clerkOrganizationSlug"]),

  workspaceSites: defineTable({
    workspaceId: v.id("workspaces"),
    siteKey: v.string(),
    domain: v.string(),
    appKind: v.string(),
    clerkFrontendApiUrl: v.optional(v.string()),
    clerkSatelliteVerificationStatus: v.optional(
      v.union(
        v.literal("unconfigured"),
        v.literal("pending"),
        v.literal("verified"),
        v.literal("failed"),
      ),
    ),
    clerkSatelliteAuthEnabled: v.optional(v.boolean()),
    clerkSatelliteLastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_siteKey", ["siteKey"]),

  users: defineTable({
    // Temporarily optional to run migration; switch back to v.string() after.
    clerkUserId: v.optional(v.string()),
    phone: v.optional(v.string()),
    phoneHash: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    referralCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_phone", ["phone"])
    .index("by_phoneHash", ["phoneHash"])
    .index("by_referralCode", ["referralCode"]),

  // Retired Clerk identities remain durable aliases after same-phone users are
  // physically consolidated. Reads and writes resolve aliases before touching
  // user-owned state, so an older Clerk account can never recreate a user row.
  userIdentityAliases: defineTable({
    aliasClerkUserId: v.string(),
    canonicalClerkUserId: v.string(),
    canonicalUserId: v.id("users"),
    phoneHash: v.optional(v.string()),
    retiredUserId: v.optional(v.id("users")),
    legacyReferralCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_alias", ["aliasClerkUserId"])
    .index("by_canonical", ["canonicalClerkUserId"])
    .index("by_canonical_user", ["canonicalUserId"])
    .index("by_retired_user", ["retiredUserId"])
    .index("by_phoneHash", ["phoneHash"])
    .index("by_legacyReferralCode", ["legacyReferralCode"]),

  orgMemberships: defineTable({
    clerkUserId: v.string(),
    organizationId: v.string(),
    role: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_org", ["organizationId"]),

  dashboardTablePreferences: defineTable({
    clerkUserId: v.string(),
    workspaceId: v.id("workspaces"),
    tableKey: v.string(),
    scopeKey: v.string(),
    columnOrder: v.array(v.string()),
    hiddenColumnIds: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user_workspace_table_scope", ["clerkUserId", "workspaceId", "tableKey", "scopeKey"]),

  dashboardPanelPreferences: defineTable({
    clerkUserId: v.string(),
    workspaceId: v.id("workspaces"),
    panelKey: v.string(),
    isOpen: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user_workspace_panel", ["clerkUserId", "workspaceId", "panelKey"]),

  // Organizer-set per-workspace guest annotations (tags, notes, default list).
  // A person is matched by guestPhoneHash first (stable across guest-account
  // claiming), then by clerkUserId; upserts write both when known.
  workspaceGuestProfiles: defineTable({
    workspaceId: v.id("workspaces"),
    clerkUserId: v.optional(v.string()),
    guestPhoneHash: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
    defaultListKey: v.optional(v.string()),
    invitedByHistory: v.optional(v.array(inviterHistoryEntryValidator)),
    updatedByClerkUserId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_clerkUserId", ["workspaceId", "clerkUserId"])
    .index("by_workspace_phoneHash", ["workspaceId", "guestPhoneHash"]),

  // Events & guest list credentials
  events: defineTable({
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    shortId: v.optional(v.string()),
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    description: v.optional(v.string()),
    acts: v.optional(v.array(eventActValidator)),
    hosts: v.optional(v.array(v.string())), // host names (comma-separated)
    productionCompany: v.optional(v.string()), // production company name that overrides host names in consent messaging
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    guestPortalImageStorageId: v.optional(v.id("_storage")),
    guestPortalLinkLabel: v.optional(v.string()),
    guestPortalLinkUrl: v.optional(v.string()),
    eventDate: v.number(), // ms since epoch
    eventEndDate: v.optional(v.number()), // ms since epoch
    eventTimezone: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()), // one event can be featured for home page redirect
    status: v.optional(eventStatusValidator),
    lifecycle: v.optional(eventLifecycleValidator),
    publishedAt: v.optional(v.number()),
    /**
     * @deprecated Use `sendQrOnApproval`. Retained for back-compat reads:
     * legacy rows where this is explicitly `false` continue to receive
     * QR-on-approval through the resolution helper's fallback branch.
     */
    defersQrDelivery: v.optional(v.boolean()),
    /**
     * Per-event opt-in for sending the QR code SMS at the moment of
     * approval. When undefined or false, hosts trigger a manual blast
     * (or scheduled batch) closer to the event instead. Per-list
     * `sendQrOnApproval` overrides this value when set.
     */
    sendQrOnApproval: v.optional(v.boolean()),
    /**
     * When enabled, RSVP forms ask guests whether they plan to attend.
     * When disabled, new RSVPs default to attendanceStatus="yes".
     */
    attendanceQuestionEnabled: v.optional(v.boolean()),
    referralSharingEnabled: v.optional(v.boolean()),
    maxAttendees: v.optional(v.number()), // maximum attendees allowed per RSVP (default 1)
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
          prependUrl: v.optional(v.string()),
          trimWhitespace: v.optional(v.boolean()),
        }),
      ),
    ),
    primaryFieldConfig: v.optional(primaryFieldConfigValidator),
    themeBackgroundColor: v.optional(v.string()),
    themeTextColor: v.optional(v.string()),
    approvalMessage: v.optional(v.string()), // custom approval message for SMS
    /**
     * Initial SMS reply after an RSVP is submitted through a text reply action.
     * Undefined `rsvpConfirmationMessageEnabled` preserves legacy default-on behavior.
     */
    rsvpConfirmationMessageEnabled: v.optional(v.boolean()),
    rsvpConfirmationMessage: v.optional(v.string()),
    qrCodeColor: v.optional(v.string()), // legacy QR code color field retained for compatibility
    webhookOriginApiClientId: v.optional(v.id("apiClients")),
    webhookOriginMutationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_featured", ["isFeatured"]) // for quick featured event lookup
    .index("by_shortId", ["shortId"])
    .index("by_date", ["eventDate"])
    .index("by_workspaceSlug", ["workspaceSlug"])
    .index("by_siteKey", ["siteKey"]),

  listCredentials: defineTable({
    eventId: v.id("events"),
    listKey: v.string(), // e.g., 'vip', 'ga'
    password: v.optional(v.string()), // host-visible event list password
    passwordNormalized: v.optional(v.string()), // normalized for lookup/dedupe
    passwordHash: v.optional(v.string()), // deprecated
    passwordSalt: v.optional(v.string()), // deprecated
    passwordIterations: v.optional(v.number()), // deprecated
    passwordFingerprint: v.optional(v.string()), // deprecated
    encryptedPassword: v.optional(
      v.object({ ivB64: v.string(), ctB64: v.string(), tagB64: v.string() }),
    ), // deprecated
    generateQR: v.optional(v.boolean()), // whether to generate QR codes for this list
    /**
     * @deprecated Use `sendQrOnApproval`. Retained for back-compat reads
     * — see notes on the events.defersQrDelivery field.
     */
    defersQrDelivery: v.optional(v.boolean()),
    /**
     * Per-list override of the event-level `sendQrOnApproval` opt-in.
     * `undefined` inherits, `true` always sends QR with approval text,
     * `false` always defers to a host-driven blast.
     */
    sendQrOnApproval: v.optional(v.boolean()),
    /**
     * Whether the approval SMS should contain the guest's ticket URL.
     * Undefined preserves the legacy behavior derived from QR delivery timing.
     */
    includeTicketLinkOnApproval: v.optional(v.boolean()),
    approvalMessage: v.optional(v.string()), // per-list approval SMS copy
    /**
     * Number of RSVP submissions that may be approved automatically for this list.
     * Undefined or zero disables automatic approval.
     */
    autoApproveLimit: v.optional(v.number()),
    /**
     * Lifetime number of automatic-approval slots consumed for this list.
     * Manual approvals and later RSVP status changes never modify this counter.
     */
    autoApprovedCount: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"]) // lookup for a given event
    .index("by_passwordNormalized", ["passwordNormalized"])
    .index("by_event_key", ["eventId", "listKey"]), // NEW: for migration lookups

  profiles: defineTable({
    clerkUserId: v.string(),
    phoneEnc: v.optional(v.object({ ivB64: v.string(), ctB64: v.string(), tagB64: v.string() })), // deprecated
    phoneObfuscated: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["clerkUserId"]),

  rsvps: defineTable({
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(), // Primary reference to list credentials
    userName: v.optional(v.string()), // Denormalized from users table
    guestPhoneHash: v.optional(v.string()),
    guestPhoneObfuscated: v.optional(v.string()),
    pairedAt: v.optional(v.number()),
    ticketStatus: v.optional(v.string()), // 'not-issued' | 'issued' | 'disabled' | 'redeemed'
    shareContact: v.boolean(),
    note: v.optional(v.string()),
    attendees: v.optional(v.number()), // total number of attendees including RSVP person (default 1)
    smsConsent: v.optional(v.boolean()), // whether user consented to SMS notifications
    smsConsentTimestamp: v.optional(v.number()), // when SMS consent was given/withdrawn
    smsConsentIpAddress: v.optional(v.string()), // IP address when consent was given for compliance
    customFieldValues: v.optional(v.record(v.string(), v.string())),
    invitedByName: v.optional(v.string()),
    invitedByNormalizedName: v.optional(v.string()),
    invitedBySocialPlatformKey: v.optional(v.string()),
    invitedBySocialHandle: v.optional(v.string()),
    invitedByUserId: v.optional(v.id("users")),
    referralCode: v.optional(v.string()),
    referrerUserId: v.optional(v.id("users")),
    referrerClerkUserId: v.optional(v.string()),
    referredByName: v.optional(v.string()),
    /**
     * @deprecated Approval-only compatibility field. New writes mirror
     * `approvalStatus` here and never write "attending".
     */
    status: v.string(), // 'pending' | 'approved' | 'denied' | legacy 'attending'
    approvalStatus: v.optional(v.string()), // 'pending' | 'approved' | 'denied'
    attendanceStatus: v.optional(v.string()), // 'yes' | 'no' | 'maybe'
    ticketViewedAt: v.optional(v.number()),
    apiClientId: v.optional(v.id("apiClients")), // set when created/updated via the partner API
    webhookOriginApiClientId: v.optional(v.id("apiClients")),
    webhookOriginMutationId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"]) // host view
    .index("by_user", ["clerkUserId"]) // user lookup
    .index("by_event_user", ["eventId", "clerkUserId"])
    .index("by_guestPhoneHash", ["guestPhoneHash"])
    .index("by_event_guestPhoneHash", ["eventId", "guestPhoneHash"])
    // NEW indexes for efficient filtering
    .index("by_event_status", ["eventId", "status"])
    .index("by_event_approvalStatus", ["eventId", "approvalStatus"])
    .index("by_event_attendanceStatus", ["eventId", "attendanceStatus"])
    .index("by_event_ticketStatus", ["eventId", "ticketStatus"])
    .index("by_event_status_ticketStatus", ["eventId", "status", "ticketStatus"])
    .index("by_event_invitedBy", ["eventId", "invitedByNormalizedName"])
    .searchIndex("search_text", {
      searchField: "userName",
      filterFields: ["eventId", "status", "listKey", "ticketStatus"],
    }),

  // A retired RSVP ID can still be found after a same-event identity collision.
  // This is intentionally separate from immutable audit/webhook payloads, whose
  // original IDs and JSON snapshots are never rewritten.
  rsvpIdentityAliases: defineTable({
    retiredRsvpId: v.id("rsvps"),
    canonicalRsvpId: v.id("rsvps"),
    retiredClerkUserId: v.string(),
    canonicalClerkUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_retired", ["retiredRsvpId"])
    .index("by_canonical", ["canonicalRsvpId"]),

  userSmsOrganizerPreferences: defineTable({
    clerkUserId: v.string(),
    organizerKey: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    smsConsent: v.boolean(),
    smsConsentTimestamp: v.optional(v.number()),
    smsConsentIpAddress: v.optional(v.string()),
    sourceEventId: v.optional(v.id("events")),
    sourceRsvpId: v.optional(v.id("rsvps")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_user_organizer", ["clerkUserId", "organizerKey"])
    .index("by_organizer", ["organizerKey"]),

  rsvpGuestHandoffs: defineTable({
    tokenHash: v.string(),
    rsvpId: v.id("rsvps"),
    phoneNumber: v.string(),
    phoneHash: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_rsvp", ["rsvpId"])
    .index("by_expiresAt", ["expiresAt"]),

  userSocialProfiles: defineTable({
    clerkUserId: v.string(),
    userId: v.optional(v.id("users")),
    platformKey: v.string(),
    handle: v.string(),
    normalizedHandle: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_user_platform", ["clerkUserId", "platformKey"])
    .index("by_platform_handle", ["platformKey", "normalizedHandle"]),

  profileFieldValues: defineTable({
    clerkUserId: v.string(),
    userId: v.optional(v.id("users")),
    fieldKey: v.string(),
    value: v.string(),
    normalizedValue: v.string(),
    label: v.optional(v.string()),
    source: v.optional(v.string()),
    sourceEventId: v.optional(v.id("events")),
    sourceRsvpId: v.optional(v.id("rsvps")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_user_field", ["clerkUserId", "fieldKey"])
    .index("by_user_field_value", ["clerkUserId", "fieldKey", "normalizedValue"]),

  workspaceProfileValueGrants: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    clerkUserId: v.string(),
    fieldKey: v.string(),
    profileFieldValueId: v.id("profileFieldValues"),
    sourceEventId: v.optional(v.id("events")),
    sourceRsvpId: v.optional(v.id("rsvps")),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_user", ["workspaceId", "clerkUserId"])
    .index("by_workspace_user_field", ["workspaceId", "clerkUserId", "fieldKey"])
    .index("by_workspace_user_field_value", [
      "workspaceId",
      "clerkUserId",
      "fieldKey",
      "profileFieldValueId",
    ])
    .index("by_workspaceSlug_user_field_value", [
      "workspaceSlug",
      "clerkUserId",
      "fieldKey",
      "profileFieldValueId",
    ])
    .index("by_siteKey_user_field_value", [
      "siteKey",
      "clerkUserId",
      "fieldKey",
      "profileFieldValueId",
    ])
    .index("by_profile_value", ["profileFieldValueId"]),

  rsvpSocialProfiles: defineTable({
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    clerkUserId: v.string(),
    userSocialProfileId: v.optional(v.id("userSocialProfiles")),
    platformKey: v.string(),
    handle: v.string(),
    normalizedHandle: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_rsvp", ["rsvpId"])
    .index("by_rsvp_platform", ["rsvpId", "platformKey"])
    .index("by_event_platform", ["eventId", "platformKey"])
    .index("by_event_platform_handle", ["eventId", "platformKey", "normalizedHandle"]),

  approvals: defineTable({
    eventId: v.id("events"),
    rsvpId: v.id("rsvps"),
    clerkUserId: v.string(),
    listKey: v.string(), // Primary reference to list credentials
    decision: v.string(), // 'approved' | 'denied'
    decidedBy: v.string(), // clerkUserId of host
    decidedAt: v.number(),
    denialReason: v.optional(v.string()),
  }).index("by_event", ["eventId"]),

  redemptions: defineTable({
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(), // Primary reference to list credentials
    code: v.string(), // url-safe token
    createdAt: v.number(),
    disabledAt: v.optional(v.number()),
    redeemedAt: v.optional(v.number()),
    qrDeliveredAt: v.optional(v.number()), // when QR was delivered (deferred delivery flow)
    redeemedByClerkUserId: v.optional(v.string()), // clerkUserId of redeemer (host/door)
    unredeemHistory: v.array(
      v.object({
        at: v.number(),
        byClerkUserId: v.string(),
        reason: v.optional(v.string()),
      }),
    ),
  })
    .index("by_code", ["code"]) // unique lookup
    .index("by_event_user", ["eventId", "clerkUserId"]), // ensure one redemption per user/event

  // SMS notifications tracking
  smsNotifications: defineTable({
    eventId: v.id("events"),
    recipientClerkUserId: v.string(),
    recipientPhoneObfuscated: v.string(), // ***-***-1234 format for display
    recipientPhoneHash: v.optional(v.string()),
    type: v.string(), // 'approval' | 'blast' | 'reminder' | 'rsvp_confirmation' | 'sms_consent_enabled' | 'sms_consent_disabled'
    message: v.string(),
    status: v.string(), // 'pending' | 'sent' | 'failed'
    messageId: v.optional(v.string()), // AWS SNS MessageId
    textBlastId: v.optional(v.id("textBlasts")),
    textBlastRecipientId: v.optional(v.id("textBlastRecipients")),
    errorMessage: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_user", ["recipientClerkUserId"])
    .index("by_status", ["status"])
    .index("by_type", ["type"])
    .index("by_text_blast", ["textBlastId"]),

  // Text blast campaigns
  textBlasts: defineTable({
    eventId: v.id("events"),
    targetEventIds: v.optional(v.array(v.id("events"))),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()), // ['vip', 'ga', etc.]
    recipientFilter: v.optional(v.string()), // Serialized recipient filter config
    selectedRsvpIds: v.optional(v.array(v.id("rsvps"))),
    recipientHistoryFilter: v.optional(
      v.object({
        type: v.union(v.literal("received_any"), v.literal("not_received_any")),
        textBlastIds: v.array(v.id("textBlasts")),
      }),
    ),
    includeQrCodes: v.optional(v.boolean()), // Whether to include QR code images in MMS
    deliveryTrackingEnabled: v.optional(v.boolean()),
    recipientCount: v.number(),
    sentCount: v.number(),
    failedCount: v.number(),
    sentBy: v.string(), // clerkUserId of host who sent
    scheduledFor: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    status: v.string(), // 'draft' | 'sending' | 'sent' | 'failed'
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_status", ["status"])
    .index("by_sent_by", ["sentBy"]),

  textBlastRecipients: defineTable({
    textBlastId: v.id("textBlasts"),
    phoneHash: v.string(),
    status: v.string(), // 'pending' | 'sent' | 'failed'
    smsNotificationId: v.optional(v.id("smsNotifications")),
    sourceEventIds: v.array(v.id("events")),
    sourceRsvpIds: v.array(v.id("rsvps")),
    sourceListKeys: v.array(v.string()),
    recipientClerkUserIds: v.array(v.string()),
    messageId: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_text_blast", ["textBlastId"])
    .index("by_text_blast_phone", ["textBlastId", "phoneHash"])
    .index("by_text_blast_status", ["textBlastId", "status"])
    .index("by_phone", ["phoneHash"]),

  textBlastReplyActions: defineTable({
    textBlastId: v.id("textBlasts"),
    replyCode: v.string(),
    replyCodeNormalized: v.string(),
    targetEventId: v.id("events"),
    targetListKey: v.string(),
    isEnabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_text_blast", ["textBlastId"])
    .index("by_text_blast_code", ["textBlastId", "replyCodeNormalized"])
    .index("by_code", ["replyCodeNormalized"])
    .index("by_target_event", ["targetEventId"]),

  textBlastReplyAttempts: defineTable({
    textBlastId: v.optional(v.id("textBlasts")),
    textBlastRecipientId: v.optional(v.id("textBlastRecipients")),
    replyActionId: v.optional(v.id("textBlastReplyActions")),
    phoneHash: v.string(),
    fromPhoneObfuscated: v.string(),
    inboundMessage: v.string(),
    normalizedReplyCode: v.string(),
    targetEventId: v.optional(v.id("events")),
    targetListKey: v.optional(v.string()),
    sourceRsvpId: v.optional(v.id("rsvps")),
    destinationRsvpId: v.optional(v.id("rsvps")),
    status: v.string(),
    responseMessage: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    messageSid: v.optional(v.string()),
    receivedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_text_blast", ["textBlastId"])
    .index("by_phone", ["phoneHash"])
    .index("by_reply_action", ["replyActionId"])
    .index("by_status", ["status"]),

  smsCodeClaims: defineTable({
    normalizedCode: v.string(),
    kind: v.union(v.literal("event_list"), v.literal("blast_action")),
    eventId: v.id("events"),
    listCredentialId: v.optional(v.id("listCredentials")),
    replyActionId: v.optional(v.id("textBlastReplyActions")),
    textBlastId: v.optional(v.id("textBlasts")),
    phoneHash: v.optional(v.string()),
    status: v.union(v.literal("reserved"), v.literal("active")),
    reservationExpiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_code", ["normalizedCode"])
    .index("by_code_phone", ["normalizedCode", "phoneHash"])
    .index("by_event", ["eventId"])
    .index("by_list_credential", ["listCredentialId"])
    .index("by_reply_action", ["replyActionId"])
    .index("by_text_blast", ["textBlastId"]),

  smsRsvpSessions: defineTable({
    phoneHash: v.string(),
    phoneObfuscated: v.string(),
    eventId: v.id("events"),
    listKey: v.string(),
    sourceKind: v.union(v.literal("event_code"), v.literal("blast_action")),
    normalizedCode: v.string(),
    listCredentialId: v.optional(v.id("listCredentials")),
    replyActionId: v.optional(v.id("textBlastReplyActions")),
    textBlastId: v.optional(v.id("textBlasts")),
    textBlastRecipientId: v.optional(v.id("textBlastRecipients")),
    clerkUserId: v.string(),
    registeredUserId: v.optional(v.id("users")),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    socialProfiles: v.array(
      v.object({
        platformKey: v.string(),
        handle: v.string(),
      }),
    ),
    invitedByName: v.optional(v.string()),
    customFieldValues: v.record(v.string(), v.string()),
    missingFields: v.array(smsRsvpMissingFieldValidator),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_phone_status", ["phoneHash", "status"])
    .index("by_event", ["eventId"])
    .index("by_expires_at", ["expiresAt"]),

  smsInboundReceipts: defineTable({
    providerMessageId: v.string(),
    phoneHash: v.string(),
    toPhoneNumber: v.string(),
    body: v.string(),
    status: v.union(v.literal("processing"), v.literal("processed"), v.literal("failed")),
    outcome: v.optional(
      v.union(
        v.literal("unmatched_message"),
        v.literal("not_eligible"),
        v.literal("session_pending"),
        v.literal("submitted"),
        v.literal("existing"),
        v.literal("conflict"),
        v.literal("target_unavailable"),
        v.literal("invalid_values"),
        v.literal("opt_out"),
        v.literal("opt_in"),
        v.literal("help"),
        v.literal("error"),
      ),
    ),
    responseMessage: v.optional(v.string()),
    targetEventId: v.optional(v.id("events")),
    sessionId: v.optional(v.id("smsRsvpSessions")),
    receivedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_provider_message", ["providerMessageId"])
    .index("by_phone", ["phoneHash"])
    .index("by_status", ["status"]),

  smsConversationThreads: defineTable({
    eventId: v.id("events"),
    phoneHash: v.string(),
    phoneObfuscated: v.string(),
    participantClerkUserIds: v.array(v.string()),
    lastMessageBody: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    lastMessageDirection: v.optional(
      v.union(v.literal("inbound"), v.literal("outbound"), v.literal("system")),
    ),
    lastMessageKind: v.optional(
      v.union(
        v.literal("sms"),
        v.literal("manual"),
        v.literal("blast"),
        v.literal("approval"),
        v.literal("consent"),
        v.literal("reply_action"),
        v.literal("opt_out"),
        v.literal("help"),
        v.literal("delivery_status"),
        v.literal("system"),
      ),
    ),
    messageCount: v.number(),
    inboundCount: v.number(),
    outboundCount: v.number(),
    systemCount: v.number(),
    lastInboundAt: v.optional(v.number()),
    lastOutboundAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_event_phone", ["eventId", "phoneHash"])
    .index("by_phone", ["phoneHash"]),

  smsConversationMessages: defineTable({
    threadId: v.id("smsConversationThreads"),
    eventId: v.id("events"),
    phoneHash: v.string(),
    direction: v.union(v.literal("inbound"), v.literal("outbound"), v.literal("system")),
    kind: v.union(
      v.literal("sms"),
      v.literal("manual"),
      v.literal("blast"),
      v.literal("approval"),
      v.literal("consent"),
      v.literal("reply_action"),
      v.literal("opt_out"),
      v.literal("help"),
      v.literal("delivery_status"),
      v.literal("system"),
    ),
    body: v.optional(v.string()),
    mediaUrls: v.optional(v.array(v.string())),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    smsNotificationId: v.optional(v.id("smsNotifications")),
    textBlastId: v.optional(v.id("textBlasts")),
    textBlastRecipientId: v.optional(v.id("textBlastRecipients")),
    replyAttemptId: v.optional(v.id("textBlastReplyAttempts")),
    adminClerkUserId: v.optional(v.string()),
    rawPayload: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId"])
    .index("by_thread_created", ["threadId", "createdAt"])
    .index("by_event_phone", ["eventId", "phoneHash"])
    .index("by_providerMessageId", ["providerMessageId"])
    .index("by_sms_notification", ["smsNotificationId"]),

  // SMS usage tracking for cost monitoring and analytics
  smsUsageLogs: defineTable({
    messageId: v.string(), // AWS SNS Message ID
    phoneNumber: v.string(), // Obfuscated for privacy
    messageLength: v.number(),
    messageType: v.string(), // 'Transactional' | 'Promotional'
    estimatedCost: v.number(), // Cost in USD
    actualCost: v.optional(v.number()), // If available from AWS billing
    timestamp: v.number(),
    status: v.optional(v.string()), // 'delivered' | 'failed' | 'unknown'
  })
    .index("by_messageId", ["messageId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_message_type", ["messageType"])
    .index("by_cost", ["estimatedCost"]),

  // SMS opt-outs and preferences
  smsOptOuts: defineTable({
    phoneNumber: v.string(), // Hashed for privacy
    clerkUserId: v.optional(v.string()),
    optedOutAt: v.number(),
    reason: v.optional(v.string()), // 'user_request' | 'carrier_block' | 'invalid_number'
    reOptInAt: v.optional(v.number()),
  })
    .index("by_phone", ["phoneNumber"])
    .index("by_user", ["clerkUserId"]),

  // Pending tenant applications surfaced on /admin/pending
  tenantApplications: defineTable({
    name: v.string(),
    city: v.optional(v.string()),
    operator: v.string(),
    operatorEmail: v.optional(v.string()),
    body: v.optional(v.string()),
    submittedAt: v.number(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("denied")),
    workspaceId: v.optional(v.id("workspaces")),
    tenantAdminEmail: v.optional(v.string()),
    clerkOrganizationId: v.optional(v.string()),
    clerkOrganizationSlug: v.optional(v.string()),
    clerkInvitationId: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    decidedByClerkUserId: v.optional(v.string()),
    denialReason: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_submittedAt", ["submittedAt"]),

  // Attention flags surfaced on /admin/flags + dashboard "Attention" panel
  attentionFlags: defineTable({
    kind: v.union(v.literal("flag"), v.literal("watch")),
    label: v.string(),
    detail: v.optional(v.string()),
    observedAt: v.number(),
    workspaceId: v.optional(v.id("workspaces")),
    sourceModule: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("ack"), v.literal("resolved")),
    resolvedAt: v.optional(v.number()),
    resolvedByClerkUserId: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_observedAt", ["observedAt"])
    .index("by_workspace", ["workspaceId"]),

  // SMS sender phone configurations per workspace, surfaced on /admin/senders
  smsSenders: defineTable({
    workspaceId: v.id("workspaces"),
    phoneNumber: v.string(),
    brandLabel: v.optional(v.string()),
    verifiedAt: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_phoneNumber", ["phoneNumber"]),

  // Partner API clients — one row per issued API key (hash stored, plaintext shown once)
  apiClients: defineTable({
    workspaceId: v.id("workspaces"),
    displayName: v.string(),
    defaultRsvpListKey: v.optional(v.string()),
    keyPrefix: v.string(), // first characters of the plaintext key, for display/identification only
    keyHash: v.string(), // SHA-256 hex of the full plaintext key
    scopes: v.array(
      v.union(
        v.literal("events:read"),
        v.literal("events:write"),
        v.literal("rsvps:read"),
        v.literal("rsvps:write"),
      ),
    ),
    eventAccessMode: v.optional(v.union(v.literal("all"), v.literal("selected"))),
    allowedEventIds: v.optional(v.array(v.id("events"))),
    createdByClerkUserId: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_workspace", ["workspaceId"]),

  // Partner webhook endpoints — outbound delivery targets with per-endpoint secrets.
  // Secrets are stored readable by necessity: the encryption secret must be recoverable
  // to AES-encrypt payloads (hashing is not an option). Convex platform-side encryption
  // at rest is the mitigation; future hardening is envelope encryption with a master key.
  webhookEndpoints: defineTable({
    workspaceId: v.id("workspaces"),
    url: v.string(), // https:// only, enforced at write time
    description: v.optional(v.string()),
    encryptionSecretBase64: v.string(), // 32 random bytes, base64url — AES-256-GCM key
    signingSecretBase64: v.string(), // 32 random bytes, base64url — independent HMAC-SHA256 key
    secretGeneration: v.number(), // starts at 1, bumped on rotate; sent as keyGeneration
    subscribedEventTypes: v.array(v.string()), // validated against WEBHOOK_EVENT_TYPES at write time
    eventAccessMode: v.optional(v.union(v.literal("all"), v.literal("selected"))),
    allowedEventIds: v.optional(v.array(v.id("events"))),
    isActive: v.boolean(),
    disabledReason: v.optional(v.union(v.literal("manual"), v.literal("auto_failure"))),
    consecutiveFailureCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_active", ["workspaceId", "isActive"]),

  // Partner webhook delivery log — one row per (emitted event × endpoint)
  webhookDeliveries: defineTable({
    endpointId: v.id("webhookEndpoints"),
    workspaceId: v.id("workspaces"),
    eventType: v.string(),
    eventId: v.optional(v.id("events")),
    rsvpId: v.optional(v.id("rsvps")),
    payloadJson: v.string(), // plaintext payload snapshot; encrypted fresh per delivery attempt
    status: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("exhausted"),
      v.literal("skipped_inactive"),
    ),
    attemptCount: v.number(),
    nextAttemptAt: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
    lastResponseStatus: v.optional(v.number()),
    lastErrorMessage: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index("by_endpoint", ["endpointId", "occurredAt"])
    .index("by_workspace", ["workspaceId", "occurredAt"]),

  // Durable phoneHash → plaintext E.164 map for guest identity in partner webhooks.
  // Guest RSVPs only persist a phone hash; partner integrations need the real number
  // to match users across systems, so guest submissions record it here.
  guestContacts: defineTable({
    phoneHash: v.string(),
    phoneNumber: v.string(), // normalized E.164
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_phoneHash", ["phoneHash"]),

  // Cross-tenancy audit log
  auditLog: defineTable({
    at: v.number(),
    actorClerkUserId: v.optional(v.string()),
    actorEmail: v.optional(v.string()),
    action: v.string(),
    targetKind: v.optional(v.string()),
    targetId: v.optional(v.string()),
    workspaceId: v.optional(v.id("workspaces")),
    summary: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_at", ["at"])
    .index("by_actor", ["actorClerkUserId"])
    .index("by_action", ["action"])
    .index("by_workspace", ["workspaceId"]),
});
