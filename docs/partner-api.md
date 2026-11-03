# Coucou Partner API

REST API + encrypted webhooks for integrating third-party apps ("consumers") with coucou:
read event data, mirror RSVPs as they happen, and write RSVPs on behalf of users that exist
in both systems.

- API version: `2026-07-29` (sent as `apiVersion` in webhook payloads; source of truth is
  `@coucou/sdk/api-v1` → `API_VERSION`)
- Public reference: `https://coucou.events/docs/partner-api` (no Coucou workspace login
  required).
- Identity matching is **phone-only** (normalized E.164). Email is not part of v1.
- All management (API keys, webhook endpoints) lives in the coucou host dashboard under
  **Workspace → Developers**.

## Base URL

The API is served by the Convex deployment's HTTP router:

```
https://<deployment>.convex.site/api/v1
```

The exact base URL for your workspace is shown on the Developers page (it is the
`NEXT_PUBLIC_CONVEX_URL` with `.convex.cloud` replaced by `.convex.site`).

## Authentication

Server-to-server only. Every request carries an API key:

```
Authorization: Bearer coucou_sk_...
```

- Keys are created per workspace on the Developers page, shown **once**, and stored
  hashed (SHA-256). Treat them like passwords; never ship them to a browser (the API
  sends no CORS headers, deliberately).
- Keys carry scopes: `events:read`, `events:write`, `rsvps:read`, `rsvps:write`.
- Keys also carry event access: `selected` for one or more assigned events, or explicit
  `all` access for every current and future workspace event.
- All data access is scoped to the key's workspace and event grants. Objects outside
  either boundary read as 404 — existence is not leaked.
- Existing keys created before event grants retain legacy all-event access until a host
  narrows them.

## Configuration quick guides

### Coucou-managed RSVP and SMS

For a Coucou-hosted page such as Danza Organica, configure the event and SMS program in
Coucou, then assign that event to a webhook endpoint. The hosted form collects consent;
no API key is required unless the partner also needs reads or writes.

For a delegated form such as The Market:

1. Provision an event-scoped key with `events:read`, `rsvps:read`, and `rsvps:write`.
2. Fetch the event form and `GET .../rsvps/sms-consent` program.
3. Render the returned, separate SMS checkbox unchecked unless the returned phone
   preference is already true.
4. Send `smsConsent` only as the user's explicit choice. Send `smsConsentIpAddress` with
   true only when the end user's IP can be forwarded reliably.
5. Subscribe an endpoint assigned to the same event to the RSVP and event lifecycle
   events the partner mirrors, including approval and denial decisions.

### Partner-managed RSVP and SMS

1. Provision a key with `rsvps:write` and only the destination Coucou event.
2. POST each partner RSVP by E.164 phone and store the returned Coucou `rsvpId`.
3. **Omit both `smsConsent` and `smsConsentIpAddress`.** Do not send false: false is an
   explicit Coucou opt-out and may send an opt-out status message.
4. Replay the partner's current roster through the idempotent POST, then use the
   paginated Coucou RSVP endpoint to reconcile the resulting IDs and state.
5. Assign a webhook endpoint to the same event for Coucou approval, ticket, attendance,
   and deletion updates. Compare `origin.apiClientId` with the provisioned client ID and
   ignore only that client's own writes.

### Coucou list shared outward

Use the paginated RSVP endpoint once to backfill the existing event list, then consume
webhooks for changes. A server-side adapter is responsible for any Partiful, Posh, Luma,
or other destination API and its own privacy/consent requirements.

## Errors

Every error is JSON:

```json
{ "error": { "code": "invalid_request", "message": "That list password is not valid for this event", "field": "listPassword" } }
```

Codes: `unauthorized` (401), `forbidden` (403 — key lacks the scope), `not_found` (404),
`invalid_request` (400), `conflict` (409), `method_not_allowed` (405), `internal_error` (500).

