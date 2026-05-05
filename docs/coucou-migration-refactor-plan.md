# Coucou Migration And Refactor Plan

Last updated: 2026-04-24

Companion docs:

- [Coucou Product Source Of Truth](./coucou-product-source-of-truth.md)
- [Coucou New Feature Buildout Plan](./coucou-new-feature-buildout-plan.md)

## 1. Summary

This plan migrates Dojo Pomodoro from a single integrated event app into Coucou: a tenant-scoped backend service, hosted organizer cockpit, and SDK platform that multiple client sites can connect to.

V1 decisions:

- Keep Convex as the core backend implementation.
- Keep Clerk as the authentication and organization/session provider.
- Keep Twilio as the SMS/MMS provider.
- Require guest accounts for RSVP/status/ticket flows.
- Build stable Coucou API and SDK contracts over the existing Convex implementation.
- Do not rewrite the backend or migrate to Better Auth/WorkOS in v1.

The migration should preserve existing Dojo guest, host, SMS, approval, ticket, export, and door behavior while introducing Coucou's tenant model, person CRM, API boundaries, and SDK packaging.

V1 scope clarification:

- V1 is a first-party multi-site platform rollout, not a broad public self-serve platform launch.
- `dojopomodoro.club` is the first branded Coucou client and must remain behaviorally the same for guests and functionally the same for organizers.
- Coucou must support additional manually onboarded branded client sites, such as `clubchlorine.party`, on the same backend.
- `coucou.now` serves as the superadmin portal and a shared admin shell for operators with access to multiple workspaces.
- Workspace-scoped dashboards must also be reachable from branded client routes such as `/admin` and `/door`.
- Public SDK and external developer onboarding can follow after this first-party multi-site architecture is stable.

## 2. Current State

Current repo shape:

- `apps/dojo`: first-party Dojo client app with guest flows, organizer dashboard, door tooling, and branded presentation.
- `apps/club-chlorine`: Dojo-parity branded client app for the second first-party site.
- `apps/coucou`: Coucou control-plane app for landing, auth, workspace switching, and superadmin/admin entry.
- `packages/backend`: Convex backend with schema, functions, actions, Clerk webhooks, Twilio SMS actions, migrations, tests, and file utilities.
- `packages/sdk`: shared site config, route helpers, and shared business rules such as approval messages, event branding, and QR code colors.
- `packages/ui`: shared React UI primitives and control-plane card components.
- `COUCOU_PLATFORM_SUMMARY.md`: current platform summary and product direction.

Current critical tables:

- `users`
- `orgMemberships`
- `events`
- `listCredentials`
- `profiles`
- `rsvps`
- `approvals`
- `redemptions`
- `smsNotifications`
- `textBlasts`
- `smsUsageLogs`
- `smsOptOuts`

Current strengths to preserve:

- End-to-end guest lifecycle already works.
- List password access exists.
- Event custom fields exist.
- Approval and ticket lifecycle are separated.
- QR redemption and door operations exist.
- SMS consent and Twilio sending exist.
- Host RSVP table has filtering, sorting, bulk actions, and export.
- Clerk org roles already gate host and door access.
- Tests exist for RSVP, approvals, redemptions, password utilities, migrations, QR colors, and SMS logic.

Immediate v1 framing:

- Treat Dojo as the first branded client skin and tenant on top of Coucou.
- Do not materially change the guest-facing Dojo experience in the first migration.
- Add the ability to spin up a second branded client domain against the same backend and shared admin architecture.

Current blockers for Coucou:

- Core tables do not have explicit `workspaceId`.
- Many host/admin queries are global after authentication.
- Role checks rely heavily on Clerk `org:admin` / `org:member` without verifying event ownership.
- Public API boundaries are generated Convex functions, not stable Coucou contracts.
- CRM is RSVP-centric rather than person-centric.
- Guest accounts are tied directly to Clerk users and event RSVPs.
- SMS campaigns are event-centric and not yet a workspace-wide campaign system.
- Custom domains and per-workspace routing are not modeled.
- API keys, idempotency, rate limits, webhooks, and audit logs are not modeled.

