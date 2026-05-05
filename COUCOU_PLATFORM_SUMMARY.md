# Dojo Pomodoro Platform Summary and Coucou Direction

## Executive Summary

Dojo Pomodoro is an event operations platform for curated, access-controlled events. The current product combines public guest flows, organizer tooling, door operations, guest messaging, analytics, and basic organization/user administration into one Next.js and Convex application.

The strongest existing product primitive is not simply "events." It is the full guest lifecycle:

1. Organizer creates an event, guest lists, passwords, RSVP fields, theme, and guest-facing assets.
2. Guest unlocks an event with a list password, signs in, submits RSVP details, opts into SMS, and waits for approval.
3. Organizer reviews RSVPs, approves or denies guests, issues or disables tickets, exports lists, and sends SMS campaigns.
4. Guest receives approval messaging, views RSVP status, manages shared profile fields and SMS consent, and presents a QR ticket when required.
5. Door staff validate, redeem, and unredeem tickets while viewing guest lists.
6. Organizer reviews event, RSVP, ticket, and SMS performance.

Coucou should evolve this into a modular event operating layer: a headless SDK plus hosted CRM and CMS for event organizers. The SDK should expose the same primitives that Dojo already proves out: event content, guest access, RSVP forms, segmentation, guest CRM, ticketing, communications, consent, analytics, and door check-in.

In product terms, Coucou can become the "headless event CRM/CMS" for organizers who want to run custom guest experiences without rebuilding the operational backend every time.

## Current Platform

### Product Positioning

Dojo Pomodoro is currently positioned in metadata as an "event management platform for exclusive gatherings and experiences." In practice, it is closer to a private-event guest operating system:

- Access-controlled event discovery via list passwords.
- Custom RSVP collection for different guest lists.
- Host approval workflows.
- Optional QR ticket generation per list.
- Guest SMS consent and messaging.
- Door validation and redemption.
- Organizer analytics and exports.
- Organization-based host and door roles through Clerk.

The product is optimized for events where entry is curated, segmented, and operationally sensitive: VIP/GA lists, private parties, launches, member events, nightlife, cultural events, and invite-only experiences.

### Monorepo Architecture

The repository is a Bun/Turbo monorepo:

- `apps/web`: Next.js frontend with React, TypeScript, Clerk, Convex React, TanStack Query, TanStack Table, Tailwind, Radix-style UI components, Recharts, QR rendering, and camera QR scanning.
- `apps/convex`: Convex backend containing schema, queries, mutations, actions, HTTP webhooks, tests, migrations, SMS/ticketing logic, and file storage utilities.
- `apps/shared`: Shared business rules such as approval message copy, event branding, and QR code color logic.

Key runtime dependencies:

- Frontend: Next.js 16, React 19, Clerk, Convex, TanStack Query/Table, React Hook Form, Recharts, html5-qrcode, react-qr-code, Tailwind CSS.
- Backend: Convex, Clerk backend, Twilio, Convex aggregate and migrations helpers, QR code generation.
- Package/script execution: Bun only.

The current README is still mostly the default Next.js scaffold text, so this summary is a more accurate product-level reference than the README.

## Core Domain Model

The current Convex schema contains these major tables:

- `users`: synced Clerk users, names, phone, image, metadata.
- `orgMemberships`: Clerk organization memberships and roles.
- `events`: event details, host names, production company, location, date/timezone, status, featured flag, RSVP custom fields, max attendees, flyer/icon/guest portal assets, guest portal link, theme colors, approval copy, QR color compatibility.
- `listCredentials`: event guest-list credentials with list key, hashed password, HMAC fingerprint, optional encrypted password, QR generation toggle, and per-list approval SMS message.
- `profiles`: encrypted phone contact data and obfuscated display phone.
- `rsvps`: guest request records, event/list relationship, user name cache, status, ticket status, attendee count, note, SMS consent, SMS consent IP/timestamp, custom field values, and contact sharing.
- `approvals`: approval/denial audit records with event, RSVP, user, list, decision, decider, and denial reason.
- `redemptions`: ticket/redemption code records with issued, redeemed, disabled, redeemer, and unredeem history.
- `smsNotifications`: notification audit trail for approval, blast, reminder, and SMS consent messages.
- `textBlasts`: bulk SMS campaigns with target lists, recipient filter, QR-code inclusion, counts, sender, status, and timestamps.
- `smsUsageLogs`: estimated SMS cost and delivery/cost monitoring.
- `smsOptOuts`: hashed opt-out records with re-opt-in support.