Rate limiting is **not enforced in v1** (planned follow-up: `@convex-dev/rate-limiter`
keyed by API client). Be a good citizen.

## Read endpoints

### `GET /api/v1/events` — scope `events:read`

Query params: `status` (`published` default | `all`), `limit` (1–100, default 25),
`cursor` (from `nextCursor`).

```json
{ "data": [ { "id": "...", "shortId": "abc123", "name": "...", "location": "...",
  "eventDate": 1753000000000, "eventEndDate": null, "eventTimezone": "America/New_York",
  "flyerUrl": "https://...", "status": "active", "lifecycle": "published",
  "publishedAt": 1752000000000, "isFeatured": false, "maxAttendeesPerRsvp": 2,
  "workspaceSlug": "club-chlorine", "createdAt": 0, "updatedAt": 0 } ],
  "nextCursor": null }
```

### `GET /api/v1/events/{eventRouteId}` — scope `events:read`

`eventRouteId` is the event's `shortId` (preferred) or document id. Adds:

```json
{ "lists": [ { "listKey": "vip", "isPasswordProtected": true, "generatesQrCode": true } ],
  "rsvpForm": { "attendanceQuestionEnabled": false, "maxAttendees": 2,
    "acceptsListPassword": true, "customFields": [], "socialPlatforms": [],
    "invitedBy": null },
  "attendanceCounts": { "approved": 12, "pending": 3, "denied": 1, "total": 16 } }
```

Counts are approval-status buckets. Attendance-answer (yes/no/maybe) breakdowns are not
included in v1.

### `GET /api/v1/events/{eventRouteId}/rsvps` — scope `rsvps:read`

Enumerates an assigned event's existing RSVP/contact list for initial backfill and
reconciliation. Query params: `limit` (1–100, default 25) and `cursor`.

```json
{
  "data": [
    {
      "rsvpId": "...", "approvalStatus": "approved", "attendanceStatus": "yes",
      "source": "form", "listKey": "ga", "attendees": 2, "name": "Jane Doe", "isGuest": false,
      "phone": "+15551234567", "phoneHash": "<sha256 hex of E.164>",
      "createdAt": 0, "updatedAt": 0, "ticket": null
    }
  ],
  "nextCursor": null
}
```

### `GET /api/v1/events/{eventRouteId}/rsvps/lookup?phone=+15551234567` — scope `rsvps:read`

Looks up the RSVP for a phone number at an event (real account match first, then guest
match by phone hash). 404 if none.

```json
{ "rsvpId": "...", "source": "form", "approvalStatus": "approved", "attendanceStatus": "yes",
  "listKey": "ga", "attendees": 2, "name": "Jane Doe", "isGuest": false,
  "createdAt": 0, "updatedAt": 0 }
```

### `GET /api/v1/events/{eventRouteId}/rsvps/sms-consent?phone=+15551234567` — scope `rsvps:read`

Returns the phone's organizer-wide SMS preference plus the Coucou-branded consent program
for that organizer's event context. The preference applies across every event in the event's
Coucou workspace.
Omit `phone` to retrieve the program without asserting a known preference; in that case
`smsConsent` and `smsConsentTimestamp` are `null`.

```json
{
  "smsConsent": true,
  "smsConsentTimestamp": 1753000000000,
  "smsProgram": {
    "organizerName": "Example Events",
    "consentLabel": "I agree to receive recurring SMS messages from Coucou, a Soluo LLC service, about Example Events.",
    "disclosure": "Coucou may send account notifications, RSVP and guest-list updates about Example Events, ...",
    "termsUrl": "https://coucou.events/terms",
    "privacyUrl": "https://coucou.events/privacy"
  }
}
```

Program URLs use Coucou's canonical, publicly accessible Terms and Privacy Policy.

## Write endpoints

Consumers can create RSVPs, change attendance, and update event details. **Approval/denial,
ticket state, and publish state are host-only** and cannot be influenced through the API —
fields like `approvalStatus` or `lifecycle` in a request body are ignored.

