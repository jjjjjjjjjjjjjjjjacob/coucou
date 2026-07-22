# Coucou Partner API

REST API + encrypted webhooks for integrating third-party apps ("consumers") with coucou:
read event data, mirror RSVPs as they happen, and write RSVPs on behalf of users that exist
in both systems.

- API version: `2026-07-22` (sent as `apiVersion` in webhook payloads; source of truth is
  `@coucou/sdk/api-v1` → `API_VERSION`)
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
- All data access is scoped to the key's workspace. Objects in other workspaces read as
  404 — existence is not leaked.

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

### `GET /api/v1/events/{eventRouteId}/rsvps/lookup?phone=+15551234567` — scope `rsvps:read`

Looks up the RSVP for a phone number at an event (real account match first, then guest
match by phone hash). 404 if none.

```json
{ "rsvpId": "...", "approvalStatus": "approved", "attendanceStatus": "yes",
  "listKey": "ga", "attendees": 2, "name": "Jane Doe", "isGuest": false,
  "createdAt": 0, "updatedAt": 0 }
```

## Write endpoints

Consumers can create RSVPs, change attendance, and update event details. **Approval/denial,
ticket state, and publish state are host-only** and cannot be influenced through the API —
fields like `approvalStatus` or `lifecycle` in a request body are ignored.

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
  "invitedByName": "Alex" }
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

### `PATCH /api/v1/rsvps/{rsvpId}` — scope `rsvps:write`

Body `{ "attendanceStatus": "yes" | "no" | "maybe" }`.

### `DELETE /api/v1/rsvps/{rsvpId}` — scope `rsvps:write`

Soft cancel: sets `attendanceStatus: "no"`. The RSVP row is kept (host visibility and
attendance counts stay consistent); there is no hard delete via the API.

## Webhooks

Register HTTPS endpoints per workspace on the Developers page, choosing event types:

Integrations that mirror RSVP state must subscribe to both `rsvp.approved` and
`rsvp.denied`; creation/update deliveries are not substitutes for approval decisions.

| Type | Fires when |
| --- | --- |
| `rsvp.created` | An RSVP is submitted (app, guest flow, host, or API) |
| `rsvp.approved` / `rsvp.denied` | A host decides an RSVP |
| `rsvp.attendance_updated` | The yes/no/maybe answer changes |
| `rsvp.updated` | List, party size, name, or guest→account claim changes |
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
{ "apiVersion": "2026-07-22", "encryption": "aes-256-gcm", "keyGeneration": 1,
  "iv": "<base64url, 12 bytes>", "ciphertext": "<base64url, ciphertext || 16-byte GCM tag>" }
```

Decrypted payload (RSVP events; `event.*` events omit `rsvp`/`identity`/`origin`):

```json
{ "apiVersion": "2026-07-22", "eventType": "rsvp.approved", "deliveryId": "...",
  "occurredAt": 1752700000000, "workspaceSlug": "club-chlorine",
  "data": {
    "event": { "id": "...", "shortId": "abc123", "name": "...", "eventDate": 1753000000000,
               "eventEndDate": null, "eventTimezone": "America/New_York",
               "location": "...", "flyerUrl": null },
    "rsvp": { "id": "...", "listKey": "ga", "approvalStatus": "approved",
              "attendanceStatus": "yes", "attendees": 2, "createdAt": 0, "updatedAt": 0 },
    "identity": { "phone": "+15551234567", "phoneHash": "<sha256 hex of E.164>",
                  "name": "Jane Doe", "isGuest": false },
    "ticket": { "status": "issued", "qrEnabled": true,
                 "redemptionCode": "abc123", "redeemUrl": "https://…/redeem/abc123" },
    "origin": { "type": "app" },
    "changes": { "previousApprovalStatus": "pending", "previousAttendanceStatus": null }
  } }
```

Notes:

- `identity.phone` can be `null` for guests who RSVP'd before phone persistence shipped —
  fall back to matching `identity.phoneHash` against `SHA-256(normalized E.164)` of your
  own users' phones.
- `origin.type` is `"api"` when the change was made through the partner API. If you
  mirror webhook events into your backend, skip your own writes to avoid loops.
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