## 3. Migration Principles

1. Preserve current behavior while adding compatibility fields.
   Existing guest links, event passwords, RSVP status routing, approval SMS, tickets, and door scan flows should keep working until replacement routes are verified.

2. Add tenant scoping before public API expansion.
   No SDK/API work should be broadly exposed until workspace ownership and authorization are enforced.

3. Move from event-centric to workspace/person-centric data gradually.
   Keep RSVPs event-scoped, but introduce durable people, contact points, tags, and consent records.

4. Extract contracts before extracting UI.
   Public DTOs, enums, errors, and validation schemas should stabilize before reusable components move into SDK packages.

5. Keep Convex internal.
   Convex can remain the backend engine, but Coucou clients should call Coucou APIs/SDKs rather than generated Convex functions directly.

6. Keep auth provider choice reversible.
   Use Clerk in v1, but isolate auth assumptions behind Coucou identity/workspace helpers.

7. Ship the multi-site admin model before broad SDK distribution.
   The first externally visible proof is Dojo plus one additional branded client domain sharing Coucou backend and admin architecture.

## 4. Target Package Layout

Add workspace packages over time:

- `packages/core`
  - Published name: `@coucou/core`.
  - Owns enums, DTOs, validation schemas, error types, audience filter AST, webhook event types, and shared helpers.

- `packages/server`
  - Published name: `@coucou/server`.
  - Server SDK for private API key calls.
  - No React dependency.

- `packages/react`
  - Published name: `@coucou/react`.
  - React hooks for event, access, RSVP, status, ticket, and consent.

- `packages/ui`
  - Published name: `@coucou/ui`.
  - Optional unstyled or lightly styled embeddable components.

- `packages/webhooks`
  - Published name: `@coucou/webhooks`.
  - Signature verification and event parsing helpers.

Keep `apps/web` as the hosted Coucou dashboard and guest shell. Keep `apps/convex` as the backend service.

## 5. Data Migration Map

### 5.1 Tenant Layer

Add:

- `workspaces`
- `workspaceMemberships`
- `domains`
- `auditLogs`

Mapping:

- Existing Clerk organization IDs seed workspaces.
- Existing `orgMemberships` seed `workspaceMemberships`.
- Existing events without owner data go to a default workspace during migration.
- Future records must require `workspaceId`.

Compatibility:

- Keep `orgMemberships` while Clerk webhooks remain active.
- Store `clerkOrganizationId` on `workspace`.
- Store `workspaceId` on all new tenant-owned records.

Required indexes:

- `workspaces.by_clerkOrganizationId`
- `workspaceMemberships.by_workspace_user`
- `domains.by_hostname`
- `auditLogs.by_workspace_createdAt`

### 5.2 Events And CMS

Current:

- `events`

Add fields:

- `workspaceId`
- `slug`
- `visibility`
- `publishStatus`
- `createdByUserId`
- `updatedByUserId`
- `eventPageId` later if split

Add tables later:

- `eventPages`
- `venues`
- `assets`
- `eventSeries`

Mapping:

- Current flyer/icon/guest portal fields can remain on `events` during v1.
- Split into `assets` and `eventPages` after workspace scoping and API contracts are stable.

Required changes:

- Replace `events.listAll` global collection with workspace-scoped listing.
- Replace global `isFeatured` with workspace/domain-scoped default event routing.
- Add slug uniqueness within workspace or domain.

### 5.3 Lists And Access

Current:

- `listCredentials`

Target:

- `segments`
- `accessCredentials`
- `entryRules`

Migration:

- Each unique `(eventId, listKey)` becomes a segment.
- Each existing password credential becomes an access credential of type `shared_password`.
- `generateQR` and `approvalMessage` move to segment/list policy fields for v1.
- `passwordHash`, `passwordSalt`, `passwordIterations`, `passwordFingerprint`, and encrypted password remain in access credential records.

Compatibility:

- Keep `listCredentials` APIs until create/edit event flows use segments.
- Add a compatibility resolver that can read both old `listCredentials` and new `accessCredentials`.

