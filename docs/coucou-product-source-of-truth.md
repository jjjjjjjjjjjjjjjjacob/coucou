# Coucou Product Source Of Truth

Last updated: 2026-04-24

Companion docs:

- [Coucou Migration And Refactor Plan](./coucou-migration-refactor-plan.md)
- [Coucou New Feature Buildout Plan](./coucou-new-feature-buildout-plan.md)

## 1. Product Definition

Coucou is a headless event CRM, guest-list, communications, ticketing, and CMS platform for organizers who need custom guest experiences without making guests feel like they are interacting with a generic third-party event platform.

The product serves members clubs, recurring curated events, upscale bars and clubs, hospitality groups, cultural programmers, independent promoters, and private-event operators. These customers care about discretion, guest trust, brand control, and operational nuance more than mass-market event discovery.

One sentence:

> Coucou gives event organizers the backend, hosted cockpit, and embeddable SDKs needed to run custom guest experiences, granular approvals, tiered guest lists, RSVP vetting, guest CRM, campaigns, and door operations from their own brand and domain.

The product promise:

- Guests experience the organizer's event, not Coucou's marketplace.
- Organizers keep guest data scoped to their own workspace.
- Developers can build custom sites and apps without rebuilding RSVP, access, approval, messaging, and door primitives.
- Non-technical organizers can still operate events through a hosted Coucou dashboard.

## 2. Positioning

### 2.1 What Coucou Is

Coucou is:

- A headless event operating layer.
- A CRM for guests, members, VIPs, regulars, and invitees.
- A lightweight CMS for event pages, guest portals, and post-approval content.
- A guest-list and access-control system with shared codes, unique invites, imported lists, referrals, and manual adds.
- An approval and ticketing workflow for curated entry.
- A consent-aware communications platform for transactional messages, text blasts, and future channels.
- A door and check-in system for QR validation, list lookup, and audit trails.
- A developer platform with APIs, SDKs, webhooks, and embeddable components.

### 2.2 What Coucou Is Not

Coucou is not:

- A public event marketplace.
- A ticket resale platform.
- A social network for guests across organizers.
- A platform that commingles guest reputation or CRM notes across unrelated organizers.
- A generic Partiful-style party page where Coucou's brand is the dominant guest-facing signal.
- A payments-first ticketing stack in v1.

Paid ticketing can be added later, but the first product wedge is curated access, RSVP vetting, communications, and guest operations.

### 2.3 Competitive Contrast

Customers use Coucou when they do not want:

- The event page to feel like a generic platform template.
- Guests to think their data is being pooled into another marketplace.
- A branded discovery platform sitting between organizer and guest.
- RSVP approval, table requests, text blasts, and door operations spread across spreadsheets, DMs, ticketing tools, and SMS tools.

Coucou should feel like infrastructure and a cockpit, not a social destination.

## 3. Core Principles

1. Tenant isolation is non-negotiable.
   Every event, guest, RSVP, tag, message, ticket, asset, key, webhook, and export belongs to a workspace. Cross-workspace access must require explicit platform-admin capability and must be audited.

2. Organizer brand comes first.
   Public guest surfaces should default to the organizer's domain, event theme, copy, imagery, and tone. Coucou attribution, where legally or operationally required, should be minimal and explanatory.

3. Guest trust is part of the product.
   Consent, opt-out, data use, organizer identity, and message sender identity must be visible and precise. Coucou should not imply cross-organizer data sharing.

4. Approval status and admission status are separate.
   RSVP decisions, ticket issuance, and check-in/redemption are distinct state machines.

5. CRM identity is durable.
   A guest's relationship with a workspace should survive individual events. Event RSVPs are activity attached to a person record, not the whole guest record.

6. Headless contracts are stable.
   Public APIs and SDKs must not expose internal Convex generated function shapes directly. The internal backend can evolve behind versioned contracts.

7. Hosted and headless surfaces share the same backend contracts.
   The Coucou dashboard, embeddable components, and custom client sites should use the same domain model and permissions.

8. Operator speed matters.
   Hosts need fast approval review, list movement, filtering, tagging, messaging, exporting, and door actions. Rich data is useful only if it reduces decision time.

## 4. Personas

### 4.1 Workspace Owner

The business or account owner. They configure the workspace, domains, billing, team access, default branding, integrations, data retention, and compliance settings.

Needs:

- Tenant-wide control and auditability.
- Trusted custom-domain setup.
- Ability to invite admins, hosts, marketers, and door staff.
- Confidence that guest data is not leaking across organizers.