RSVP responses include `source` as `"text"`, `"form"`, `"api"`, or `"unknown"`.
Historical RSVPs without stored provenance are returned as `"unknown"`. API-created RSVPs
always use `"api"`; clients cannot set or change this field.

### `PATCH /api/v1/events/{eventRouteId}` — scope `events:write`

Updates an event's public details. All fields optional — send only what changes:

```json
{ "name": "Warehouse Party — Extended", "secondaryTitle": null, "description": null,
  "location": "456 New Venue Ave", "eventDate": 1753100000000, "eventEndDate": 1753120000000,
  "eventTimezone": "America/New_York", "maxAttendees": 4, "flyerUrl": "https://..." }
```

- Nullable fields (`secondaryTitle`, `description`, `eventEndDate`, `eventTimezone`,
  `flyerUrl`) accept `null` to clear; omitted fields are untouched.
- Validation: `name`/`location` non-empty, `eventDate`/`eventEndDate` positive ms-epoch
  integers with end after start, `maxAttendees` ≥ 1, `flyerUrl` https-only.
- Lifecycle/publish state, guest lists, theming, and form config are not writable.
- Returns `{ "changed": boolean, "event": { ... } }`. Actual changes emit `event.updated`
  to subscribed webhook endpoints (changed field names in `data.changes.changedFields`);
  no-op requests emit nothing, so consumers mirroring `event.updated` can't echo their own
  writes.

### `POST /api/v1/events/{eventRouteId}/rsvps` — scope `rsvps:write`

```json
{ "phone": "+15551234567", "name": "Jane Doe", "listPassword": "optional",
  "attendees": 2, "attendanceStatus": "yes", "note": "optional",
  "customFieldValues": { "company": "The Market" },
  "socialProfiles": [{ "platformKey": "instagram", "handle": "janedoe" }],
  "invitedByName": "Alex", "smsConsent": true,
  "smsConsentIpAddress": "203.0.113.42" }
```

- Identity precedence: a coucou user with this phone → the RSVP attaches to their
  account; otherwise a guest RSVP keyed by phone hash is created.
- List resolution is deterministic: a valid `listPassword`, then legacy explicit
  `listKey`, then the API client's configured default, then the legacy event fallback.
  Invalid passwords are field-addressable errors and never fall back. A configured
  default missing from an event is a configuration conflict.
- `attendees` is capped by the event's per-RSVP maximum.
- **Idempotent**: 201 on create; re-POST for the same phone+event updates the writable
  fields (`attendanceStatus`, `attendees`, `name`, `note`) and returns 200. A no-change
  re-POST emits no webhook, so mirroring loops can't echo.
- New RSVPs start as `approvalStatus: "pending"` — approval stays in the host dashboard.
- Required custom fields, social profiles, invited-by data, attendee limits, and list
  retries use the same validation and persistence rules as coucou's native RSVP form.
  A denied RSVP may retry only on a different resolved list.
- `smsConsent` is optional and organizer-wide. Explicit `true` or `false` updates both
  the RSVP and the phone's workspace preference; omission preserves existing state.
  For a newly imported RSVP, omission creates no Coucou SMS permission. On an existing
  RSVP, omission does not revoke consent previously collected by Coucou.
  `smsConsentIpAddress` is optional and should be sent only when the caller can reliably
  identify the consenting end user's IP. Confirmation/opt-out SMS is sent only when the
  organizer-wide value changes.
- Consent-only changes remain internal and do not add fields or event types to webhook
  deliveries.

### `PATCH /api/v1/rsvps/{rsvpId}` — scope `rsvps:write`

Body `{ "attendanceStatus": "yes" | "no" | "maybe" }`.

### `DELETE /api/v1/rsvps/{rsvpId}` — scope `rsvps:write`