Required behavior:

- Password uniqueness checks become workspace/event scoped.
- Access resolution returns `workspaceId`, `eventId`, `segmentId`, `listKey`, and public event data.

### 5.4 People, Contacts, And Users

Current:

- `users`
- `profiles`

Target:

- `users`
- `people`
- `contactPoints`
- `consentRecords`

Migration:

- Keep `users` as auth identity records synced from Clerk.
- Create one `person` per `(workspaceId, clerkUserId)` for every RSVP.
- Move encrypted phone data from `profiles` into `contactPoints` when person records exist.
- Keep `profiles` as compatibility storage during migration.

V1 guest account policy:

- RSVP submission still requires an authenticated Clerk user.
- The authenticated user must resolve to a workspace person before RSVP write.
- Future unauthenticated/person-first RSVP can be added later without changing CRM shape.

Required dedupe defaults:

- Within a workspace, dedupe candidates by normalized phone, normalized email, and external ID.
- Do not automatically merge across workspaces.
- Do not automatically merge without preserving audit history.

### 5.5 RSVP And Form Engine

Current:

- `rsvps`
- event-level `customFields`

Target:

- `formDefinitions`
- `rsvps`
- `rsvpAnswers` only if the current record shape becomes insufficient.

Migration:

- Add `workspaceId`, `personId`, `segmentId`, and `formDefinitionId` to `rsvps`.
- Generate a form definition from each event's `customFields`.
- Keep `customFieldValues` on `rsvps` for v1 compatibility.
- Continue to support existing status values.

Required changes:

- RSVP submission must validate that event, segment, person, and form belong to the same workspace.
- RSVP status lookup must check authenticated user owns the person/RVSP or has workspace staff permission.
- Host RSVP listing must be workspace-scoped and event-scoped.

### 5.6 Approvals, Tickets, And Door

Current:

- `approvals`
- `redemptions`
- `ticketStatus` on `rsvps`

Target:

- `approvalDecisions`
- `tickets`
- `checkIns`
- `doorSessions`
- `doorDevices` later

Migration:

- Add `workspaceId`, `personId`, and `segmentId` to `approvals`.
- Treat existing `redemptions` as ticket records during compatibility period.
- Add a first-class `tickets` table after tenant scoping.
- Keep `rsvps.ticketStatus` as denormalized compatibility until ticket APIs are stable.

Required changes:

- Door validation must verify staff membership in the ticket's workspace.
- Door staff with event-specific access can only scan/search assigned events.
- Redeem/unredeem writes must create audit records.

### 5.7 Communications

Current:

- `smsNotifications`
- `textBlasts`
- `smsUsageLogs`
- `smsOptOuts`

Target:

- `messageTemplates`
- `campaigns`
- `audienceDefinitions`
- `messageDeliveries`
- `suppressionRecords`
- `providerUsageLogs`

Migration:

- Add `workspaceId` to all existing SMS/campaign tables.
- Rename API concepts from text blast to campaign at public contract layer.
- Keep Twilio-specific internals behind a provider adapter.
- Convert `recipientFilter` JSON strings into typed audience definitions.

Required changes:

- Campaign recipient selection must be workspace-scoped.
- Sending must check consent records and suppression records.
- Delivery status webhooks must resolve by provider message ID and workspace.
- Campaign duplication must preserve audience definition and template variables without carrying sent state.

### 5.8 API And Developer Platform

Add:

- `apiKeys`
- `idempotencyKeys`
- `webhookEndpoints`
- `webhookDeliveries`
- `rateLimitBuckets`

Rules:

- API keys are workspace-scoped.
- Store only hashed key secret.
- Support key prefix for identification.
- Support environment: `test` or `live`.
- Support permission scopes.
- Require idempotency keys for write endpoints that create RSVP, ticket, campaign, or message resources.
- Sign webhooks with per-endpoint secret.

## 6. Authorization Refactor

### 6.1 Current Pattern To Replace

Current code often checks:

- `identity.role === "org:admin"`
- `identity.role === "org:member"`
- authenticated user exists