### 4.2 Organizer / Host

The person managing event setup, guest lists, approvals, messaging, and analytics.

Needs:

- Create and duplicate events quickly.
- Manage lists, codes, approvals, ticket behavior, and guest portal content.
- See guest context before approving: history, tags, notes, table requests, prior attendance, message status.
- Send targeted texts without exporting spreadsheets.

### 4.3 CRM / Marketing Operator

The person managing guest records, tags, imports, text blasts, segments, and recurring attendance.

Needs:

- Filter people and RSVPs across events.
- Build campaign audiences from tags, list presence, prior attendance, delivery status, consent, and custom fields.
- Inspect previous campaigns and duplicate them.
- Maintain tags and notes without exposing them to guests.

### 4.4 Door Staff

The person checking guests in at the door.

Needs:

- Scan QR tickets.
- Search guest lists quickly.
- Verify names, list, approval/ticket state, plus-one count, notes visible to door, and redemption history.
- Redeem, unredeem, and escalate edge cases.
- Work with low connectivity in later versions.

### 4.5 Guest

The person receiving an invite, requesting access, contacting the organizer, getting approved or denied, and presenting a ticket.

V1 decision: guests must have accounts for RSVP/status/ticket flows. This matches current Dojo behavior and keeps ticket access, consent management, and shared profile updates simpler in the first Coucou migration.

Needs:

- Access event pages through organizer-branded links or codes.
- Understand who is collecting data and sending messages.
- Submit RSVP and required fields quickly.
- Request tables or contact the organizer when available.
- See status, ticket, and guest portal content after approval.
- Manage SMS consent and account/profile information.

### 4.6 Developer

The person building a custom event site, member portal, venue site, or brand campaign on top of Coucou.

Needs:

- Stable APIs and SDKs.
- Clear environment separation.
- Custom domain routing.
- Typed event, access, RSVP, ticket, and webhook contracts.
- Idempotent writes and good error semantics.
- Webhooks for downstream automations.

## 5. Product Surfaces

### 5.1 Hosted Organizer Cockpit

The Coucou dashboard hosted on `coucou.now` and mirrored into client domains for workspace-specific admin and door access.

V1 operating model:

- `coucou.now` is the primary Coucou control plane.
- `coucou.now/admin` serves as the superadmin portal and can also open workspace-specific admin contexts.
- A host/organizer with access to multiple workspaces can hop between them from Coucou.
- Branded client sites such as `dojopomodoro.club` and `clubchlorine.party` act as Coucou satellite domains backed by the same shared backend.
- Client sites expose workspace-scoped dashboard entry points such as `/admin` and `/door`.
- `dojopomodoro.club` must remain materially unchanged for guests and functionally unchanged for organizers in v1; the backend and admin architecture changes, but the guest-facing product should not feel rebuilt.
- Client onboarding in v1 is manual and high-touch, not self-serve.

Core areas:

- Workspace settings.
- Custom domains.
- Events and CMS.
- Lists and access rules.
- RSVPs and approval queue.
- People CRM.
- Tags and reputation.
- Conversations and table requests.
- Campaigns and templates.
- Door/check-in.
- Analytics.
- Exports.
- API keys and webhooks.
- Team, roles, and audit logs.

### 5.2 Headless API And SDK

The public developer interface for custom event websites, apps, and operational tools.

Initial packages:

- `@coucou/core`: DTOs, enums, validation schemas, errors, helpers.
- `@coucou/server`: server SDK for private API-key calls.
- `@coucou/react`: React hooks for guest and organizer flows.
- `@coucou/ui`: optional embeddable, themeable components.
- `@coucou/webhooks`: webhook verification helpers.

The SDK must be usable by multiple clients connecting to the same Coucou backend.

Important scope note:

- This is a core long-term Coucou product surface.
- It is not the primary v1 go-to-market surface.
- V1 only needs enough shared contracts to support first-party Coucou-managed client sites such as Dojo and additional manually onboarded brands.

### 5.3 Embeddable Guest Components

Optional components for teams that want custom branding without building everything.

Initial components:

- Access code resolver.
- RSVP form.
- SMS consent block.
- RSVP status block.
- Ticket/QR block.
- Guest portal block.
- Table request/contact form.

Components must be themeable and must not force Coucou brand styling.

### 5.4 Door Surface

Hosted and embeddable check-in surfaces for staff.

Initial capabilities:

- QR scanning.
- Manual code entry.
- Search list.
- Redeem/unredeem.
- Door-visible guest notes.
- Event/list/status filters.

Later capabilities:

- Device registration.
- Offline sync.
- Conflict resolution.
- Door session logs.

## 6. Tenant, Domain, And Auth Model

### 6.1 Workspace Is The Top-Level Tenant

`workspace` is the top-level tenant in Coucou. A workspace owns all operational data:

- Events.
- Assets.
- Domains.
- Team memberships.
- People and contact points.
- Tags and notes.
- RSVPs.
- Tickets and check-ins.
- Campaigns and message deliveries.
- API keys.
- Webhook endpoints.
- Audit logs.

An `organization` may exist as an external auth or billing concept, but product data should be scoped by `workspaceId`.

### 6.2 Custom Domains

Coucou must support:

- Guest-facing event sites on organizer domains.
- Organizer/client-facing login and dashboard access from the organizer's custom domain.
- Organizer login from `coucou.now`.
- Shared backend data across all domains for the same workspace.
- A first branded tenant at `dojopomodoro.club`.
- Additional branded tenants such as `clubchlorine.party`.
- Admin and host access from both `coucou.now/admin` and client-domain `/admin`.
- Door access from client-domain `/door`.

Domain records:

- `workspaceId`.
- `hostname`.
- `purpose`: `guest`, `admin`, `api`, `auth`, or `mixed`.
- `status`: `pending`, `verified`, `active`, `disabled`.
- DNS verification fields.
- Clerk satellite-domain configuration state.
- Default event or routing mode.

Routing behavior:

- `coucou.now` hosts the platform dashboard and can route to workspace admin contexts.
- `coucou.now/admin` is the primary superadmin and multi-workspace admin entry point.
- Client guest domains route guests to workspace-owned event pages and preserve existing branded behavior.
- Client domains expose `/admin` and `/door` routes that resolve into the same workspace-scoped dashboards and permissions as Coucou.
- A host with access to multiple workspaces can switch workspace context from Coucou without maintaining separate accounts.
- Custom admin domains route authenticated organizers to workspace dashboard context.
- API requests use explicit workspace resolution from key, domain, path, or request body depending on endpoint.

### 6.3 V1 Auth Decision

Default v1 stack:

- Clerk for authentication, organizations, roles, sessions, and Convex integration.
- Twilio for SMS, MMS, campaign delivery, opt-out handling, and optional Verify.
- WorkOS deferred until enterprise SSO/SCIM becomes a sales requirement.
- Better Auth deferred unless Coucou decides to own auth infrastructure directly.

Why:

- The current app already uses Clerk, Clerk webhooks, Convex JWT verification, and `ConvexProviderWithClerk`.
- Clerk Organizations model active organization context, roles, and memberships, which maps well to workspace access.
- Clerk satellite domains support shared sessions across different domains, but sign-in and sign-up flows complete on the primary domain.
- Twilio is already implemented and is the right v1 provider for event SMS.

Important Clerk constraint:

- With satellite domains, the primary domain owns auth state.
- Custom domains can initiate sign-in, but users complete sign-in/sign-up on the primary auth domain and return to the satellite domain.
- Coucou must design copy and routing so this feels intentional, not broken.

Implementation default:

- Primary auth domain: `coucou.now` or a dedicated auth domain such as `auth.coucou.now`.
- Organizer and client domains: Clerk satellite domains.
- Convex auth: continue validating Clerk-issued JWTs.
- Guest RSVP/status/ticket flows: account required in v1.
- Admin and door surfaces must be reachable from both Coucou-hosted and client-domain routes:
  - `coucou.now/admin`
  - `<client-domain>/admin`
  - `<client-domain>/door`

V1 scope lock:

- The first goal is not a self-serve multi-tenant product launch.
- The first goal is a shared Coucou backend and control plane that can power Dojo plus additional manually onboarded branded client sites.
- `dojopomodoro.club` is the first branded client and should preserve current guest and organizer expectations.
- A second branded site such as `clubchlorine.party` should be able to run on the same backend with separate workspace data and branded routes.

### 6.4 Roles

Canonical workspace roles:

- `owner`: full workspace control, billing, domains, integrations, team, destructive data actions.
- `admin`: events, CRM, approvals, campaigns, exports, door, settings except billing/destructive owner actions.
- `host`: event creation/editing, approvals, guest list management, campaigns for assigned events.
- `marketing`: CRM, tags, segments, campaigns, exports, analytics; no destructive event deletion by default.
- `door`: door app, list search, redeem/unredeem; no CRM notes beyond door-visible fields.
- `developer`: API keys, webhooks, docs, test mode; no guest PII export unless granted.
- `viewer`: read-only operational dashboards.
- `guest`: account role for guest-facing RSVP/status/ticket flows.

Roles are workspace-scoped. Event-specific grants can narrow or expand access within a workspace.

## 7. Data Ownership And Privacy

### 7.1 Workspace-Owned Guest Data

Guest CRM data belongs to the workspace that collected it. Coucou must not create cross-organizer reputation or shared guest profiles unless a future explicit product and legal framework is designed.

For v1:

- A Clerk user can RSVP to events in multiple workspaces.
- Each workspace has its own `person` record for that guest.
- Tags, notes, reputation labels, table history, campaign membership, and organizer comments are workspace-private.
- Guests can manage their own account and consent state, but they do not see internal organizer tags or notes.

### 7.2 Sensitive Internal Tags

Coucou should support preset and custom internal tags because nightlife/hospitality organizers already operate with informal reputation systems.

Examples:

- Relationship tags: `close friend`, `regular`, `member`, `friend of host`.
- Value tags: `table`, `big spender`, `sponsor`, `press`, `influencer`.
- Operations tags: `needs follow-up`, `VIP arrival`, `ID issue`, `chargeback risk`.
- Vibe or conduct tags: workspace-defined labels such as the examples given in product discussions.

Guardrails:

- Tags are workspace-private by default.
- Tags are not shown to guests.
- Tag creation, deletion, and assignment are audit logged.
- Destructive or high-risk labels should support permission-gated visibility.
- The product should avoid encouraging regulated-attribute tagging or discriminatory admission workflows.
- Export of tags should require explicit permission.

### 7.3 Consent

Consent is not the same as contact availability.

Consent records must capture:

- `workspaceId`.
- `personId`.
- `channel`: `sms`, `email`, `whatsapp`, `push`.
- `scope`: workspace, event, list, campaign type, or transactional only.
- `status`: `opted_in`, `opted_out`, `unknown`, `suppressed`.
- Source: RSVP form, profile toggle, inbound SMS keyword, import, admin update, API.
- Timestamp.
- IP/user agent where captured.
- Disclosure text version.
- End business / organizer identity shown at time of consent.
- Provider evidence where applicable.

SMS requirements:

- Every opt-in must identify the organizer/end business and the fact that Coucou sends on its behalf.
- STOP/START/HELP behavior must be supported.
- Twilio opt-out webhooks must update Coucou suppression state.
- Campaign sending must check both Coucou consent and provider-level opt-out/suppression state.

### 7.4 Data Retention

Workspace settings should eventually control:

- Guest PII retention.
- Message delivery log retention.
- Audit log retention.
- Event archival.
- Export permissions.
- Guest deletion/anonymization requests.

V1 should at minimum document defaults and preserve enough consent evidence for compliance.

## 8. Canonical Domain Model

### 8.1 Workspace And Identity

`workspace`

- Top-level tenant.
- Owns settings, default branding, domains, data, integrations, and billing.

`domain`

- Custom hostname attached to a workspace.
- Used for guest, admin, auth, or API routing.

`membership`

- User role and permissions in a workspace.
- Links Clerk user to Coucou workspace.

`user`

- Authenticated account identity.
- Backed by Clerk in v1.
- Can be organizer, staff, developer, guest, or platform admin.

`person`

- Workspace-owned CRM identity for a guest/contact.
- In v1, guest RSVP flows require an authenticated user, but `person` is still the durable CRM record.
- May link to one or more auth users later if dedupe/merge requires it.

`contactPoint`

- Phone, email, social handle, or external ID belonging to a person.
- Supports encrypted value, obfuscated display, verification status, and source.

`consentRecord`

- Auditable channel consent and suppression state.

### 8.2 Events And CMS

`event`

- Core event object.
- Belongs to workspace.
- Has title, secondary title, date/timezone, location, status, visibility, featured/default routing, and lifecycle fields.

`eventPage`

- Guest-facing CMS content for an event.
- Stores slug, SEO/Open Graph metadata, page blocks, theme, assets, published version, and preview state.

`venue`

- Reusable location object.

`asset`

- Uploaded file/image metadata.
- Linked to workspace and optionally event/page.

`eventSeries`

- Optional grouping for recurring events.

