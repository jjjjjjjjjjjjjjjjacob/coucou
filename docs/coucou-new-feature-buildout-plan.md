# Coucou New Feature Buildout Plan

Last updated: 2026-04-24

Companion docs:

- [Coucou Product Source Of Truth](./coucou-product-source-of-truth.md)
- [Coucou Migration And Refactor Plan](./coucou-migration-refactor-plan.md)

## 1. Summary

This plan covers features that do not exist in the current Dojo Pomodoro MVP or are incomplete for Coucou's target product.

The buildout should happen after or alongside the migration plan, but tenant scoping and authorization hardening must come first for any feature that exposes organizer data across custom domains, APIs, SDKs, campaigns, or multiple workspaces.

V1 focus:

- Workspace-safe Coucou backend.
- Custom-domain organizer and guest routing.
- Coucou-hosted superadmin and multi-workspace admin shell.
- Branded client-site admin and door dashboards on `/admin` and `/door`.
- Required-account guest RSVP flow with Dojo guest behavior preserved.
- Organizer CRM foundation.
- Tags and list/event history.
- Campaign audience filtering and inspection.
- Table requests and guest-to-organizer communication.
- Door and ticket hardening.
- Manual onboarding and configuration of the first client sites.

## 2. Prioritization Framework

Use this order when choosing work:

1. Tenant safety.
   No multi-client platform work is safe without workspace scoping, authorization helpers, and audit logs.

2. Existing event lifecycle parity.
   Dojo's current create event -> guest RSVP -> approval -> ticket -> door -> text blast loop must keep working.

3. Organizer CRM leverage.
   Tags, person history, notes, and filters create the main product difference from generic RSVP tools.

4. Headless adoption.
   SDK/API work matters because Coucou's promise is custom frontends and custom domains.

5. Communications depth.
   Campaign targeting, delivery inspection, and conversations make the CRM actionable.

6. Enterprise polish.
   SSO, directory sync, offline door, warehouse sync, and paid ticketing come after the core loop is stable.

## 3. Milestone 1: Coucou V1 Foundation

Goal: ship Coucou as a tenant-safe multi-site version of Dojo where Dojo remains the first branded client and additional branded client domains can run on the same backend.

### 3.1 Workspace And Tenant Safety

Features:

- Workspace records.
- Workspace memberships.
- Workspace-scoped roles.
- Domain records.
- Audit logs.
- Workspace-scoped dashboards, exports, campaigns, RSVPs, tickets, and door operations.
- Superadmin support on Coucou-hosted domain.

User stories:

- As a workspace owner, I can see only my events, people, campaigns, messages, and exports.
- As a host, I cannot approve or export RSVPs from another workspace.
- As door staff, I cannot scan another workspace's ticket.
- As platform admin, any cross-workspace action is audited.

Acceptance criteria:

- Every core table has `workspaceId` or a documented non-tenant reason.
- Every host/admin/door mutation verifies workspace membership and role.
- Dashboard metrics are workspace-scoped.
- Existing Dojo data is backfilled to a workspace.

Tests:

- Cross-workspace event list isolation.
- Cross-workspace RSVP approve denied.
- Cross-workspace ticket redeem denied.
- Cross-workspace campaign audience denied.

### 3.2 Custom Domains And Auth Routing

Features:

- Domain verification model.
- Guest domain routing.
- Admin domain routing.
- Coucou-hosted dashboard login from `coucou.events`.
- Per-app Clerk configuration, with satellite-domain support deferred.
- Auth redirect context preservation.
- Multi-workspace switcher from Coucou.
- Client-site dashboard routes:
  - `/admin`
  - `/door`

User stories:

- As an organizer, I can log into Coucou from `coucou.events`.
- As an organizer, I can log into Coucou from `coucou.events/admin` and switch between workspaces I can access.
- As an organizer, I can log into Coucou from my own client domain at `/admin`.
- As door staff, I can use the same workspace-scoped dashboard from the client domain at `/door`.
- As a guest, I can open an event page on the organizer's domain.
- As a guest, if I sign in during RSVP, I return to the correct event/list flow.

Acceptance criteria:

- Hostname resolves to workspace.
- Verified custom domains can be marked active.
- Guest event pages render from custom domains.
- Sign-in and sign-up routes use the active app's Clerk configuration.
- Password/invite context survives auth redirects.
- Dojo guest routes remain unchanged through the migration.
- `dojopomodoro.club/admin` and `dojopomodoro.club/door` resolve to the Dojo workspace.
- A second branded client such as `clubchlorine.party/admin` can resolve to a different workspace on the same backend.

Tests:

- Hostname-to-workspace resolver.
- Domain default event resolver.
- RSVP redirect after sign-in.
- Admin custom-domain access.

### 3.3 Hosted Organizer Dashboard Parity

Features:

- Event list.
- Create/edit/duplicate event.
- RSVP review.
- Bulk approval.
- Ticket status updates.
- CSV export.
- Door scan/list.
- SMS campaigns parity with current text blasts.
- Workspace switcher.
- Coucou superadmin view.
- Client-site dashboard entry points for admin and door.

User stories:

- As a host, I can do everything I can do in Dojo today under Coucou naming and workspace scoping.
- As a host, I can access that same dashboard from either Coucou or my client domain.
- As a host, I can duplicate a previous event to reduce setup time.
- As door staff, I can scan and search the event list on mobile.

Acceptance criteria:

- Existing Dojo lifecycle remains usable.
- Old `/host/texts` and `/host/text-blasts` paths redirect or consolidate safely.
- Existing RSVP export options remain available.
- Existing QR tickets remain valid through migration.
- `coucou.events/admin` can open the Dojo workspace or another client workspace.
- Client domains can host the same admin and door surfaces at `/admin` and `/door`.

Tests:

- Create event with lists and custom fields.
- RSVP and approve.
- Export list.
- Send approval SMS in enabled environment.
- Redeem QR.

### 3.4 First-Party Shared Client Contract

Features:

- Public-facing internal DTOs for first-party client sites.
- Access resolution endpoint.
- Event fetch endpoint.
- RSVP submit endpoint.
- RSVP status endpoint.
- Ticket fetch endpoint.
- Consent update endpoint.
- Canonical error model.

User stories:

- As the Coucou team, we can power `dojopomodoro.club` and a second branded site from the same backend without tying those sites directly to generated Convex APIs.
- As the Coucou team, we can preserve existing Dojo guest behavior while making room for future multi-site reuse.

Acceptance criteria:

- APIs are workspace/domain aware.
- APIs require guest auth for RSVP/status/ticket in v1.
- APIs return stable typed responses from `@coucou/core`.
- Convex function names are hidden behind Coucou-owned contracts for first-party clients.
- Broad third-party public SDK distribution is not required for v1.

Tests:

- Access code success/failure.
- RSVP submit with account.
- RSVP submit without account rejected.
- Status only visible to owner guest or staff.
- Ticket only visible to owner guest or staff.

## 4. Milestone 2: People CRM And Tags

Goal: make Coucou a durable guest CRM, not only an event RSVP table.

### 4.1 Person Profiles

Features:

- Workspace-owned person profile.
- Auth user linkage.
- Contact points.
- Event history.
- RSVP history.
- Ticket/check-in history.
- Message history.
- Consent summary.
- Timeline.

User stories:

- As a host, I can click an RSVP and see the guest's past events, tags, notes, and attendance.
- As a CRM operator, I can search people by name, phone, email, tag, list, or event history.
- As a workspace owner, I can understand one guest's relationship with the workspace over time.

Acceptance criteria:

- Person exists for each current RSVP guest.
- Person profile shows event history within current workspace only.
- Person profile does not expose other workspace data.
- Contact values are encrypted/obfuscated according to current privacy pattern.

Tests:

- Person backfill from RSVP.
- Person timeline across two events.
- Cross-workspace person isolation.
- Contact obfuscation in UI.

### 4.2 Tags And Reputation

Features:

- Preset tags.
- Custom tags.
- Tag categories.
- Tag color/label.
- Permission-gated visibility.
- Batch tag assignment.
- Tag audit history.
- Tag filters in people, RSVP, campaign, and export views.

Preset categories:

- Relationship.
- Value.
- Operations.
- Conduct.
- Custom.

User stories:

- As a host, I can tag someone as a regular, member, influencer, table guest, or workspace-defined reputation label.
- As a CRM operator, I can filter guests by tags before sending a campaign.
- As a workspace owner, I can restrict sensitive tags to admins.

Acceptance criteria:

- Guests never see internal tags.
- Tag changes are audit logged.
- Sensitive tag categories can be hidden from door and non-admin users.
- Tag filters work in RSVP table and campaigns.

Tests:

- Create custom tag.
- Assign/remove tag.
- Permission-gated tag hidden from door role.
- Tag filter returns expected people.
- Tag assignment audit log.

### 4.3 Notes And Internal Fields

Features:

- Internal notes on person, RSVP, and event.
- Door-visible notes.
- Approval-only notes.
- Custom internal person fields.
- Note pinning later.

User stories:

- As a host, I can record context that helps future approval decisions.
- As door staff, I can see only notes relevant to check-in.
- As an admin, I can audit who added or edited sensitive notes.

Acceptance criteria:

- Notes support visibility levels.
- Door users see only door-visible notes.
- Note create/edit/delete is audited.

Tests:

- Door note visibility.
- Hidden note not returned to door.
- Note audit events.

### 4.4 Imports And Dedupe

Features:

- CSV import for people.
- Import into segment/list.
- Normalize phone/email.
- Dedupe suggestions.
- Manual merge.
- Import audit.

User stories:

- As a host, I can import a list from a spreadsheet and attach it to an event or workspace segment.
- As a CRM operator, I can review duplicate people before merging.

Acceptance criteria:

- Import does not overwrite existing person data without explicit mapping.
- Import creates a report of created, updated, skipped, and duplicate rows.
- Merge preserves history.

Tests:

- Import new people.
- Import duplicate phone.
- Merge two people.
- Segment assignment from import.

## 5. Milestone 3: Advanced Campaigns

Goal: make campaigns targetable, inspectable, duplicable, and delivery-aware.

### 5.1 Audience Builder

Features:

- Typed audience filter builder.
- Filter by person tag.
- Filter by segment membership.
- Filter by list presence for one event.
- Filter by list presence across events.
- Filter by RSVP status.
- Filter by ticket status.
- Filter by checked-in/no-show.
- Filter by custom field exists/missing/equals/contains.
- Filter by consent status.
- Filter by phone availability.
- Filter by prior campaign delivery.
- Filter by prior campaign failure.
- Filter by date ranges.
- Filter by selected recipients for testing.

User stories:

- As a host, I can text everyone on a specific event list who was approved but did not receive an approval SMS.
- As a marketer, I can text all tagged regulars who attended the last three events and have SMS consent.
- As a host, I can exclude anyone who already received a campaign.
- As a host, I can text only selected test recipients before a full send.

Acceptance criteria:

- Audience preview shows total matched, deliverable, suppressed, missing phone, and missing consent counts.
- Audience filter expressions are saved and reusable.
- Audience evaluation is workspace-scoped.
- Audience preview and final send use the same filter engine.

Tests:

- Tag filter.
- List presence filter.
- Delivery state filter.
- Consent exclusion.
- Selected test recipients.
- Preview/send count consistency.

### 5.2 Campaign Lifecycle

Features:

- Draft campaign.
- Duplicate campaign.
- Inspect sent campaign.
- Scheduled campaign.
- Send now.
- Cancel scheduled.
- Archive campaign.
- Delivery report.
- Recipient detail list.
- Failed recipient retry later.

User stories:

- As a host, I can duplicate last week's campaign and change the event variables.
- As a host, I can inspect who got a campaign, who failed, and why.
- As a host, I can see if a guest did not receive a blast before contacting them another way.

Acceptance criteria:

- Duplicating a campaign creates a draft with message and audience copied but delivery state reset.
- Sent campaigns cannot be edited, only duplicated or archived.
- Delivery report can be filtered by sent/delivered/failed/suppressed/opted out.
- Delivery rows link back to person profiles.

Tests:

- Duplicate draft.
- Duplicate sent campaign.
- Delivery report status filters.
- Sent campaign immutable.