The existing schema is a strong basis for Coucou, but it needs explicit tenant ownership on core objects before becoming a true multi-tenant SDK/CRM product.

## Existing User Experiences

### Public Guest Entry

The root page asks for an event password. The backend resolves a password to a list credential and active/upcoming event. A featured event can take precedence when a password matches multiple credentials.

Guest-facing event pages show the event name, secondary title, date, location, and an RSVP action. If the guest is not signed in, the app redirects through Clerk sign-in and returns to the RSVP flow with the password preserved.

### RSVP Flow

The RSVP route validates the list password for the specific event, resolves the list key, and renders a form for:

- First name and last name.
- Event-defined custom fields.
- Phone from Clerk profile, with profile update affordance.
- Attendee count, constrained by `maxAttendees`.
- Optional note to hosts.
- SMS consent, including explicit confirmation and IP capture.

Submission behavior:

- Requires authentication.
- Requires valid event and active status.
- Sanitizes custom field values according to event field definitions.
- Enforces attendee minimum and event max.
- Upserts one RSVP per event/user.
- Resets denied or non-approved requests back to pending when allowed.
- Prevents re-requesting the same denied list.
- Saves encrypted phone contact data.
- Schedules SMS consent confirmation messages when consent changes.

### Guest Status and Ticketing

Guests can view an RSVP status page:

- Pending: request is awaiting approval.
- Denied: request was not approved.
- Approved/attending: ticket or no-QR instructions are shown depending on list settings.

Guests can manage SMS preference from status/profile surfaces. The profile page also lets guests update shared custom fields for past RSVPs.

The ticket page displays:

- Event header and details.
- QR code when the associated list generates QR codes.
- A download action for the QR image.
- No-QR instructions when the list is configured for name verification.
- Optional guest portal image and external guest link.

Opening an approved ticket marks the RSVP as `attending`.

### Organizer Event CMS

The host event form supports:

- Event name and secondary title.
- Host names and optional production company.
- Location.
- Event date, time, and timezone.
- Flyer upload.
- Custom event icon.
- Guest portal image.
- Guest portal link label and URL.
- Background and text theme colors.
- Max attendees, validated server-side from 1 to 6.
- RSVP custom fields.
- Multiple access lists with list name, password, QR generation toggle, and approval message.

List-code storage is handled directly:

- List codes are stored in plaintext alongside a normalized lookup value.
- New event list codes must be unique within the event and not collide with upcoming or active events, depending on create/update path.

The event list page supports search, upcoming/past filters, date/name sorting, card/list views, event editing, deletion, featured-event selection, RSVP navigation, and share links.

The share popover can show:

- Base event link.
- Per-list event links containing encrypted/decrypted list password query parameters when available.

### Organizer RSVP CRM

The host RSVP table is the center of the current CRM:

- Event selector.
- Search by guest.
- Filter by approval status.
- Filter by list.
- Filter by ticket/redemption state.
- Sort by created time, updated time, name, approval status, ticket status, list, and attendees.
- Cursor/index style pagination.
- Bulk list movement.
- Bulk approval updates.
- Bulk ticket status updates.
- Bulk delete.
- CSV export with selectable lists/statuses/columns.
- Custom fields displayed from event definitions.
- QR rendering and redemption-code handling for individual rows.

Backend RSVP listing enriches raw RSVP records with user names, approval status, ticket status, custom fields, redemption info, and SMS consent.

There is a separate door guest-list view that provides a simpler event/list/status/search table for staff.

### Approval and Ticket Lifecycle

Approvals can:

- Mark RSVP status as approved.
- Create or re-enable a redemption record.
- Set ticket status to issued or redeemed.
- Insert an approval audit record.
- Schedule approval SMS when contact sharing and SMS consent allow it.