This is not enough for Coucou because the record being accessed may belong to another workspace.

### 6.2 Target Authorization Helpers

Create backend helpers:

- `requireAuthenticatedUser(ctx)`
- `resolveWorkspaceFromAuth(ctx, args)`
- `requireWorkspaceRole(ctx, workspaceId, allowedRoles)`
- `requireEventAccess(ctx, eventId, allowedRoles)`
- `requirePersonAccess(ctx, personId, allowedRoles)`
- `requireApiKey(ctx, scopes)`
- `assertSameWorkspace(...records)`
- `writeAuditLog(ctx, action, actor, targets, metadata)`

These helpers must:

- Resolve Clerk user ID.
- Resolve active Clerk organization ID where available.
- Resolve Coucou workspace.
- Verify role and record ownership.
- Avoid fallback to a global default org except in explicit migration scripts.

### 6.3 Public/Guest Rules

Public guest event access can read only:

- Published event page data.
- Access resolution result.
- Public RSVP form schema.
- Public organizer messaging disclosure.

Authenticated guest access can read/write only:

- Their own RSVP/status/ticket/consent/conversation records.
- Their own profile/contact information.

Guest accounts cannot read:

- Internal tags.
- Internal notes.
- Other guests.
- Campaign audiences.
- Delivery logs beyond their own user-facing message state.

### 6.4 Staff Rules

Host/admin access must be workspace-scoped and usually event-scoped.

Door access:

- Can read event door list and ticket state.
- Can redeem/unredeem.
- Can view door-visible notes only.
- Cannot export full CRM by default.
- Cannot view hidden reputation tags by default.

Developer access:

- Can manage API keys and webhooks.
- Cannot export PII unless explicitly granted.

## 7. API Boundary Refactor

### 7.1 Keep Convex Internal

Do not expose generated Convex function names as Coucou's public API.

Current internal function examples:

- `api.credentialsNode.resolveEventByPassword`
- `api.rsvps.submitRequest`
- `api.rsvps.statusForUserEvent`
- `api.approvals.approve`
- `api.redemptions.redeem`
- `api.textBlasts.sendBlast`

Target public names:

- `access.resolve`
- `rsvps.submit`
- `rsvps.getStatus`
- `approvals.approve`
- `tickets.redeem`
- `campaigns.send`

### 7.2 DTO Requirements

Every public API must define:

- Request DTO.
- Response DTO.
- Error codes.
- Permission requirement.
- Idempotency behavior.
- Rate-limit behavior.
- Webhook side effects.
- Audit-log side effects.

DTOs live in `@coucou/core`.

### 7.3 Error Model

Canonical error shape:

```ts
type CoucouError = {
  code: string;
  message: string;
  requestId: string;
  details?: Record<string, unknown>;
};
```

Initial error codes:

- `unauthorized`
- `forbidden`
- `not_found`
- `validation_failed`
- `conflict`
- `rate_limited`
- `idempotency_conflict`
- `consent_required`
- `message_suppressed`
- `provider_error`
- `workspace_required`
- `domain_not_verified`

## 8. SDK And Component Extraction

### 8.1 Extract `@coucou/core` First

Move from `apps/web/lib/types.ts` into shared package:

- Event DTOs.
- Custom field DTOs.
- RSVP statuses.
- Ticket statuses.
- Approval statuses.
- Campaign statuses.
- Consent statuses.
- Audience filter types.
- Error types.
- Webhook event types.

Keep app-specific UI props in `apps/web`.

### 8.2 Extract Server SDK

`@coucou/server` wraps the public Coucou API.

Required constructor:

```ts
const coucou = new Coucou({
  apiKey: process.env.COUCOU_API_KEY,
  environment: "live",
});
```

Initial methods:

- `access.resolve`
- `events.get`
- `rsvps.submit`
- `rsvps.getStatus`
- `tickets.get`
- `tickets.validate`
- `tickets.redeem`
- `people.search`
- `campaigns.create`
- `campaigns.previewAudience`
- `campaigns.send`

### 8.3 Extract React SDK