Soft cancel: sets `attendanceStatus: "no"`. The RSVP row is kept (host visibility and
attendance counts stay consistent). To delete a person's data, use `POST /api/v1/erasures`.

### `POST /api/v1/erasures` — scope `rsvps:write`

Anonymizes the RSVPs this API key sent for one person, and deletes the records Coucou kept
only because of those RSVPs. Call it when a person deletes their account with you or asks you
to delete their data. The RSVP stays, so the host's counts and check-ins do not change, but
nothing on it names or reaches the person. Only your key's share of the person's data goes:
RSVPs the person gave Coucou directly, and RSVPs other partners sent, stay as they are.

```json
{ "phone": "+15551234567", "rsvpIds": ["jh7…", "jh8…"] }
```

- Send `phone`, `rsvpIds`, or both. `phone` (E.164) selects every RSVP this key sent for that
  number. `rsvpIds` (at most 100) selects RSVPs by the ids your POST responses returned, so it
  still works if the person's phone changed. Send both when you hold both.
- Only RSVPs that this API key created are anonymized. An update from another key, through the
  RSVP upsert or `PATCH /api/v1/rsvps/{rsvpId}`, does not move erasure rights to that key.
  RSVPs sent by other keys, and RSVPs the person gave Coucou by text or form, stay. Ids that
  are neither created nor updated by your key are ignored without an error, so the response
  never reveals whether someone else's RSVP exists.
- An RSVP your key created stays if the person later submitted or edited it through Coucou:
  its RSVP form, the signed-in app, or a text to the event's code. That RSVP now also holds
  what the person gave Coucou directly. Coucou keeps it and lists it in `retainedRsvpIds`.
- An id that an identity merge retired (a guest who later signed in) selects the RSVP it was
  merged into. The response lists that RSVP's id. A merged RSVP is anonymized only when this
  key created both RSVPs that were merged and the person submitted neither through Coucou.
  When an RSVP your key created or updated was merged into an RSVP your key cannot erase, the
  response lists the merged RSVP in `retainedRsvpIds`. Merges from before November 2026 did
  not record the keys of the absorbed RSVP, so such a merged RSVP is listed only if your key
  also wrote it.
- RSVPs created before Coucou recorded the creating key (November 2026) have no recorded
  creator. Such an RSVP is anonymized only when all three of these are true:
  1. Its `rsvp.created` notice in Coucou's webhook log has `origin.apiClientId` set to this
     key. The notice exists only if the workspace had an endpoint subscribed to
     `rsvp.created` when the RSVP was created.
  2. Its `source` is not `text` or `form`.
  3. No other RSVP was merged into it.

  Otherwise Coucou keeps it and lists it in `retainedRsvpIds`. RSVPs from before
  2026-09-10 have no `source`, so without the notice Coucou cannot tell a partner-created
  RSVP from a form RSVP that the partner later updated. Ask Coucou to erase a retained
  legacy RSVP.

  `rsvp.created` notices carry `origin.apiClientId` only since the 2026-07-30 release. An
  RSVP your key created between the partner API launch (2026-07-18) and that release has no
  notice that names your key, so Coucou always keeps it.
- Erasure ignores the key's current event grants: a key can erase what it sent to an event it
  can no longer read.
- The request is synchronous and runs in one transaction. It returns 200:

```json
{ "erasure": { "status": "completed", "anonymizedRsvpIds": ["jh7…"], "retainedRsvpIds": [],
  "completedAt": 1753000000000 } }
```

- `retainedRsvpIds` lists RSVPs that this key created or updated but cannot erase: text or
  form RSVPs, RSVPs the person also submitted through Coucou, RSVPs another key created,
  merged RSVPs, and the legacy RSVPs above. Coucou keeps them because they are not only this
  partner's data. A legacy RSVP that another key updated after yours is not listed, because
  Coucou cannot show your key wrote it.
- **Idempotent**: a repeat request, or a phone Coucou has never seen, returns 200 with empty
  lists and changes nothing. An anonymized RSVP no longer matches the phone, and naming its id
  again is a no-op. Retry until you get a 2xx.