Denials can:

- Mark RSVP status as denied.
- Disable an existing redemption.
- Set ticket status to disabled or not issued.
- Insert a denial audit record.

Ticket lifecycle states currently include:

- `not-issued`
- `issued`
- `disabled`
- `redeemed`

RSVP states include:

- `pending`
- `approved`
- `denied`
- `attending`

This separation is important for Coucou. Approval status and entry/ticket status should remain distinct concepts.

### Door Operations

The door portal is protected by Clerk organization roles. Door/admin/member users can access:

- QR scan page.
- Manual redemption-code entry.
- Auto-redemption after successful validation.
- Unredeem support.
- Guest list view.
- A "get ticket" route tied to the featured event.

QR scan uses `html5-qrcode` and accepts either raw codes or full redemption URLs. Redemption requires host/door role. Unredeem records history with timestamp, staff user, and optional reason.

### Communications

The platform supports both transactional and promotional SMS through Twilio:

- Approval SMS.
- SMS consent enabled/disabled messages.
- Text blast campaigns.
- QR code MMS attachment generation.
- Template variables:
  - `{{firstName}}`
  - `{{eventName}}`
  - `{{eventDate}}`
  - `{{eventLocation}}`
  - `{{qrCodeUrl}}`

Text blast targeting supports:

- Event.
- Target lists.
- All approved/attending guests.
- Approved guests with no approval SMS sent.
- RSVP status.
- Missing custom field.
- RSVP before a specific date/time.
- Optional exact test recipients.
- SMS consent and phone availability filtering.
- Optional QR images for guests with redemption codes.

Messaging is consent-aware:

- RSVP flow captures SMS opt-in and IP.
- Profile/status pages can toggle consent.
- Sending checks event-specific consent before approval SMS.
- Sending checks global opt-outs before Twilio delivery.
- Notification status and usage logs are recorded.

### Analytics and Reporting

The dashboard and analytics pages surface:

- Total events.
- Total RSVPs.
- Approved, pending, and denied counts.
- Approval rate.
- Issued and redeemed tickets.
- Redemption/show-up rate.
- Month-over-month RSVP trends.
- Daily RSVP trend chart.
- Event performance by recent events.
- Recent activity.
- SMS sent/failed/pending counts.
- SMS success rate.
- SMS trends and status distribution.

CSV export supports grouped list output and optional inclusion of phone, attendee count, notes, and custom fields. It decrypts phone numbers when possible and can fall back to Clerk or user records.

### Organization and Roles

The app uses Clerk for:

- Authentication.
- Organization membership.
- Host/dashboard authorization.
- Door authorization.
- User sync via Clerk webhooks.

Current effective roles:

- `org:admin`: host/admin, event management, approvals, text blasts, exports, user role updates.
- `org:member`: door/member access for ticket validation.
- Guest users: can RSVP, view tickets/status, and manage profile/shared data.

The users page lets admins search and paginate organization users, view role stats, promote guests, and update roles.

## Current Strengths

- End-to-end guest lifecycle is already implemented.
- Access-list model supports differentiated guest experiences.
- Approval and ticket lifecycles are separated.
- QR ticketing and redemption are integrated with host and door workflows.
- SMS consent is treated as a first-class workflow rather than an afterthought.
- Contact data is encrypted in Convex profiles and obfuscated in UI surfaces.
- Custom RSVP fields are event-defined and propagate into guest profile management, host CRM, text blast segmentation, and export.
- Text blasts already behave like a lightweight campaign system.
- The architecture has clear split points: Convex domain functions, Next.js UI, and shared rules.
- Tests exist across backend and frontend for RSVP, approvals, redemptions, password utilities, QR colors, pages, and migrations.

## Current Constraints to Address Before Coucou