### 5.3 Templates And Variables

Features:

- Message templates.
- Template versions.
- Variables:
  - `firstName`
  - `eventName`
  - `eventDate`
  - `eventLocation`
  - `ticketUrl`
  - `guestPortalUrl`
  - `organizerName`
  - `tableRequestUrl`
- Character and segment counter.
- QR/ticket link inclusion.

User stories:

- As a host, I can save approval copy and campaign copy for reuse.
- As a host, I can preview personalization before sending.

Acceptance criteria:

- Unknown variables are validation errors.
- Template version used for a send is preserved.
- SMS length and segment count are visible before sending.

Tests:

- Variable interpolation.
- Unknown variable rejection.
- Template version preserved after edit.

### 5.4 Compliance And Suppression

Features:

- Workspace suppression records.
- Twilio opt-out sync.
- Consent source and disclosure version.
- Message purpose: transactional or promotional.
- A2P registration tracking fields for workspace/provider configuration.

User stories:

- As a workspace owner, I can see whether messaging setup is production-ready.
- As a host, I cannot send promotional messages to guests without consent.
- As a guest, STOP prevents future messages.

Acceptance criteria:

- STOP/START/HELP webhooks update suppression and consent state.
- Promotional campaign sends require opt-in.
- Approval/status transactional messages still respect opt-out rules where legally/provider required.
- Provider errors are stored on delivery rows.

Tests:

- Opt-out blocks campaign.
- START re-enables when provider allows.
- Missing consent counted in preview.
- Provider failure stored.

## 6. Milestone 4: Table Requests And Conversations

Goal: give guests a controlled line to organizers, starting with SMS and dashboard inbox.

### 6.1 Table Requests

Features:

- Event-level toggle for table requests.
- Guest-facing table request form.
- Fields:
  - name/contact from account.
  - event.
  - party size.
  - arrival time.
  - budget/range optional.
  - occasion optional.
  - note.
  - callback preference.
- Dashboard queue.
- Request status.
- Assignment to staff.
- Link to person and RSVP.

User stories:

- As a guest, I can request a table while RSVPing or after approval.
- As a host, I can see table requests next to RSVP and CRM context.
- As a host, I can mark a request as accepted, rejected, follow-up, or resolved.

Acceptance criteria:

- Table request belongs to workspace/event/person.
- Guests can only see their own requests.
- Hosts can filter by status and event.
- Table request appears in person timeline.

Tests:

- Create table request as guest.
- Host updates status.
- Guest cannot read another request.
- Request appears in timeline.

### 6.2 Conversations

Features:

- Conversation thread.
- Inbound SMS handling.
- Outbound dashboard replies.
- Link to person/event/RSVP.
- Assignment.
- Status.
- Internal notes.
- Consent-aware outbound messages.

User stories:

- As a guest, I can text the organizer from the number provided.
- As an organizer, I can reply from the dashboard without exposing a personal phone.
- As a host, I can see message history before approving a guest.

Acceptance criteria:

- Incoming SMS maps to workspace/person when possible.
- Unknown inbound SMS can create an unresolved contact candidate.
- Outbound replies are logged as message deliveries.
- Conversation thread appears in person timeline.
- Internal notes are not sent to guest.

Tests:

- Incoming SMS maps by phone.
- Dashboard reply sends through Twilio adapter.
- Consent/suppression blocks promotional reply when required.
- Conversation assignment.

## 7. Milestone 5: SDK And Embeddable Components

Goal: let custom clients build Coucou-powered event experiences without using the hosted guest UI.

Scope note:

- This is post-v1 unless a first-party branded client needs a thin shared package during implementation.
- Public SDK release is not a v1 launch blocker.

### 7.1 TypeScript Server SDK

Features:

- API key client.
- Request IDs.
- Error parsing.
- Idempotency helper.
- Pagination helper.
- Methods for access, events, RSVPs, tickets, people, campaigns, webhooks.

User stories:

- As a developer, I can create a Next.js event site that uses Coucou from server actions or route handlers.
- As a developer, I can safely retry writes with idempotency keys.

Acceptance criteria:

- SDK has no React dependency.
- SDK methods map to public Coucou DTOs.
- SDK exposes typed errors.

Tests:

- SDK request signing/auth header.
- SDK error parsing.
- Idempotency key pass-through.

### 7.2 React SDK

Features:

- Event hook.
- Access resolver hook.
- RSVP form hook.
- Status hook.
- Ticket hook.
- Consent hook.
- Token provider adapter.

User stories:

- As a developer, I can build a custom guest page with hooks and my own UI.
- As a developer, I can integrate with Coucou's v1 Clerk-backed auth without hardcoding Convex internals.

Acceptance criteria:

- Hooks expose loading, error, data, and action states.
- Hooks accept workspace/domain/event identifiers.
- Hooks do not import app-specific components.

Tests:

- Hook success/error states.
- Auth required handling.
- Access resolve then RSVP submit flow.

### 7.3 UI Components

Features:

- Access form.
- RSVP form.
- Consent block.
- Status block.
- Ticket QR block.
- Guest portal block.
- Table request form.

User stories:

- As a developer, I can embed an RSVP flow and theme it for my client.
- As an organizer, I can use custom frontend without hiring someone to rebuild every form.

Acceptance criteria:

- Components are themeable.
- Components are accessible.
- Components do not display Coucou branding unless configured.
- Components can be used independently.

Tests:

- Render with custom theme.
- Keyboard interaction.
- Form validation.
- Mobile layout.

## 8. Milestone 6: Door And Ticketing Expansion

Goal: make Coucou trustworthy for larger door operations.

### 8.1 Door Sessions And Devices

Features:

- Door device registration.
- Door session per event/date.
- Staff assignment.
- Activity log.
- Device display name.
- Optional PIN/device code.

User stories:

- As a door manager, I can see which staff/device redeemed each ticket.
- As a host, I can revoke a device.

Acceptance criteria:

- Every redemption has staff and session/device context where available.
- Device access can be revoked.

Tests:

- Device registration.
- Redeem with device.
- Revoke device blocks redemption.

### 8.2 Offline Mode

Features:

- Offline ticket snapshot.
- Local redemption queue.
- Sync when online.
- Conflict detection.
- Duplicate scan warnings.

User stories:

- As door staff, I can keep checking guests in if venue connectivity drops.
- As a host, I can reconcile conflicts after reconnect.

Acceptance criteria:

- Offline mode is event/session scoped.
- Offline data expires.
- Sync produces conflict report.
- Duplicate redemptions are detected.

Tests:

- Offline snapshot generation.
- Offline redeem queue.
- Sync success.
- Sync duplicate conflict.

### 8.3 Wallet And Passes

Features:

- Apple Wallet pass.
- Google Wallet pass.
- Pass update on ticket disabled/reissued.
- QR compatibility.

Defer until QR ticketing and ticket source of truth are stable.

## 9. Milestone 7: Enterprise And Scale

Goal: support larger customers after core Coucou traction.

### 9.1 WorkOS Enterprise Add-On

Features:

- Enterprise SSO.
- Directory Sync / SCIM.
- Admin Portal.
- Enterprise audit log exports.
- Role mapping.

Trigger:

- Add when customers require SSO/SCIM in procurement, not before.

Acceptance criteria:

- WorkOS org maps to Coucou workspace.
- Directory users map to workspace memberships.
- Role mapping is explicit and auditable.

### 9.2 Warehousing And Webhooks

Features:

- Webhook endpoints.
- Retry and dead-letter.
- Signed webhook payloads.
- Event export stream.
- Warehouse sync later.

User stories:

- As a developer, I can trigger downstream automations when an RSVP is approved or a ticket is redeemed.
- As a larger customer, I can sync Coucou data into analytics tooling.

Acceptance criteria:

- Webhook payloads are signed.
- Failed webhooks retry with backoff.
- Delivery attempts are inspectable.

### 9.3 Multi-Channel Communications

Features:

- Email provider adapter.
- WhatsApp provider adapter.
- Channel preference.
- Cross-channel suppression.
- Automations.

Initial automations:

- RSVP submitted acknowledgement.
- Approval.
- Denial.
- Missing field follow-up.
- Event reminder.
- Table request follow-up.
- Post-event thank you.