### 8.3 Access And Lists

`segment`

- A guest list or audience grouping for an event or workspace.
- Examples: `VIP`, `GA`, `members`, `friends`, `press`, `table`.

`accessCredential`

- A way to resolve access into an event/segment.
- Types: shared password, unique invite link, one-time code, imported list row, referral code, manual add, API-created grant.

`entryRule`

- Segment/event rule that controls who can view, RSVP, bypass approval, receive QR tickets, bring plus-ones, or access guest portal content.

### 8.4 RSVP And Forms

`formDefinition`

- Versioned form schema.
- Reusable across events or scoped to one event.

`formField`

- Field definition with label, type, required state, validation, privacy, copy-forward behavior, and conditional logic.

`rsvp`

- Event-specific request/submission by a person.
- Links event, segment, form version, answers, attendee count, note, status, source, and timestamps.

`approvalDecision`

- Audit record for approval/denial/waitlist/override decisions.

### 8.5 Tickets And Door

`ticket`

- Issued admission credential.
- Distinct from RSVP.
- Has ticket type, status, code/token, QR state, plus-one count, disabled state, and delivery state.

`checkIn`

- Door redemption or unredeem audit event.

`doorSession`

- Event/day/device session for staff activity.

`doorDevice`

- Registered scanner/device identity for offline and audit features.

### 8.6 CRM And Reputation

`tag`

- Workspace-defined label.
- Supports type, color, visibility, permissions, and optional preset category.

`personTag`

- Assignment of tag to person with assigner and timestamp.

`note`

- Internal note attached to person, RSVP, event, or conversation.
- Visibility can be internal, approval-only, or door-visible.

`personTimelineEvent`

- Derived or stored timeline item: RSVP submitted, approved, denied, ticket redeemed, campaign received, opt-out, tag added, note created, table request, import, merge.

`segmentMembership`

- Durable person membership in a workspace segment outside one event.

### 8.7 Conversations And Requests

`conversation`

- Thread between guest/person and workspace/event.
- Can originate from SMS, event form, table request, dashboard, or API.

`conversationMessage`

- Individual inbound or outbound message.
- Links provider status and delivery record where applicable.

`tableRequest`

- Structured guest request for table, bottle service, birthday, guest count, arrival time, budget, and callback preference.

### 8.8 Communications

`messageTemplate`

- Reusable template with channel, variables, scope, purpose, and versioning.

`campaign`

- Blast or automation run.
- Has audience definition, channel, template/message, status, sender, scheduled/sent timestamps, and counts.

`audienceDefinition`

- Saved filter expression across people, RSVPs, events, tags, lists, deliveries, consent, and custom fields.

`messageDelivery`

- Per-recipient delivery attempt.
- Tracks provider ID, delivery status, error, cost estimate, timestamps, and opt-out state.

`suppression`

- Channel/provider/workspace suppression record.

### 8.9 Developer Platform

`apiKey`

- Workspace-scoped key.
- Has prefix, hashed secret, permissions, allowed origins, rate limits, expiration, last used, and environment.

`webhookEndpoint`

- Outbound webhook target with subscribed events, signing secret, status, retry policy, and failure state.

`webhookDelivery`

- Attempt log with payload ID, status, response, and retry count.

`integration`

- Provider config for Twilio, email, WhatsApp, WorkOS, analytics, warehouse, or future tools.

`auditLog`

- Durable log of sensitive user, API, provider, and system actions.

## 9. State Machines

### 9.1 Event Status

- `draft`: editable, not publicly available.
- `published`: visible through configured access routes.
- `scheduled`: publish at a configured time.
- `active`: currently accepting RSVP or entry operations.
- `closed`: no new RSVPs; existing statuses remain visible.
- `completed`: event has passed; analytics and exports remain.
- `archived`: hidden from default operational views.
- `cancelled`: event cancelled; messaging and refund/payment features later.

### 9.2 RSVP Status

- `draft`: started but not submitted, future optional.
- `pending`: submitted and awaiting decision.
- `waitlisted`: accepted into waitlist but not approved.
- `approved`: approved for attendance.
- `denied`: denied by organizer.
- `cancelled`: guest cancelled or organizer removed.
- `attending`: legacy-compatible state for approved guest who has opened ticket or confirmed attendance.

V1 compatibility:

- Existing Dojo statuses `pending`, `approved`, `denied`, and `attending` remain supported.
- Approval grouping treats `approved` and `attending` as positive approval states.

