import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const socialPlatformConfigValidator = v.object({
  platformKey: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  profileUrlPrefix: v.optional(v.string()),
});

const invitedByPrimaryFieldConfigValidator = v.object({
  enabled: v.boolean(),
  label: v.optional(v.string()),
  placeholder: v.optional(v.string()),
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
      v.union(
        v.literal("maison"),
        v.literal("dojo"),
        v.literal("atrium"),
        v.literal("coucou"),
      ),
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
    plan: v.optional(
      v.object({
        tier: v.string(),
        priceCents: v.optional(v.number()),
        billingStatus: v.optional(
          v.union(
            v.literal("ok"),
            v.literal("watch"),
            v.literal("overdue"),
          ),
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
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_siteKey", ["siteKey"]),

  users: defineTable({
    // Temporarily optional to run migration; switch back to v.string() after.
    clerkUserId: v.optional(v.string()),
    phone: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    metadata: v.optional(v.record(v.string(), v.string())),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_clerkUserId", ["clerkUserId"]),

  orgMemberships: defineTable({
    clerkUserId: v.string(),
    organizationId: v.string(),
    role: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["clerkUserId"])
    .index("by_org", ["organizationId"]),

  // Events & guest list credentials
  events: defineTable({
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    hosts: v.array(v.string()), // host names (comma-separated)
    productionCompany: v.optional(v.string()), // production company name that overrides host names in consent messaging
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    guestPortalImageStorageId: v.optional(v.id("_storage")),
    guestPortalLinkLabel: v.optional(v.string()),
    guestPortalLinkUrl: v.optional(v.string()),
    eventDate: v.number(), // ms since epoch
    eventTimezone: v.optional(v.string()),
    isFeatured: v.optional(v.boolean()), // one event can be featured for home page redirect
    status: v.optional(v.string()),
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
    qrCodeColor: v.optional(v.string()), // legacy QR code color field retained for compatibility
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_featured", ["isFeatured"]) // for quick featured event lookup
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
    approvalMessage: v.optional(v.string()), // per-list approval SMS copy
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"]) // lookup for a given event
    .index("by_passwordNormalized", ["passwordNormalized"])
    .index("by_event_key", ["eventId", "listKey"]), // NEW: for migration lookups

  profiles: defineTable({
    clerkUserId: v.string(),
    phoneEnc: v.optional(
      v.object({ ivB64: v.string(), ctB64: v.string(), tagB64: v.string() }),
    ), // deprecated
    phoneObfuscated: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["clerkUserId"]),

  rsvps: defineTable({
    eventId: v.id("events"),
    clerkUserId: v.string(),
    listKey: v.string(), // Primary reference to list credentials
    userName: v.optional(v.string()), // Denormalized from users table
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
    status: v.string(), // 'pending' | 'approved' | 'denied' | 'attending
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_event", ["eventId"]) // host view
    .index("by_user", ["clerkUserId"]) // user lookup
    .index("by_event_user", ["eventId", "clerkUserId"])
    // NEW indexes for efficient filtering
    .index("by_event_status", ["eventId", "status"])
    .index("by_event_ticketStatus", ["eventId", "ticketStatus"])
    .index("by_event_status_ticketStatus", ["eventId", "status", "ticketStatus"])
    .index("by_event_invitedBy", ["eventId", "invitedByNormalizedName"])
    .searchIndex("search_text", {
      searchField: "userName",
      filterFields: ["eventId", "status", "listKey", "ticketStatus"],
    }),

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
    .index("by_event_platform_handle", [
      "eventId",
      "platformKey",
      "normalizedHandle",
    ]),

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
    type: v.string(), // 'approval' | 'blast' | 'reminder' | 'sms_consent_enabled' | 'sms_consent_disabled'
    message: v.string(),
    status: v.string(), // 'pending' | 'sent' | 'failed'
    messageId: v.optional(v.string()), // AWS SNS MessageId
    errorMessage: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_event", ["eventId"])
    .index("by_user", ["recipientClerkUserId"])
    .index("by_status", ["status"])
    .index("by_type", ["type"]),

  // Text blast campaigns
  textBlasts: defineTable({
    eventId: v.id("events"),
    name: v.string(),
    message: v.string(),
    targetLists: v.array(v.string()), // ['vip', 'ga', etc.]
    recipientFilter: v.optional(v.string()), // 'all' | 'approved_no_approval_sms'
    includeQrCodes: v.optional(v.boolean()), // Whether to include QR code images in MMS
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
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("denied"),
    ),
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
    status: v.union(
      v.literal("open"),
      v.literal("ack"),
      v.literal("resolved"),
    ),
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