`@coucou/react` wraps guest-facing hooks:

- `useCoucouEvent`
- `useCoucouAccessResolver`
- `useCoucouRsvpForm`
- `useCoucouRsvpStatus`
- `useCoucouTicket`
- `useCoucouConsent`

The React SDK must not require Clerk directly at the public interface. It can accept token providers/adapters so custom client apps can integrate with Coucou v1 Clerk-backed auth.

### 8.4 Extract UI Components Last

Do not move UI components until APIs and hooks are stable.

Candidate components:

- Access code form.
- RSVP form.
- Consent block.
- Status view.
- Ticket QR.
- Table request form.

## 9. Frontend Refactor Areas

### 9.1 Auth And Routing

Current:

- `apps/web/proxy.ts` performs featured event redirect, event status routing, auth redirect, and path correction.
- `apps/web/app/providers.tsx` wraps entire app in Clerk and Convex providers.
- Guest event routes are hardcoded under `/events/[eventId]`.

Target:

- Extract route/auth state machine helpers.
- Add domain-aware workspace resolution.
- Support slug/domain event routing.
- Preserve password/invite state across Clerk sign-in.
- Support primary Coucou auth domain plus custom-domain satellite flows.

Refactor tasks:

- Move event route parsing into a tested helper.
- Move RSVP status-to-route logic into shared helper.
- Add workspace/domain lookup before featured/default event redirect.
- Add custom-domain allowed redirect handling for Clerk.

### 9.2 Event Forms

Current:

- Create and edit flows share some components but still duplicate event/list shaping logic.
- Event form mixes CMS, access lists, ticket behavior, SMS approval copy, and assets.

Target:

- Shared event form schema in core.
- Shared form sections:
  - Event basics.
  - Time/location.
  - Assets/theme.
  - Guest portal.
  - RSVP fields.
  - Lists/access.
  - Approval/ticket policies.

Refactor tasks:

- Normalize create/edit payload assembly.
- Replace list credential UI with segment/access credential model.
- Add event duplication using same schema.

### 9.3 RSVP And Profile Forms

Current:

- Guest RSVP form and profile shared field update overlap conceptually.
- Custom field behavior is event-defined and copied to profile management.

Target:

- Shared form renderer driven by `formDefinition`.
- Shared field sanitization and validation.
- Explicit profile/contact update step.
- Consent component reused across RSVP/status/profile.

Refactor tasks:

- Extract custom-field rendering.
- Extract attendee count control.
- Extract SMS consent disclosure block.
- Ensure all field updates use typed DTOs.

### 9.4 Host RSVP CRM

Current:

- `apps/web/app/host/rsvps/page.tsx` is large and handles table, filters, bulk actions, export, sorting, pagination, dialogs, and column state.

Target:

- Break into feature components and hooks:
  - event selector.
  - filter bar.
  - table.
  - bulk action toolbar.
  - export dialog.
  - row actions.
  - column preferences.
- Replace event-only data with person-enriched rows.

Refactor tasks:

- Introduce typed query DTO for RSVP list.
- Move export config into reusable schema.
- Add tag filters and person timeline drawer.

### 9.5 Texts And Campaigns

Current:

- There are `/host/texts` and `/host/text-blasts` surfaces.
- Backend table is `textBlasts`, but product should be campaigns.

Target:

- One Campaigns area.
- Draft, duplicate, inspect, send, delivery report, audience preview.
- Typed audience filters.
- Channel-agnostic naming with SMS as first channel.

Refactor tasks:

- Decide one route: `/host/campaigns`.
- Keep redirects from old routes.
- Rename UI copy from text blast to campaign where appropriate.
- Move old text blast filters into `audienceDefinition`.

### 9.6 Door

Current:

- Door routes include scan, list, ticket, and redeem handling.
- Access is based on Clerk roles.

Target:

- Workspace/event-scoped door sessions.
- Door list queries scoped by workspace and event.
- Door-visible notes only.
- Device/session model later.

Refactor tasks:

- Add `requireEventAccess` for all door operations.
- Add event assignment support before multi-venue usage.
- Create unified ticket validation response.