- Each anonymized RSVP emits `rsvp.updated` to endpoints subscribed to it and granted its
  event, with every `identity` field `null` (`isGuest` stays), no `ticket`,
  `origin.apiClientId` set to your client, and `data.changes.reason: "erasure"`. Other
  partners mirroring the event should drop the person from that RSVP.
- Nothing attaches the person to an anonymized RSVP again. If your key sends the same phone
  to the same event later, Coucou creates a new RSVP.
- A revoked key's RSVPs cannot be erased by its replacement key. Erase before you revoke a
  key, or ask Coucou to erase them.

What stays on an anonymized RSVP:

| Field | Note |
| --- | --- |
| Event, list, approval status, attendance answer, party size | Unchanged, so attendance counts stay |
| Ticket status | A checked-in (`redeemed`) ticket stays checked in. An `issued` ticket becomes `disabled` |
| `source`, the creating and last-writing API key, `createdAt` | Unchanged. `updatedAt` is the erasure time |
| `isGuest` | Whether a guest or a Coucou account made the RSVP |

What an erasure removes or deletes:

| Record | Removed when |
| --- | --- |
| On the RSVP: name, phone hash and masked phone, the link to the person's account, note, custom field answers, invited-by and referral fields, SMS consent with its time and IP address. Contact sharing is turned off | Always |
| The ticket's redemption code, which went to the person's phone. The ticket keeps its check-in under a new code nobody holds | Always |
| Guest hand-off links (they hold the phone), SMS RSVP sessions, social-handle snapshots, profile values and workspace grants sourced from the RSVP. Approval decisions stay, without the denial reason | Always |
| Stored webhook delivery payloads for the RSVP, including those sent under an id a merge retired (they hold the phone and name and can be re-sent) | Always |
| Queued SMS that carries the phone number | Always |
| Workspace SMS preference, organizer tags and notes, contact-directory entry | The person has no other RSVP in the workspace |
| Guest phone record (plaintext number), guest social handles, guest profile values | No RSVP in any workspace still uses that phone |

What Coucou keeps, and why:

| Record | Why |
| --- | --- |
| RSVPs given to Coucou by text or form, RSVPs the person also submitted through Coucou, and RSVPs other keys sent | They are not only this partner's data |
| A Coucou account (`users` row) matched by phone | The person holds it with Coucou directly |
| SMS opt-out (`STOP`) list entry, keyed by phone hash | Coucou must keep honoring the opt-out |
| Sent-SMS logs: obfuscated phone, phone hash, message body | Coucou is the sender of record and keeps them for carrier and consent disputes, as on account deletion |
| A contact-directory row with past text-blast deliveries, renamed "Erased contact" with no number | Blast delivery history points at it |
| An audit entry with the API client and the anonymized RSVP ids, no name or phone | Proof that the erasure ran |
| The anonymized RSVP and its `rsvp.updated` notice, without identity fields | The host's counts stay right, and the notice tells mirrors to drop the person |

Inside the monorepo, `@coucou/sdk/api-v1` exports `requestCoucouErasure`:

```ts
import { requestCoucouErasure } from "@coucou/sdk/api-v1";

const result = await requestCoucouErasure({
  apiBaseUrl: "https://<deployment>.convex.site/api/v1",
  apiKey: process.env.COUCOU_API_KEY!,
  input: { phone: "+15551234567", rsvpIds: storedCoucouRsvpIds },
});
if (!result.ok) throw new Error(result.error.message);
```

### When a person deletes their Coucou account

A person who deletes their Coucou account removes their data from every partner's share
too. Coucou anonymizes all of the person's RSVPs, whether the person gave them to Coucou
directly or a partner sent them. It matches them by the account and its former guest
identities, and by RSVPs that carry the account's phone. Each RSVP is anonymized as above,
and each emits the same `rsvp.updated` notice with null identity and
`data.changes.reason: "erasure"`, with `origin.type: "app"`, to every endpoint subscribed to
`rsvp.updated` and granted that RSVP's event. Partners mirroring those RSVPs must drop the
person from their copies. The SMS opt-out list and sent-SMS logs stay, as for a partner
erasure.