- Tenant scoping is incomplete. Events, RSVPs, blasts, analytics, and exports need explicit organization/workspace ownership instead of relying mostly on the active Clerk role.
- The UI and backend are tightly coupled to Convex and Clerk. A headless SDK needs stable public contracts that are not just generated Convex functions.
- Several current backend queries operate globally once authenticated. Coucou will need strict organization, project, and API key boundaries.
- The current "CMS" is event-content management, not yet a composable content system.
- CRM data is RSVP-centric. Coucou needs durable person/contact profiles that can span events, channels, tags, preferences, and deduplication rules.
- List passwords are useful but should become one access mechanism among several: invites, unique links, codes, imports, referrals, waitlists, manual adds, and API-created access grants.
- Communications are SMS-first. Coucou should model messaging as channel-agnostic: SMS, email, WhatsApp, push, and webhooks.
- Door scanning is online-first. Larger event organizers may need offline check-in, device assignment, sync conflict handling, and audit trails.
- Current analytics are operational but not yet tenant-safe or cohort/funnel oriented.
- Public API concerns are not yet modeled: API keys, OAuth, rate limits, idempotency keys, webhooks, audit logs, and versioning.

## Coucou Product Direction

### Product Definition

Coucou should be a modular headless SDK, CRM, and CMS for event organizers.

One sentence:

> Coucou gives event organizers the backend, hosted cockpit, and embeddable SDKs needed to run custom guest experiences, guest lists, RSVPs, ticketing, messaging, and door operations.

The product has three surfaces:

1. Headless SDK and APIs
   - For developers building custom event websites, apps, invite flows, RSVP forms, and door experiences.

2. Hosted organizer CRM/CMS
   - For non-technical teams managing events, guest lists, people, content, communications, approvals, check-in, and analytics.

3. Embeddable guest and door components
   - For teams that want customization without building every guest-facing primitive from scratch.

### Target Customers

Coucou fits organizers who care about guest identity, segmentation, and operational control:

- Independent event producers.
- Nightlife and hospitality groups.
- Fashion, art, music, and cultural programming teams.
- Brand/event marketing teams.
- Member clubs and communities.
- Conferences with curated or segmented admission.
- Agencies running recurring invite-only experiences.

### Coucou Modules

#### 1. Event CMS

Purpose: model event content and publish guest-facing experiences.

Capabilities:

- Events, series, venues, schedules, timezones.
- Titles, descriptions, hosts, production companies, assets, themes.
- Event pages and content blocks.
- Guest portal content after RSVP/approval.
- SEO/Open Graph/PWA metadata.
- Draft/published/scheduled states.
- Localized or multi-page event content.

Current Dojo foundation:

- `events` table.
- Flyer/icon/guest portal image.
- Guest portal link.
- Theme colors.
- Event page and ticket/status content.

Needed for Coucou:

- Explicit content schema.
- Slugs and custom domains.
- Reusable venue and host records.
- Content versioning.
- Published preview state.

#### 2. Access and Guest Lists

Purpose: control who can see, request, or enter an event.

Capabilities:

- Segments/lists.
- Shared passwords.
- Unique invite links.
- One-time codes.
- Imported guest lists.
- Referral links.
- Waitlists.
- Capacity and quota rules.
- List-specific ticket behavior and messaging.

Current Dojo foundation:

- `listCredentials` with password hashing/fingerprints.
- Per-list QR generation.
- Per-list approval messages.
- Password resolution.

Needed for Coucou:

- Rename "list credentials" into broader `accessGrants`, `segments`, and `entryRules`.
- Allow multiple credential types per segment.
- Add invite ownership, usage limits, and attribution.
- Add list-level quotas and approval policies.

#### 3. RSVP and Form Engine

Purpose: collect guest data and manage request state.

Capabilities:

- Form definitions.
- Required/optional fields.
- Field sanitization.
- Conditional fields.
- Plus-one/attendee limits.
- Notes.
- Submission updates.
- Validation and policy rules.

Current Dojo foundation:

- Event custom fields.
- Required field validation.
- RSVP upsert.
- Guest profile shared field updates.
- Attendee count rules.

Needed for Coucou:

- Typed form schema versions.
- Conditional logic.
- Field-level privacy settings.
- Reusable form templates.
- Better merge behavior when event form definitions change.

#### 4. Guest CRM

Purpose: store durable guest relationships across events.

Capabilities:

- Person records.
- Contact points.
- Event history.
- Tags and segments.
- Consent preferences.
- Notes and internal fields.
- Deduplication and merge.
- Imports and exports.
- Guest timeline of RSVPs, tickets, messages, check-ins, and field changes.