## 10. Redundant Or Confusing Flows To Consolidate

1. `/host/texts` and `/host/text-blasts`
   - Consolidate into Campaigns.

2. Event password vs access list credential
   - Rename public concept to access code/invite.
   - Internally migrate to segments/access credentials.

3. Featured event
   - Replace global featured event with workspace/domain default event.

4. RSVP status routing
   - Centralize mapping from RSVP/ticket state to guest route.

5. Ticket status on RSVP and redemptions table
   - Keep compatibility field, but move source of truth to tickets.

6. Profile vs person CRM
   - Guest profile remains user-owned; person CRM becomes workspace-owned.

7. Users page vs People CRM
   - Users page should manage team/auth users.
   - People CRM should manage guests/contacts.

8. Custom fields on event vs reusable forms
   - Keep event custom fields in v1, then generate versioned forms.

9. Approval message at event and list level
   - Make list/segment policy the primary source.
   - Keep event-level fallback for compatibility.

10. Role checks in UI and backend
   - Centralize backend enforcement.
   - UI role checks are convenience only.

## 11. Phase Plan

### Phase 0: Stabilize And Document

Goal: make current product understandable and testable.

Tasks:

- Keep these three docs current.
- Replace scaffold README content later with Coucou/Dojo development instructions.
- Inventory all global backend queries and mutations.
- Add missing tests around existing high-risk flows before refactor.
- Freeze public behavioral expectations for current Dojo flows.

Acceptance:

- Current tests pass.
- Docs identify all major migration entities and provider decisions.

### Phase 1: Workspace/Tenant Foundation

Goal: every core object has owner workspace.

Tasks:

- Add `workspaces`, `workspaceMemberships`, `domains`, and `auditLogs`.
- Add `workspaceId` to events, list credentials, RSVPs, approvals, redemptions, SMS notifications, text blasts, usage logs, and opt-outs.
- Backfill existing data to a default workspace seeded from Clerk organization if available.
- Add workspace-scoped indexes.
- Add authorization helpers.
- Update host/admin queries to require workspace/event ownership.

Acceptance:

- No host/admin query returns records outside the active workspace.
- Door actions verify workspace/event access.
- Dashboard metrics are workspace-scoped.
- Exports are workspace-scoped.

### Phase 2: Domain-Aware Auth And Routing

Goal: support `coucou.now` plus organizer custom domains.

Tasks:

- Add `domains` management.
- Add hostname-to-workspace resolution.
- Add domain default event routing.
- Configure Clerk primary/satellite domain model in app configuration.
- Preserve auth redirects from custom domains back through primary auth.
- Update middleware/proxy route logic for domain-aware event lookup.
- Add a shared workspace switcher in Coucou for users with access to multiple workspaces.
- Add branded client dashboard entry points:
  - `/admin`
  - `/door`
- Preserve existing Dojo guest-facing routes and behaviors.
- Decide whether existing Dojo `/host` routes remain as-is, redirect to `/admin`, or are internally rewritten behind the same dashboard shell.

Acceptance:

- Organizer can log into dashboard from `coucou.now/admin`.
- Organizer can open workspace-scoped admin dashboard from verified client-domain `/admin`.
- Organizer can open workspace-scoped door dashboard from verified client-domain `/door`.
- Organizer with multiple workspace memberships can switch contexts from Coucou.
- Guest can open event page from verified custom guest domain.
- `dojopomodoro.club` guest-facing behavior remains the same through migration.
- A second branded client domain can be attached to the same backend with separate workspace data.
- RSVP/status/ticket redirects preserve event/access context after login.

### Phase 3: Contracts And API Facade

Goal: create Coucou public contracts over Convex internals.

Tasks:

- Add `packages/core`.
- Move canonical types/enums/errors into core.
- Define v1 DTOs for guest, organizer, door, campaigns, and webhooks.
- Add API facade routes/functions that call internal Convex logic.
- Add request ID and error translation.
- Add idempotency storage for write APIs.

Acceptance:

- A custom server client can resolve access, fetch event, submit RSVP, fetch status, and fetch ticket without importing generated Convex APIs.
- API errors use canonical Coucou error shape.
- These contracts are sufficient for first-party branded client sites in v1; a broad public developer launch is not required in the first release.

### Phase 4: People CRM And Tags

Goal: move from RSVP-centric CRM to person-centric CRM.

Tasks:

- Add `people`, `contactPoints`, `personTags`, `tags`, `notes`, and `personTimelineEvents`.
- Create one person per workspace/user with RSVP history.
- Link RSVPs to people.
- Add person drawer/profile in host RSVP table.
- Add tags to audience filters and exports.

Acceptance:

- Host can inspect a person across events in the workspace.
- Host can add/remove tags and internal notes.
- Tags can filter RSVP table and campaigns.
- Internal tags are not visible to guests.

### Phase 5: Segments And Access Credentials

Goal: replace list credential model with broader access model.

Tasks:

- Add `segments`, `accessCredentials`, and `entryRules`.
- Migrate existing list credentials.
- Update event create/edit UI.
- Update access resolution.
- Preserve existing password links.

Acceptance:

- Existing list passwords still resolve.
- New events use segments/access credentials.
- Segment controls QR generation, approval message, quota, and attendee policy.

### Phase 6: Campaigns And Communications

Goal: turn text blasts into workspace campaigns.

Tasks:

- Add campaign/audience/template/delivery model.
- Convert recipient filters to typed audience definitions.
- Add delivery state filters.
- Add tag/list/event-history filters.
- Add campaign inspection and duplication.
- Keep Twilio provider adapter.

Acceptance:

- Host can build, preview, duplicate, inspect, and send a campaign.
- Audience filters support tags, event/list presence, RSVP status, ticket status, consent, custom fields, and delivery state.
- Sends are consent-aware and workspace-scoped.

### Phase 7: Tickets And Door Hardening

Goal: make admission first-class and door-safe.

Tasks:

- Add `tickets` and `checkIns`.
- Migrate redemptions into tickets/check-ins.
- Keep compatibility views for existing QR codes.
- Add door sessions and device model if needed.
- Improve scan audit and unredeem reasons.

Acceptance:

- Tickets are source of truth for admission status.
- Existing QR codes remain valid or have a documented migration.
- Door staff can only access assigned workspace/event data.

### Phase 8: SDKs And Embeds

Goal: ship reusable developer surfaces.

Tasks:

- Add `@coucou/server`.
- Add `@coucou/react`.
- Add optional `@coucou/ui`.
- Add webhook helper package.
- Add example custom client app or docs.

Acceptance:

- A custom site can implement event access, RSVP, status, and ticket using Coucou packages.
- Hosted app and SDK use the same public contracts.

## 12. Testing Strategy

### 12.1 Backend Tests

Add tests for:

- Workspace backfill.
- Workspace-scoped event listing.
- Workspace-scoped RSVP listing.
- Host cannot approve RSVP outside workspace.
- Door cannot redeem ticket outside workspace.
- Guest cannot read another guest's status/ticket.
- Access resolution returns workspace/event/segment.
- Campaign audience filters do not cross workspace.
- Consent/suppression blocks sending.
- Idempotent RSVP submit and campaign creation.
- Webhook signature generation and retry.

### 12.2 Frontend Tests

Add tests for:

- Domain-aware route resolution.
- Sign-in redirect preserving event/access context.
- Host event create/edit form payload shaping.
- RSVP form custom field validation.
- Consent disclosure rendering with organizer name.
- Campaign audience preview UI.
- Person tag UI not visible to guests.
- Door invalid/redeemed/disabled states.

### 12.3 Migration Tests

Add tests for:

- Existing events receive workspace IDs.
- Existing list credentials become segments/access credentials.
- Existing RSVPs link to people.
- Existing redemptions map to tickets/check-ins.
- Existing text blasts map to campaigns.
- Existing SMS notifications map to message deliveries.
- Backfill scripts are resumable and idempotent.

### 12.4 Manual Acceptance Scenarios