### 9.3 Ticket Status

- `not_issued`: no ticket/pass exists.
- `issued`: active credential exists.
- `disabled`: credential exists but cannot redeem.
- `redeemed`: checked in.
- `voided`: permanently invalidated.
- `reissued`: old credential superseded.

V1 compatibility:

- Existing Dojo values `not-issued`, `issued`, `disabled`, and `redeemed` map to canonical status values at API boundary.

### 9.4 Campaign Status

- `draft`.
- `scheduled`.
- `sending`.
- `sent`.
- `partially_failed`.
- `failed`.
- `cancelled`.

### 9.5 Message Delivery Status

- `pending`.
- `queued`.
- `sent`.
- `delivered`.
- `failed`.
- `undelivered`.
- `suppressed`.
- `opted_out`.

### 9.6 Consent Status

- `unknown`.
- `opted_in`.
- `opted_out`.
- `suppressed`.
- `revoked`.

## 10. Feature Modules

### 10.1 Workspace And Domains

Capabilities:

- Create workspace.
- Invite team members.
- Assign roles.
- Configure custom domains.
- Verify DNS.
- Route guest/admin surfaces by domain.
- Configure default branding and compliance copy.
- Manage integrations.
- View audit logs.
- Support workspace switching from Coucou for multi-org operators.

Acceptance criteria:

- Every data query is scoped by workspace.
- Users can access an organizer dashboard from `coucou.now/admin`.
- Users can access an organizer dashboard from a verified client-domain `/admin` route.
- Users can access a workspace door dashboard from a verified client-domain `/door` route.
- A user with access to multiple workspaces can switch between them from Coucou.
- Guests can access event pages from a verified custom guest domain.

### 10.2 Event CMS

Capabilities:

- Event details.
- Series and duplicate event workflow.
- Venue/host records.
- Flyer, icon, guest portal image, and theme.
- Guest portal link and approval content.
- Page slug and SEO/Open Graph fields.
- Draft/published/preview states.
- Basic content blocks.

MVP source:

- Current Dojo `events` table, flyer/icon uploads, guest portal content, theme colors, and event pages.

### 10.3 Access And Lists

Capabilities:

- Segments/lists.
- Shared passwords.
- Unique invite links.
- One-time codes.
- Imported guest lists.
- Referral links.
- Manual adds.
- API-created grants.
- Segment quotas.
- List-specific attendee limits.
- List-specific ticket behavior.
- List-specific approval messages.

MVP source:

- Current Dojo `listCredentials` password, list key, QR toggle, and approval message.

### 10.4 RSVP And Form Engine

Capabilities:

- Versioned form definitions.
- Required fields.
- Custom fields.
- Conditional fields later.
- Plus-one/attendee count.
- Notes.
- Copy-forward reusable fields.
- Field-level privacy.
- Validation and sanitization.

MVP source:

- Current Dojo event custom fields, RSVP submission, attendee count, SMS consent capture, and shared profile update.

### 10.5 Approval Workflow

Capabilities:

- Approval queue.
- Denial reason.
- Waitlist later.
- Bulk approve/deny.
- Bulk move list.
- Decision audit trail.
- Ticket issuance/disable on approval/denial.
- Approval-specific transactional messaging.

MVP source:

- Current Dojo approvals and RSVP CRM.

### 10.6 Ticketing And Door

Capabilities:

- QR ticket issue/display.
- No-QR name verification mode.
- Redeem/unredeem.
- Search guest list.
- Door-visible notes.
- Door staff role.
- Event/list/status filters.
- Audit trail.

Later:

- Offline mode.
- Door devices.
- Wallet passes.
- Ticket transfers.
- Paid tickets.

### 10.7 People CRM

Capabilities:

- Person profile per workspace.
- Contact points.
- Event history.
- RSVP history.
- Attendance history.
- Tags.
- Notes.
- Internal fields.
- Imports.
- Dedupe and merge.
- Segment memberships.
- Timeline.
- Export.

MVP source:

- Current Dojo `users`, `profiles`, `rsvps`, custom fields, and organization users page.

### 10.8 Tags And Reputation

Capabilities:

- Preset tags.
- Custom tags.
- Tag categories.
- Tag visibility permissions.
- Batch tagging.
- Tag filters in CRM, RSVP table, campaigns, exports.
- Audit logs.

Initial preset categories:

- Relationship: close friend, regular, member, friend of host.
- Value: table, big spender, sponsor, press, influencer.
- Operations: needs follow-up, door note, unpaid balance, ID issue.
- Conduct: workspace-defined only, permission-gated by default.

### 10.9 Table Requests And Conversations

Capabilities:

- Guest table request form.
- Optional SMS line for guests to reach organizer.
- Organizer dashboard inbox.
- Link threads to event, person, RSVP, and campaign.
- Internal assignment/status.
- Templates for replies.
- Consent-aware outbound messaging.

Initial thread statuses:

- `open`.
- `waiting_on_guest`.
- `waiting_on_organizer`.
- `resolved`.
- `archived`.

### 10.10 Communications And Campaigns

Capabilities:

- Approval SMS.
- Consent confirmation SMS.
- Text blasts.
- Campaign drafts.
- Campaign duplication.
- Campaign inspection.
- Recipient preview.
- Recipient filters by list, RSVP status, ticket status, custom field, consent, and delivery state.
- QR/ticket link variables.
- Delivery status webhooks.
- Usage/cost logs.
- Suppression and opt-out.

Expanded filters:

- Person tags.
- Person segment membership.
- Event/list presence.
- Attended or no-show history.
- RSVP date/time.
- Campaign received/not received.
- Campaign delivered/failed/undelivered.
- Missing phone or consent.
- Table request state.
- Custom field exists/missing/equals/contains.

Channels:

- V1: SMS/MMS via Twilio.
- Later: email, WhatsApp, push, webhooks.

### 10.11 Analytics And Exports

Capabilities:

- Workspace dashboard.
- Event funnel: views -> access unlocks -> RSVPs -> approvals -> tickets -> check-ins.
- List performance.
- Approval rate.
- Show-up/redemption rate.
- Campaign delivery metrics.
- Opt-out trends.
- CRM growth.
- CSV export builder.
- Webhook and warehouse sync later.

### 10.12 Developer Platform

Capabilities:

- Public REST or RPC API facade over Convex internals.
- API keys.
- API-key permissions.
- Idempotency keys.
- Rate limits.
- Webhook endpoints.
- Webhook signing.
- Sandbox mode.
- Test data.
- TypeScript SDK.
- React SDK.
- API docs.

## 11. Headless API Shape

The public API should be stable and versioned. Example areas:

### Guest APIs

- `resolveAccess`.
- `getEvent`.
- `submitRsvp`.
- `updateRsvp`.
- `getRsvpStatus`.
- `getTicket`.
- `updateConsent`.
- `createTableRequest`.
- `sendConversationMessage`.

### Organizer APIs

- `createEvent`.
- `updateEvent`.
- `publishEvent`.
- `manageSegments`.
- `createAccessCredential`.
- `searchPeople`.
- `getPerson`.
- `addPersonTag`.
- `approveRsvp`.
- `denyRsvp`.
- `issueTicket`.
- `disableTicket`.
- `createCampaign`.
- `previewAudience`.
- `sendCampaign`.
- `exportRsvps`.

### Door APIs

- `validateTicket`.
- `redeemTicket`.
- `unredeemTicket`.
- `searchGuestList`.
- `syncDoorSession`.

### Webhook Events

- `person.created`.
- `person.updated`.
- `rsvp.submitted`.
- `rsvp.updated`.
- `rsvp.approved`.
- `rsvp.denied`.
- `ticket.issued`.
- `ticket.disabled`.
- `ticket.redeemed`.
- `ticket.unredeemed`.
- `consent.updated`.
- `campaign.created`.
- `campaign.sent`.
- `message.sent`.
- `message.delivered`.
- `message.failed`.
- `conversation.created`.
- `conversation.message_received`.
- `table_request.created`.

## 12. UX Requirements

### 12.1 Guest Experience

Guest flows must:

- Feel owned by the organizer.
- Preserve event password/invite context through sign-in.
- Make organizer identity and SMS sender identity clear.
- Require account login in v1 before RSVP submit/status/ticket.
- Show pending, denied, approved, ticket, and portal states clearly.
- Avoid exposing internal Coucou concepts such as workspace IDs, segment IDs, or CRM tags.

### 12.2 Organizer Experience

Organizer flows must:

- Make event creation and duplication fast.
- Avoid forcing technical setup for basic events.
- Provide fast review and bulk actions.
- Surface guest context without overwhelming the approval queue.
- Make campaign audience previews trustworthy before sending.
- Make destructive actions explicit and auditable.

### 12.3 Door Experience

Door flows must:

- Prioritize speed, search, and clarity.
- Work on mobile.
- Show only necessary guest details.
- Make redeemed/disabled/invalid states unmistakable.
- Log staff identity for redemption and unredeem.

## 13. Provider Policy

### 13.1 Clerk

Use Clerk for v1 auth.

Relevant source facts:

- Clerk Organizations group users with roles and permissions and expose active organization context.
- Clerk satellite domains share sessions across different domains, with the primary domain owning auth state.
- Convex has a Clerk integration through `ConvexProviderWithClerk` and Clerk-issued JWT validation.

Sources:

- [Clerk Organizations](https://clerk.com/docs/organizations/overview)
- [Clerk roles and permissions](https://clerk.com/docs/organizations/roles-permissions)
- [Clerk satellite domains](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains)
- [Convex and Clerk](https://docs.convex.dev/auth/clerk)

### 13.2 Twilio

Use Twilio for v1 messaging and optional phone verification.

Relevant source facts:

- Twilio Messaging Services provide sender pools and shared messaging configuration.
- Twilio Advanced Opt-Out handles configurable opt-out, opt-in, and help keywords.
- US A2P 10DLC requires registration for application-to-person 10DLC SMS/MMS to US users.
- Twilio Verify supports SMS, WhatsApp, email, TOTP, passkeys, voice, and other verification channels.

Sources:

- [Twilio Messaging Services](https://www.twilio.com/docs/messaging/services)
- [Twilio Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
- [Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [Twilio Verify API](https://www.twilio.com/docs/verify/api)

### 13.3 Better Auth

Do not migrate to Better Auth in v1.

Use as a future option if Coucou wants to own auth/session storage and built-in API-key/phone/org primitives.

Relevant source facts:

- Better Auth has organization, API key, phone number, and SSO plugins.
- The API key plugin supports key management, verification, permissions, and rate limiting.
- The phone number plugin supports OTP and custom verification providers.

Sources:

- [Better Auth organization plugin](https://better-auth.com/docs/plugins/organization)
- [Better Auth API key plugin](https://better-auth.com/docs/plugins/api-key)
- [Better Auth phone number plugin](https://better-auth.com/docs/plugins/phone-number)
- [Better Auth SSO plugin](https://better-auth.com/docs/plugins/sso)

### 13.4 WorkOS

Do not use WorkOS as v1 default auth.

Add WorkOS when enterprise customers need:

- SSO.
- Directory Sync / SCIM.
- Enterprise admin portal.
- Audit log exports.
- Enterprise custom AuthKit domain.

Sources:

- [WorkOS AuthKit](https://workos.com/docs/user-management/authkit)
- [WorkOS custom AuthKit domain](https://workos.com/docs/custom-domains/authkit)
- [WorkOS Directory Sync](https://workos.com/docs/directory-sync)
- [WorkOS Audit Logs](https://workos.com/docs/audit-logs)

## 14. V1 Success Criteria

Coucou v1 is successful when:

- `dojopomodoro.club` behaves the same for guests and functionally the same for organizers and door staff, while being backed by Coucou.
- Core data is workspace-scoped.
- `coucou.now/admin` works as both superadmin portal and workspace admin portal.
- Organizers can log in from `coucou.now` and switch between all client workspaces they can access.
- Organizers can access admin and door dashboards from client-site routes such as `dojopomodoro.club/admin`, `dojopomodoro.club/door`, and `clubchlorine.party/admin`.
- A second branded client domain can run on the same backend with isolated workspace data.
- Guests are required to authenticate before RSVP/status/ticket in v1.
- Hosts can approve/deny, issue/disable tickets, export, and send SMS campaigns.
- Hosts can tag people and filter campaigns by tags and list/event history.
- Door staff can scan/redeem and search lists.
- Audit logs exist before broader client rollout.
- Broad third-party self-serve SDK adoption is not required for v1.

## 15. Open Later Decisions

These are intentionally not v1 blockers:

- Whether to support unauthenticated RSVP flows.
- Whether to add paid ticketing and refunds.
- Whether to add marketplace/discovery features.
- Whether to support cross-workspace guest identity with explicit user consent.
- Whether to migrate auth from Clerk to Better Auth or WorkOS.
- Whether to rewrite the backend away from Convex.
- Whether to support offline door mode before larger venue customers demand it.
- Whether to open self-serve workspace onboarding and domain setup.
- Whether to publicly launch the external Coucou SDK/API beyond first-party and manually onboarded clients.