Current Dojo foundation:

- `users`, `profiles`, `rsvps`, custom fields, and profile page.
- Obfuscated/encrypted contact handling.
- Organization users page.

Needed for Coucou:

- Separate "person" from auth user.
- Support guests without Clerk accounts when appropriate.
- Dedupe by phone/email/external ID.
- Add organizer-owned notes/tags.
- Make consent records independent, auditable objects.

#### 5. Approval, Ticketing, and Door

Purpose: turn RSVP requests into admission and track attendance.

Capabilities:

- Approval workflows.
- Ticket issuance.
- QR/pass generation.
- Ticket disable/reissue.
- Redemption/check-in.
- Unredeem/audit history.
- Door roles/devices.
- Offline mode and sync.

Current Dojo foundation:

- `approvals`.
- `redemptions`.
- ticket status on RSVP.
- Door scan and list views.
- Unredeem history.

Needed for Coucou:

- Dedicated ticket/pass model with types and inventory.
- Check-in sessions/devices.
- Offline-safe redemption tokens.
- Scan audit events.
- Apple/Google wallet support as an optional package.

#### 6. Communications

Purpose: send consent-aware transactional and promotional messages.

Capabilities:

- Message templates.
- Campaign drafts.
- Recipient segments.
- Personalization variables.
- Transactional approval/status messages.
- Promotional blasts.
- Delivery status tracking.
- Opt-out and consent management.
- Multi-channel routing.

Current Dojo foundation:

- Twilio SMS/MMS.
- `smsNotifications`.
- `textBlasts`.
- recipient filters.
- opt-out logs.
- usage/cost logs.
- QR MMS generation.

Needed for Coucou:

- Channel abstraction for SMS/email/WhatsApp/push/webhooks.
- Template library and template versioning.
- Automation triggers.
- Suppression lists.
- Deliverability settings.
- Provider adapters.

#### 7. Analytics and Exports

Purpose: help organizers understand demand, approvals, attendance, and communications.

Capabilities:

- Event funnel: views -> access unlocks -> RSVPs -> approvals -> tickets -> check-ins.
- List performance.
- Guest source/referral attribution.
- SMS/email delivery and opt-out trends.
- Export builder.
- Webhooks and warehouse sync.

Current Dojo foundation:

- Dashboard stats.
- RSVP and SMS trends.
- Event performance.
- CSV exports.

Needed for Coucou:

- Tenant-scoped metrics.
- Event and segment funnels.
- Cohorts across recurring events.
- Attribution and source tracking.
- API/webhook export pipeline.

#### 8. Integrations and Developer Platform

Purpose: make Coucou useful in custom stacks.

Capabilities:

- Public API.
- TypeScript SDK.
- React hooks.
- Optional UI components.
- Webhooks.
- API keys and OAuth.
- Provider adapters.
- Sandbox/test mode.
- CLI tools.

Current Dojo foundation:

- Convex functions provide a domain API internally.
- Strong TypeScript domain types exist in `apps/web/lib/types.ts`.

Needed for Coucou:

- Stable API contracts independent of internal Convex implementation.
- Versioned SDK.
- API key auth and app-scoped permissions.
- Idempotency keys for writes.
- Webhook signing.
- Rate limits and audit logs.

## Suggested Headless SDK Shape

### Package Layout

Potential package split:

- `@coucou/core`: domain types, schemas, errors, helpers.
- `@coucou/server`: Node/server SDK for event, CRM, ticket, and campaign APIs.
- `@coucou/react`: React hooks for guest and organizer experiences.
- `@coucou/ui`: optional headless/unstyled or lightly styled components.
- `@coucou/webhooks`: webhook verification helpers.
- `@coucou/cli`: local development and import/export helpers.

### Example SDK Concepts

```ts
import { Coucou } from "@coucou/server";

const coucou = new Coucou({
  apiKey: process.env.COUCOU_API_KEY,
});

const access = await coucou.access.resolve({
  eventSlug: "spring-opening",
  code: "vip-secret",
});

await coucou.rsvps.submit({
  eventId: access.eventId,
  segmentId: access.segmentId,
  guest: {
    firstName: "Mika",
    lastName: "Tanaka",
    phone: "+15555550123",
  },
  answers: {
    instagram: "@mika",
  },
  consent: {
    sms: true,
  },
});
```