Acceptance criteria:

- Channel adapters use same template/campaign/delivery model.
- Consent is channel-specific.

## 10. Data And UI Acceptance Matrix

| Area | Must Have Before Public V1 | Can Follow |
| --- | --- | --- |
| Tenant safety | Workspace IDs, authorization helpers, audit logs | Enterprise audit export |
| Domains | Guest/admin custom domains, `coucou.events/admin`, client `/admin` and `/door` | Self-serve DNS wizard polish |
| Auth | Clerk + required guest accounts + multi-workspace switching | WorkOS SSO, Better Auth evaluation |
| RSVP | Current Dojo parity, stable API | Conditional form logic |
| CRM | Person profiles, tags, notes | Merge UI, advanced dedupe |
| Campaigns | Audience preview, tags/list/history/delivery filters | Automations, email/WhatsApp |
| Door | QR scan, search, redeem/unredeem | Offline mode, devices, wallet |
| SDK | Shared first-party contracts for branded client sites | Public SDK, full UI package, and CLI |
| Analytics | Workspace/event funnel basics | Cohorts, attribution, warehouse |

## 11. Cross-Cutting Requirements

### 11.1 Audit Logs

Audit these actions:

- Workspace settings changed.
- Domain added/verified/disabled.
- Team member invited/role changed/removed.
- Event published/deleted.
- Access credential created/revealed/deleted.
- RSVP approved/denied/bulk changed.
- Ticket issued/disabled/redeemed/unredeemed.
- Tag created/deleted/assigned/removed.
- Sensitive note created/edited/deleted.
- Campaign sent.
- Export generated.
- API key created/revoked.
- Webhook endpoint created/disabled.

### 11.2 Permissions

Every new feature must define:

- Guest access.
- Door access.
- Host access.
- Admin access.
- Owner access.
- API key access.
- Platform admin access.

### 11.3 Privacy

Every new feature must define:

- Whether guests can see it.
- Whether door staff can see it.
- Whether it can be exported.
- Whether it contains PII.
- Whether it is audit logged.
- Whether it participates in deletion/anonymization.

### 11.4 API Contracts

Every public feature must define:

- Request DTO.
- Response DTO.
- Error codes.
- Idempotency behavior.
- Rate-limit behavior.
- Webhook events emitted.
- Test-mode behavior.

## 12. Recommended Build Order

1. Workspace/tenant foundation.
2. Domain-aware routing and Clerk custom-domain support.
3. Coucou superadmin and multi-workspace admin shell.
4. Existing Dojo lifecycle parity under workspace scoping.
5. Client-site `/admin` and `/door` dashboard access.
6. First-party shared contracts and `@coucou/core`.
7. People CRM and tags.
8. Campaign audience builder and delivery inspection.
9. Table requests and conversations.
10. Server SDK and React SDK.
11. Embeddable UI components.
12. Door sessions/devices and offline mode.
13. Webhooks and automations.
14. WorkOS enterprise add-on.

## 13. V1 Launch Definition

Coucou v1 can launch privately when:

- `dojopomodoro.club` runs on Coucou backend while preserving current guest-facing behavior and organizer expectations.
- `coucou.events/admin` works as superadmin portal and workspace admin shell.
- An organizer with access to multiple workspaces can switch between them from Coucou.
- At least one additional branded client domain, such as `clubchlorine.party`, can run on the same backend with separate workspace data.
- Organizer can manage the Dojo workspace from `dojopomodoro.club/admin`.
- Door staff can manage the Dojo workspace from `dojopomodoro.club/door`.
- Organizer can manage another client workspace from its client-domain `/admin`.
- Guest RSVP/status/ticket flows require account login and work after redirect.
- Host can tag people and use tags in campaign targeting.
- Host can filter campaigns by list presence, RSVP status, ticket status, consent, and delivery state.
- Host can duplicate and inspect campaigns.
- Table request MVP is available or explicitly feature-flagged off.
- Shared first-party contracts support the branded client sites.
- Cross-workspace access tests pass.
- SMS opt-out and consent behavior is verified.
- Current Dojo production behavior has a rollback path.