## Webhooks

Register HTTPS endpoints per workspace on the Developers page, choosing event types and
either selected-event or explicit all-event access. Event grants are checked when a
delivery is queued and immediately before every attempt, so removing a grant blocks
pending retries that contain event contact data.

Integrations that mirror RSVP state must subscribe to both `rsvp.approved` and
`rsvp.denied`; creation/update deliveries are not substitutes for approval decisions.

| Type | Fires when |
| --- | --- |
| `rsvp.created` | An RSVP is submitted (app, guest flow, host, or API) |
| `rsvp.approved` / `rsvp.denied` | A host decides an RSVP |
| `rsvp.attendance_updated` | The yes/no/maybe answer changes |
| `rsvp.updated` | List, party size, name, or guest→account claim changes, or an erasure anonymizes the RSVP (`changes.reason: "erasure"`) |
| `rsvp.deleted` | An RSVP is deleted |
| `event.published` / `event.unpublished` | Event lifecycle transitions |
| `event.updated` | A public-facing event field changes (name, date, location, flyer, …) |
| `event.deleted` | An event is deleted (per-RSVP deletes are not also emitted) |

Each endpoint has two independent 32-byte secrets (base64url): an **encryption secret**
(AES-256-GCM) and a **signing secret** (HMAC-SHA256). Rotation bumps the endpoint's
`keyGeneration` immediately; hold old+new configs during cutover if needed.

### Delivery format

```
POST <your endpoint URL>
Content-Type: application/json
User-Agent: coucou-webhooks/1
X-Coucou-Event-Type: rsvp.approved
X-Coucou-Delivery-Id: <stable idempotency key, reused across retries>
X-Coucou-Key-Generation: 1
X-Coucou-Signature: t=1752700000,v1=<hex HMAC-SHA256(signingSecret, "<t>.<rawBody>")>
```

Body (the envelope — payload is encrypted inside):

```json
{ "apiVersion": "2026-07-29", "encryption": "aes-256-gcm", "keyGeneration": 1,
  "iv": "<base64url, 12 bytes>", "ciphertext": "<base64url, ciphertext || 16-byte GCM tag>" }
```

Decrypted payload (event deliveries retain `event` and `origin` but omit the
RSVP-specific `rsvp`, `identity`, and `ticket` fields):

```json
{ "apiVersion": "2026-07-29", "eventType": "rsvp.approved", "deliveryId": "...",
  "occurredAt": 1752700000000, "workspaceSlug": "club-chlorine",
  "data": {
    "event": { "id": "...", "shortId": "abc123", "name": "...", "eventDate": 1753000000000,
               "eventEndDate": null, "eventTimezone": "America/New_York",
               "location": "...", "flyerUrl": null },
    "rsvp": { "id": "...", "source": "form", "listKey": "ga", "approvalStatus": "approved",
              "attendanceStatus": "yes", "attendees": 2, "createdAt": 0, "updatedAt": 0 },
    "identity": { "phone": "+15551234567", "phoneHash": "<sha256 hex of E.164>",
                  "name": "Jane Doe", "isGuest": false },
    "ticket": { "status": "issued", "qrEnabled": true,
                 "redemptionCode": "abc123", "redeemUrl": "https://…/redeem/abc123" },
    "origin": { "type": "api", "apiClientId": "api_client_id" },
    "changes": { "previousApprovalStatus": "pending", "previousAttendanceStatus": null }
  } }
```

Notes:

- Newly emitted RSVP webhook snapshots always include `source` as `"text"`, `"form"`,
  `"api"`, or `"unknown"`. SDK consumers allow it to be absent when replaying immutable
  payloads emitted before source tracking was introduced.