React-level shape:

```ts
const event = useCoucouEvent({ slug: "spring-opening" });
const access = useCoucouAccessResolver();
const rsvpForm = useCoucouRsvpForm({ eventId: event.id, accessCode });
const ticket = useCoucouTicket({ eventId: event.id });
```

Door-level shape:

```ts
const result = await coucou.door.validateTicket({
  code,
  eventId,
});

if (result.status === "valid") {
  await coucou.door.redeemTicket({
    code,
    deviceId,
  });
}
```

### API Areas

Guest APIs:

- Resolve access code/link.
- Fetch event page/content.
- Submit RSVP.
- Update RSVP fields.
- Fetch RSVP status.
- Fetch ticket/pass.
- Update consent preferences.

Organizer APIs:

- Create/update events.
- Publish CMS content.
- Manage segments/lists/access credentials.
- Search guests/people.
- Approve/deny RSVPs.
- Issue/disable tickets.
- Send transactional or campaign messages.
- Export data.

Door APIs:

- Validate ticket.
- Redeem ticket.
- Unredeem ticket.
- Sync event guest list.
- Record offline check-in batch.

Webhook events:

- `guest.created`
- `rsvp.submitted`
- `rsvp.updated`
- `rsvp.approved`
- `rsvp.denied`
- `ticket.issued`
- `ticket.redeemed`
- `ticket.unredeemed`
- `message.sent`
- `message.failed`
- `consent.updated`

## Proposed Coucou Data Model

This is the durable model Coucou should move toward:

- `workspace`: tenant/account.
- `organization`: optional customer org record if separate from workspace.
- `membership`: user role in workspace.
- `user`: authenticated organizer or guest account.
- `person`: CRM identity, not necessarily authenticated.
- `contactPoint`: phone/email/social/external IDs for a person.
- `consentRecord`: channel, scope, source, timestamp, proof, and opt-out state.
- `event`: core event object.
- `eventPage`: CMS page/content for event.
- `venue`: reusable venue/location.
- `asset`: uploaded image/file metadata.
- `segment`: guest list or audience group.
- `accessCredential`: password, unique invite, referral code, imported invite, etc.
- `formDefinition`: versioned RSVP form schema.
- `rsvp`: event-specific request/submission.
- `approvalDecision`: audit record for approval/denial.
- `ticket`: issued entry credential.
- `checkIn`: redemption/check-in audit event.
- `messageTemplate`: reusable transactional/promotional copy.
- `campaign`: blast or automation.
- `messageDelivery`: per-recipient delivery attempt.
- `integration`: provider credentials/configuration.
- `webhookEndpoint`: outbound webhook target.
- `auditLog`: durable organizer/API/staff action log.

Mapping from Dojo:

- `events` -> `event` plus `eventPage`, `asset`, `venue`.
- `listCredentials` -> `segment` plus `accessCredential`.
- `rsvps` -> `rsvp` plus parts of `person` and `consentRecord`.
- `profiles` -> `contactPoint` with encrypted value.
- `redemptions` -> `ticket` plus `checkIn`.
- `smsNotifications` -> `messageDelivery`.
- `textBlasts` -> `campaign`.
- `smsOptOuts` -> `consentRecord`/suppression list.
- `approvals` -> `approvalDecision`/audit event.

## Recommended Build Path

### Phase 0: Stabilize Dojo as the Source Product

- Add accurate product documentation to replace scaffold README content.
- Make tenant/workspace ownership explicit across event, RSVP, campaign, ticket, and analytics tables.
- Review all authenticated backend queries for org scoping.
- Keep current Dojo app working while adding compatibility fields.
- Preserve existing guest, host, SMS, and door behavior.

### Phase 1: Extract Shared Domain Contracts