Run these before calling a migration phase complete:

- Guest enters access code, signs in, RSVPs, toggles SMS consent, sees pending.
- Host approves guest and approval SMS is scheduled/sent in allowed environment.
- Guest sees ticket and QR.
- Door staff scans, redeems, unredeems, and sees audit history.
- Host exports RSVP data.
- Host creates a tagged person and sends a tag-filtered campaign.
- Host duplicates a campaign and verifies audience preview before send.
- Organizer logs in from `coucou.now/admin`.
- Organizer opens admin dashboard from branded client `/admin`.
- Organizer opens door dashboard from branded client `/door`.
- Organizer with access to multiple workspaces switches between them from Coucou.
- `dojopomodoro.club` behaves the same for guests and functionally the same for organizers.
- A second branded client site can run on the same backend with isolated workspace data.
- Cross-workspace host cannot see or mutate another workspace's data.

## 13. Rollout Plan

### 13.1 Environments

Use:

- `development`: local and dev Convex.
- `staging`: realistic data copy or seeded test workspace.
- `production`: dojopomodoro.club/Coucou live.

Every destructive migration must run first in development/staging and report counts.

### 13.2 Feature Flags

Introduce flags:

- `workspacesEnabled`
- `customDomainsEnabled`
- `apiFacadeEnabled`
- `peopleCrmEnabled`
- `segmentsEnabled`
- `campaignsV2Enabled`
- `ticketsV2Enabled`
- `sdkEnabled`

Flags should be workspace-scoped where possible.

### 13.3 Backfill Discipline

Backfills must:

- Be resumable.
- Be idempotent.
- Log counts.
- Avoid deleting old fields until compatibility period ends.
- Have rollback notes for each phase.

### 13.4 Compatibility Period

Keep old fields until new reads and writes have been verified:

- `listCredentials.listKey`
- `rsvps.listKey`
- `rsvps.ticketStatus`
- `redemptions`
- `textBlasts`
- `smsNotifications`
- event `customFields`
- event `approvalMessage`

Only remove legacy fields after:

- Public contracts no longer expose them.
- Migration tests cover old and new data.
- Production has run through at least one complete event lifecycle.

## 14. Auth Provider Decision Record

Decision:

- Use Clerk + Twilio for v1.

Reason:

- Current app already depends on Clerk and Twilio.
- Clerk Organizations and Convex JWT integration match the current architecture.
- Clerk satellite domains support the required custom-domain/shared-session direction.
- Twilio already handles SMS sending and can support opt-out and optional verification.

Known limitation:

- Clerk satellite custom domains still rely on a primary auth domain for sign-in/sign-up completion. Coucou must make this flow feel intentional.

V1 delivery implication:

- Coucou should optimize first for Coucou-managed satellite client sites and shared admin routing, not for public self-serve customer configuration on day one.

Deferred:

- Better Auth if Coucou decides to own auth and API-key infrastructure.
- WorkOS when enterprise SSO, SCIM, Admin Portal, or audit log export becomes required.

Sources:

- [Clerk satellite domains](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains)
- [Clerk Organizations](https://clerk.com/docs/organizations/overview)
- [Convex and Clerk](https://docs.convex.dev/auth/clerk)
- [Twilio Messaging Services](https://www.twilio.com/docs/messaging/services)
- [Twilio Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out)
- [Twilio A2P 10DLC](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)
- [Better Auth API Key plugin](https://better-auth.com/docs/plugins/api-key)
- [WorkOS AuthKit](https://workos.com/docs/user-management/authkit)

## 15. Implementation Checklist

Before any phase is marked done:

- All new data writes include `workspaceId`.
- Authorization checks verify role and record ownership.
- API/SDK contracts use `@coucou/core` types.
- No new `any` types are introduced.
- Variable names remain descriptive.
- `bun lint` passes.
- Relevant backend tests pass.
- Migration scripts report before/after counts.
- User-facing copy does not expose internal tenant implementation details.
- SMS/consent copy identifies the organizer/end business.
- Audit logs cover sensitive staff/API actions.