- `identity.phone` can be `null` for guests who RSVP'd before phone persistence shipped —
  fall back to matching `identity.phoneHash` against `SHA-256(normalized E.164)` of your
  own users' phones.
- After an erasure anonymized an RSVP, `identity.phone`, `identity.phoneHash` and
  `identity.name` are all `null` on its notices from then on. Match such a notice by
  `rsvp.id` and drop the person from your copy.
- `origin.type` is `"api"` when the change was made through the partner API. Compare
  `origin.apiClientId` with the client ID shown during provisioning and skip only your
  own writes; API changes from other clients still need processing.
- `event.flyerUrl` in webhook payloads is the stored URL only; fetch
  `GET /api/v1/events/{id}` for a resolved storage URL.

### Consuming a delivery

1. Read the raw body **before** JSON parsing (the signature covers exact bytes).
2. Verify `X-Coucou-Signature`: recompute `HMAC-SHA256(signingSecret, "<t>.<rawBody>")`,
   compare in constant time, and reject if `|now − t| > 300s` (replay protection).
3. Decrypt: base64url-decode `iv` and `ciphertext`, AES-256-GCM decrypt with the
   encryption secret. WebCrypto's `subtle.decrypt` takes `ciphertext` as-is; with Node's
   `createDecipheriv("aes-256-gcm", ...)`, split the **last 16 bytes** off as the auth tag.
4. Dedupe on `X-Coucou-Delivery-Id` / `payload.deliveryId` — retries reuse the id.
5. Respond 2xx quickly. Non-2xx (or >10s) responses are retried with backoff
   (30s, 2m, 10m, 30m, 2h — 6 attempts total). After sustained failures the endpoint is
   auto-disabled and must be re-enabled on the Developers page.

Inside the monorepo, use the typed helpers:

```ts
import {
  verifyCoucouWebhookSignature,
  decryptCoucouWebhookEnvelope,
} from "@coucou/sdk/api-v1";

const rawBody = await request.text();
const signatureIsValid = await verifyCoucouWebhookSignature({
  rawBody,
  signatureHeader: request.headers.get("X-Coucou-Signature") ?? "",
  signingSecretBase64: process.env.COUCOU_WEBHOOK_SIGNING_SECRET!,
});
if (!signatureIsValid) return new Response("bad signature", { status: 400 });

const payload = await decryptCoucouWebhookEnvelope({
  rawBody,
  encryptionSecretBase64: process.env.COUCOU_WEBHOOK_ENCRYPTION_SECRET!,
});
```

Standalone (Node ≥ 18, no dependency):

```js
const crypto = require("node:crypto");

function verify(rawBody, signatureHeader, signingSecretBase64) {
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=")));
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!parts.t || !parts.v1 || age > 300) return false;
  const expected = crypto
    .createHmac("sha256", Buffer.from(signingSecretBase64, "base64url"))
    .update(`${parts.t}.${rawBody}`)
    .digest("hex");
  return (
    expected.length === parts.v1.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
  );
}

function decrypt(rawBody, encryptionSecretBase64) {
  const envelope = JSON.parse(rawBody);
  const key = Buffer.from(encryptionSecretBase64, "base64url");
  const ciphertextWithTag = Buffer.from(envelope.ciphertext, "base64url");
  const tag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString());
}
```

## Security model & tradeoffs

- Payloads carry plaintext phone numbers **inside** the AES-256-GCM envelope; the raw
  HTTP body never exposes PII. Consumers own secret hygiene and at-rest handling on
  their side. Hash-only matching via `identity.phoneHash` is available if you prefer not
  to store plaintext.
- Webhook secrets are stored readable in the coucou database (encryption requires key
  recovery); Convex platform-side encryption at rest is the mitigation. Envelope
  encryption with a master key is a planned hardening.
- API keys are stored hashed and cannot be recovered — only rotated.