- Move stable domain types out of `apps/web/lib/types.ts` into a shared package.
- Define canonical status enums for RSVP, approval, ticket, message, and consent.
- Define typed errors.
- Define versioned input/output DTOs for public API boundaries.
- Keep Convex internals behind adapters.

### Phase 2: Create Coucou API Layer

- Add API keys, workspace scoping, permissions, idempotency, and audit logging.
- Expose guest, organizer, and door APIs.
- Add webhook delivery with signatures and retries.
- Build integration tests around API contracts, not UI internals.

### Phase 3: Ship Headless Guest SDK

- Start with the proven flow:
  - `resolveAccess`
  - `getEvent`
  - `submitRsvp`
  - `getStatus`
  - `getTicket`
  - `updateConsent`
- Add React hooks and optional RSVP/status/ticket components.
- Support custom UI from day one.

### Phase 4: Rebuild Organizer CRM/CMS on Coucou Contracts

- Keep the current host dashboard concepts but back them with Coucou APIs.
- Add person-centric CRM views.
- Add CMS page/content model.
- Add reusable segments and tags.
- Add import workflows.

### Phase 5: Expand Communications and Automations

- Generalize SMS into a channel/provider system.
- Add email and WhatsApp adapters.
- Add automation triggers:
  - RSVP submitted.
  - RSVP approved/denied.
  - Ticket issued.
  - Event reminder.
  - Missing field follow-up.
  - Post-event thank-you.
- Add template versioning and suppression logic.

### Phase 6: Harden Door and Analytics

- Add offline check-in support.
- Add check-in devices/sessions.
- Add ticket/pass types.
- Add funnel analytics and attribution.
- Add warehouse/webhook exports.

## High-Priority Design Decisions

1. Tenant model
   - Decide whether the top-level tenant is `workspace`, `organization`, or both.
   - Every event, person, segment, RSVP, ticket, campaign, and asset needs tenant ownership.

2. Auth model
   - Decide where Clerk remains required and where Coucou supports bring-your-own-auth.
   - Guest SDK should support authenticated and unauthenticated/person-first flows.

3. Contact and consent model
   - Consent must be channel-specific, event/workspace scoped, auditable, and separate from basic contact existence.

4. SDK contract stability
   - Convex generated APIs are useful internally but should not become the public contract.

5. CMS depth
   - Decide whether Coucou hosts full event pages or only provides content APIs/components.

6. Ticketing depth
   - Decide whether Coucou supports only RSVP-based admission first or also paid tickets, inventory, transfers, wallets, and refunds.

7. Communications channels
   - SMS is already implemented. Email and WhatsApp should be designed as peer channels, not bolt-ons.

8. Organizer CRM ownership
   - People, tags, notes, imports, and consent should belong to the organizer/workspace, not only to event RSVPs.

## Practical MVP for Coucou

The fastest credible Coucou MVP is not a full rebuild. It is a modular extraction of the current strongest Dojo loops:

1. Event CMS basics:
   - event details, assets, theme, guest portal content.

2. Access and RSVP SDK:
   - access resolution, event fetch, RSVP submit/update, status fetch.

3. CRM dashboard:
   - guests, RSVPs, filters, custom fields, approvals, CSV export.

4. Ticket and door module:
   - ticket issuance, QR display, validate/redeem/unredeem.

5. Consent-aware messaging:
   - approval SMS and targeted text blasts.

This MVP would let organizers build their own frontend while Coucou handles the operational backend and cockpit.

## Strategic Summary

Dojo Pomodoro already contains the essential logic for a headless event CRM/CMS:

- Event content and branding.
- Segmented access.
- RSVP collection.
- Guest identity and profile data.
- Approval workflows.
- Ticket issuance and QR redemption.
- Door operations.
- Consent-aware SMS.
- Campaign targeting.
- Analytics and exports.

Coucou should not discard this. It should productize it into modular boundaries:

- The backend domain becomes Coucou Core.
- The guest flows become Coucou SDK and embeddable components.
- The host dashboard becomes Coucou CRM/CMS.
- The SMS/text-blast system becomes Coucou Communications.
- The door portal becomes Coucou Check-In.

The main engineering shift is from a single integrated app to a tenant-scoped platform with stable APIs, SDKs, and hosted operational tools.
