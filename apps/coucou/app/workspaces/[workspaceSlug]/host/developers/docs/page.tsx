"use client";

import { API_VERSION, type CoucouWebhookEventType, WEBHOOK_EVENT_TYPES } from "@coucou/sdk/api-v1";
import { ArrowLeft, Copy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { DashboardTitleBar } from "@/components/dashboard-title-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageCard } from "@/components/ui/page-card";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";
import { buildWorkspaceOperationPath } from "@/lib/workspace-config";

function resolveApiBaseUrl(): string {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return "https://<deployment>.convex.site/api/v1";
  return `${convexUrl.replace(".convex.cloud", ".convex.site")}/api/v1`;
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="group relative rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1.5 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => copyToClipboard(code)}
        aria-label="Copy code"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
        {code}
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-[var(--surface-1)] px-1 py-0.5 font-mono text-xs text-[var(--text-primary)]">
      {children}
    </code>
  );
}

const METHOD_BADGE_CLASSES: Record<string, string> = {
  GET: "border-emerald-500/40 text-emerald-500",
  POST: "border-sky-500/40 text-sky-500",
  PATCH: "border-amber-500/40 text-amber-500",
  DELETE: "border-red-500/40 text-red-500",
};

function EndpointHeading({
  method,
  path,
  scope,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  scope: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline" className={`font-mono text-[10px] ${METHOD_BADGE_CLASSES[method]}`}>
        {method}
      </Badge>
      <code className="font-mono text-sm font-medium text-[var(--text-primary)]">{path}</code>
      <Badge
        variant="outline"
        className="border-[var(--border-subtle)] text-[10px] text-[var(--text-secondary)]"
      >
        scope: {scope}
      </Badge>
    </div>
  );
}

function DocParagraph({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{children}</p>;
}

function DocList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-[var(--text-secondary)]">
      {items.map((item, itemIndex) => (
        <li key={`doc-item-${itemIndex}`}>{item}</li>
      ))}
    </ul>
  );
}

const WEBHOOK_EVENT_TYPE_DESCRIPTIONS: Record<CoucouWebhookEventType, string> = {
  "rsvp.created": "An RSVP is submitted — via a coucou client, the guest flow, a host, or this API",
  "rsvp.updated": "List, party size, name, or guest-to-account claim changes",
  "rsvp.approved": "A host approves an RSVP",
  "rsvp.denied": "A host denies an RSVP",
  "rsvp.attendance_updated": "The guest's yes / no / maybe answer changes",
  "rsvp.deleted": "An RSVP is deleted",
  "event.published": "An event goes live (or is created already published)",
  "event.unpublished": "An event is taken back to draft",
  "event.updated": "A public-facing event field changes (name, date, location, flyer, …)",
  "event.deleted": "An event is deleted (per-RSVP deletes are not also emitted)",
};

const EXAMPLE_EVENT_RESPONSE = `{
  "data": [
    {
      "id": "jd7f…", "shortId": "abc123", "name": "Warehouse Party",
      "secondaryTitle": null, "description": "Late night.",
      "location": "123 Main St", "eventDate": 1753000000000,
      "eventEndDate": null, "eventTimezone": "America/New_York",
      "flyerUrl": "https://…", "status": "active", "lifecycle": "published",
      "publishedAt": 1752000000000, "isFeatured": false,
      "maxAttendeesPerRsvp": 2, "workspaceSlug": "club-chlorine",
      "createdAt": 1751000000000, "updatedAt": 1752000000000
    }
  ],
  "nextCursor": null
}`;

const EXAMPLE_EVENT_DETAIL_EXTRA = `{
  "lists": [
    { "listKey": "vip", "isPasswordProtected": true },
    { "listKey": "ga", "isPasswordProtected": false }
  ],
  "attendanceCounts": { "approved": 12, "pending": 3, "denied": 1, "total": 16 }
}`;

const EXAMPLE_RSVP_LOOKUP_RESPONSE = `{
  "rsvpId": "k97d…", "approvalStatus": "approved", "attendanceStatus": "yes",
  "listKey": "ga", "attendees": 2, "name": "Jane Doe", "isGuest": false,
  "createdAt": 1752500000000, "updatedAt": 1752600000000
}`;

const EXAMPLE_RSVP_LIST_RESPONSE = `{
  "data": [
    {
      "rsvpId": "k97d…", "approvalStatus": "approved", "attendanceStatus": "yes",
      "listKey": "ga", "attendees": 2, "name": "Jane Doe", "isGuest": false,
      "phone": "+15551234567", "phoneHash": "<sha256 hex of E.164>",
      "createdAt": 1752500000000, "updatedAt": 1752600000000,
      "ticket": null
    }
  ],
  "nextCursor": null
}`;

const EXAMPLE_SMS_CONSENT_RESPONSE = `{
  "smsConsent": false,
  "smsConsentTimestamp": null,
  "smsProgram": {
    "organizerName": "Example Events",
    "consentLabel": "I agree to receive recurring SMS messages from Example Events.",
    "disclosure": "Example Events may send RSVP, guest-list, ticket, and event updates…",
    "termsUrl": "https://events.example.com/terms",
    "privacyUrl": "https://events.example.com/privacy"
  }
}`;

const EXAMPLE_CREATE_RSVP_REQUEST = `POST /api/v1/events/abc123/rsvps
Authorization: Bearer coucou_sk_…
Content-Type: application/json

{
  "phone": "+15551234567",
  "name": "Jane Doe",
  "listKey": "ga",
  "attendees": 2,
  "attendanceStatus": "yes",
  "note": "optional",
  "smsConsent": true,
  "smsConsentIpAddress": "203.0.113.42"
}`;

const EXAMPLE_UPDATE_EVENT_REQUEST = `PATCH /api/v1/events/abc123
Authorization: Bearer coucou_sk_…
Content-Type: application/json

{
  "name": "Warehouse Party — Extended",
  "location": "456 New Venue Ave",
  "eventDate": 1753100000000,
  "eventEndDate": 1753120000000,
  "description": null,
  "maxAttendees": 4
}`;

const EXAMPLE_WEBHOOK_HEADERS = `POST <your endpoint URL>
Content-Type: application/json
User-Agent: coucou-webhooks/1
X-Coucou-Event-Type: rsvp.approved
X-Coucou-Delivery-Id: <stable idempotency key, reused across retries>
X-Coucou-Key-Generation: 1
X-Coucou-Signature: t=1752700000,v1=<hex HMAC-SHA256(signingSecret, "<t>.<rawBody>")>`;

const EXAMPLE_WEBHOOK_ENVELOPE = `{
  "apiVersion": "${API_VERSION}",
  "encryption": "aes-256-gcm",
  "keyGeneration": 1,
  "iv": "<base64url, 12 bytes>",
  "ciphertext": "<base64url, ciphertext || 16-byte GCM tag>"
}`;

const EXAMPLE_WEBHOOK_PAYLOAD = `{
  "apiVersion": "${API_VERSION}",
  "eventType": "rsvp.approved",
  "deliveryId": "…",
  "occurredAt": 1752700000000,
  "workspaceSlug": "club-chlorine",
  "data": {
    "event": { "id": "…", "shortId": "abc123", "name": "…",
               "eventDate": 1753000000000, "eventEndDate": null,
               "eventTimezone": "America/New_York", "location": "…", "flyerUrl": null },
    "rsvp": { "id": "…", "listKey": "ga", "approvalStatus": "approved",
              "attendanceStatus": "yes", "attendees": 2,
              "createdAt": 1752500000000, "updatedAt": 1752700000000 },
    "identity": { "phone": "+15551234567",
                  "phoneHash": "<sha256 hex of E.164>",
                  "name": "Jane Doe", "isGuest": false },
    "origin": { "type": "api", "apiClientId": "api_client_id" },
    "changes": { "previousApprovalStatus": "pending",
                 "previousAttendanceStatus": null }
  }
}`;

const EXAMPLE_SDK_CONSUMER = `import {
  verifyCoucouWebhookSignature,
  decryptCoucouWebhookEnvelope,
} from "@coucou/sdk/api-v1";

const rawBody = await request.text(); // raw bytes, BEFORE JSON parsing

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
// dedupe on payload.deliveryId, then process`;

const EXAMPLE_NODE_CONSUMER = `const crypto = require("node:crypto");

function verify(rawBody, signatureHeader, signingSecretBase64) {
  const parts = Object.fromEntries(signatureHeader.split(",").map((p) => p.split("=")));
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!parts.t || !parts.v1 || age > 300) return false;
  const expected = crypto
    .createHmac("sha256", Buffer.from(signingSecretBase64, "base64url"))
    .update(\`\${parts.t}.\${rawBody}\`)
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
    "aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"),
  );
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString(),
  );
}`;

const EXAMPLE_ERROR_RESPONSE = `{
  "error": { "code": "invalid_request", "message": "listKey is required" }
}`;

function PartnerApiDocumentation({
  brandName,
  backHref,
}: {
  brandName: string;
  backHref?: string;
}) {
  const apiBaseUrl = resolveApiBaseUrl();

  return (
    <div className="space-y-4">
      <DashboardTitleBar
        title="Partner API documentation"
        subtitle={`Integrate ${brandName} events, RSVPs, and webhooks into your own app. API version ${API_VERSION}.`}
        breadcrumb={[{ label: "Developers" }, { label: "Partner API" }]}
        action={
          backHref ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={backHref}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back to Developers
              </Link>
            </Button>
          ) : undefined
        }
      />

      <PageCard
        title="Getting started"
        description="Server-to-server REST API, authenticated with workspace API keys."
      >
        <div className="space-y-3">
          <DocParagraph>
            All requests go to your workspace&apos;s API base URL and carry an API key created on
            the Developers page:
          </DocParagraph>
          <CodeBlock code={`${apiBaseUrl}\n\nAuthorization: Bearer coucou_sk_…`} />
          <DocList
            items={[
              <>
                Keys are shown <strong>once</strong> at creation and stored hashed. Keep them in
                your backend&apos;s secret manager — never in a browser. The API sends no CORS
                headers, deliberately.
              </>,
              <>
                Keys carry scopes: <InlineCode>events:read</InlineCode>,{" "}
                <InlineCode>events:write</InlineCode>, <InlineCode>rsvps:read</InlineCode>,{" "}
                <InlineCode>rsvps:write</InlineCode>. Requests missing the needed scope get a 403.
              </>,
              <>
                Every key is also granted either selected events or all current and future events.
                Objects outside the key&apos;s workspace or event grants read as 404 — existence is
                never leaked.
              </>,
              <>
                Users are matched across systems by <strong>phone number</strong> (normalized
                E.164). No coucou account is required for RSVPs created via the API.
              </>,
            ]}
          />
        </div>
      </PageCard>

      <PageCard
        title="Configuration guides"
        description="Choose the data and SMS ownership model before provisioning credentials."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Coucou-managed RSVP and SMS
            </h3>
            <DocList
              items={[
                <>
                  A hosted page such as Danza Organica needs no API key; assign its event to a
                  webhook endpoint for downstream RSVP and event updates.
                </>,
                <>
                  A delegated form such as The Market uses <InlineCode>events:read</InlineCode>,{" "}
                  <InlineCode>rsvps:read</InlineCode>, and <InlineCode>rsvps:write</InlineCode> for
                  its assigned event.
                </>,
                <>
                  Fetch the SMS program, render its separate unchecked consent control, and send{" "}
                  <InlineCode>smsConsent</InlineCode> plus the end user&apos;s IP only after an
                  explicit choice.
                </>,
                <>
                  Mirror host approval and denial decisions from the webhook endpoint assigned to
                  the same event.
                </>,
              ]}
            />
          </div>
          <div className="space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Partner-managed RSVP and SMS
            </h3>
            <DocList
              items={[
                <>
                  Grant <InlineCode>rsvps:write</InlineCode> and only the Coucou event receiving the
                  mirrored list.
                </>,
                <>
                  POST each RSVP idempotently by phone and store the returned Coucou{" "}
                  <InlineCode>rsvpId</InlineCode>.
                </>,
                <>
                  Omit both <InlineCode>smsConsent</InlineCode> and{" "}
                  <InlineCode>smsConsentIpAddress</InlineCode>. Do not send false: false is an
                  explicit Coucou opt-out and can send a status message.
                </>,
                <>
                  Replay the current roster through the idempotent POST, reconcile with the
                  paginated RSVP endpoint, then consume approval and status webhooks.
                </>,
                <>
                  Compare <InlineCode>origin.apiClientId</InlineCode> with the provisioned client ID
                  and ignore only that client&apos;s own writes.
                </>,
              ]}
            />
          </div>
          <div className="space-y-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Coucou list shared outward
            </h3>
            <DocList
              items={[
                <>
                  Use the paginated RSVP endpoint once for existing contacts, then consume webhooks
                  for changes.
                </>,
                <>
                  Assign the same event to the read key and endpoint; subscribe to every RSVP
                  lifecycle event needed by the destination.
                </>,
                <>
                  For Partiful, Posh, Luma, or similar tools, your server-side adapter remains
                  responsible for their API and consent requirements.
                </>,
              ]}
            />
          </div>
        </div>
      </PageCard>

      <PageCard title="Read endpoints">
        <div className="space-y-5">
          <div className="space-y-2">
            <EndpointHeading method="GET" path="/events" scope="events:read" />
            <DocParagraph>
              Lists this workspace&apos;s events. Query params: <InlineCode>status</InlineCode> (
              <InlineCode>published</InlineCode> default | <InlineCode>all</InlineCode>),{" "}
              <InlineCode>limit</InlineCode> (1–100, default 25), and{" "}
              <InlineCode>cursor</InlineCode> (pass back <InlineCode>nextCursor</InlineCode> from
              the previous page).
            </DocParagraph>
            <CodeBlock code={EXAMPLE_EVENT_RESPONSE} />
          </div>

          <div className="space-y-2">
            <EndpointHeading method="GET" path="/events/{eventRouteId}" scope="events:read" />
            <DocParagraph>
              <InlineCode>eventRouteId</InlineCode> is the event&apos;s{" "}
              <InlineCode>shortId</InlineCode> (preferred) or document id. Returns the same shape as
              the list plus guest lists and approval-status counts:
            </DocParagraph>
            <CodeBlock code={EXAMPLE_EVENT_DETAIL_EXTRA} />
          </div>

          <div className="space-y-2">
            <EndpointHeading method="GET" path="/events/{eventRouteId}/rsvps" scope="rsvps:read" />
            <DocParagraph>
              Enumerates the event&apos;s existing RSVP/contact list for initial backfill and
              reconciliation. Query params: <InlineCode>limit</InlineCode> (1–100, default 25) and{" "}
              <InlineCode>cursor</InlineCode>. Phone numbers are normalized E.164 when available;
              phone hashes remain available for matching legacy contacts.
            </DocParagraph>
            <CodeBlock code={EXAMPLE_RSVP_LIST_RESPONSE} />
          </div>

          <div className="space-y-2">
            <EndpointHeading
              method="GET"
              path="/events/{eventRouteId}/rsvps/lookup?phone=+15551234567"
              scope="rsvps:read"
            />
            <DocParagraph>
              Finds the RSVP for a phone number at an event — a real coucou account match first,
              then a guest match by phone hash. 404 if none exists.
            </DocParagraph>
            <CodeBlock code={EXAMPLE_RSVP_LOOKUP_RESPONSE} />
          </div>

          <div className="space-y-2">
            <EndpointHeading
              method="GET"
              path="/events/{eventRouteId}/rsvps/sms-consent?phone=+15551234567"
              scope="rsvps:read"
            />
            <DocParagraph>
              Returns the organizer-wide Coucou SMS preference and the exact branded program copy.
              Omit <InlineCode>phone</InlineCode> to retrieve only the disclosure program.
            </DocParagraph>
            <CodeBlock code={EXAMPLE_SMS_CONSENT_RESPONSE} />
          </div>
        </div>
      </PageCard>

      <PageCard
        title="Write endpoints"
        description="Create RSVPs, change attendance, and update event details. Approval, denial, ticket state, and publish state are host-only and cannot be set through the API — those fields are ignored if sent."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <EndpointHeading method="PATCH" path="/events/{eventRouteId}" scope="events:write" />
            <DocParagraph>
              Updates an event&apos;s public details. All fields are optional — send only what
              changes; unchanged values are no-ops (and emit no webhook). Nullable fields (
              <InlineCode>secondaryTitle</InlineCode>, <InlineCode>description</InlineCode>,{" "}
              <InlineCode>eventEndDate</InlineCode>, <InlineCode>eventTimezone</InlineCode>,{" "}
              <InlineCode>flyerUrl</InlineCode>) accept <InlineCode>null</InlineCode> to clear.
            </DocParagraph>
            <CodeBlock code={EXAMPLE_UPDATE_EVENT_REQUEST} />
            <DocList
              items={[
                <>
                  Writable fields: <InlineCode>name</InlineCode>,{" "}
                  <InlineCode>secondaryTitle</InlineCode>, <InlineCode>description</InlineCode>,{" "}
                  <InlineCode>location</InlineCode>, <InlineCode>eventDate</InlineCode>,{" "}
                  <InlineCode>eventEndDate</InlineCode>, <InlineCode>eventTimezone</InlineCode>,{" "}
                  <InlineCode>maxAttendees</InlineCode>, <InlineCode>flyerUrl</InlineCode> (https://
                  only).
                </>,
                <>
                  Lifecycle, publish state, guest lists, theming, and form config stay host-only —
                  publish/unpublish from this dashboard.
                </>,
                <>
                  Successful changes emit <InlineCode>event.updated</InlineCode> to subscribed
                  webhook endpoints, with the changed field names in{" "}
                  <InlineCode>data.changes</InlineCode>.
                </>,
                <>
                  Returns <InlineCode>{'{ "changed": boolean, "event": { … } }'}</InlineCode> with
                  the full updated event.
                </>,
              ]}
            />
          </div>

          <div className="space-y-2">
            <EndpointHeading
              method="POST"
              path="/events/{eventRouteId}/rsvps"
              scope="rsvps:write"
            />
            <CodeBlock code={EXAMPLE_CREATE_RSVP_REQUEST} />
            <DocList
              items={[
                <>
                  <strong>Identity precedence:</strong> if a coucou user exists with this phone, the
                  RSVP attaches to their account (<InlineCode>isGuest: false</InlineCode>);
                  otherwise a guest RSVP keyed by phone hash is created — no signup needed.
                </>,
                <>
                  <strong>Idempotent:</strong> 201 on create; re-POSTing the same phone + event
                  updates the writable fields (<InlineCode>attendanceStatus</InlineCode>,{" "}
                  <InlineCode>attendees</InlineCode>, <InlineCode>name</InlineCode>,{" "}
                  <InlineCode>note</InlineCode>) and returns 200. A no-change re-POST emits no
                  webhook, so mirroring loops can&apos;t echo.
                </>,
                <>
                  List resolution is deterministic: a valid <InlineCode>listPassword</InlineCode>,
                  then an explicit <InlineCode>listKey</InlineCode>, then the key&apos;s configured
                  default, then the event fallback. Invalid passwords never fall back.
                </>,
                <>
                  New RSVPs start as <InlineCode>approvalStatus: "pending"</InlineCode> unless the
                  selected list still has automatic approvals available. Automatic approvals return
                  the issued ticket in the same response.
                </>,
                <>
                  <InlineCode>smsConsent: true</InlineCode> enrolls in Coucou SMS; false revokes
                  Coucou consent and may send an opt-out confirmation. Omission leaves prior consent
                  unchanged and creates no Coucou SMS permission on a new imported RSVP.
                </>,
                <>
                  <InlineCode>smsConsentIpAddress</InlineCode> should accompany true only when your
                  server can reliably forward the consenting end user&apos;s IP address.
                </>,
              ]}
            />
          </div>

          <div className="space-y-2">
            <EndpointHeading method="PATCH" path="/rsvps/{rsvpId}" scope="rsvps:write" />
            <DocParagraph>
              Body: <InlineCode>{'{ "attendanceStatus": "yes" | "no" | "maybe" }'}</InlineCode>.
            </DocParagraph>
          </div>

          <div className="space-y-2">
            <EndpointHeading method="DELETE" path="/rsvps/{rsvpId}" scope="rsvps:write" />
            <DocParagraph>
              Soft cancel — sets <InlineCode>attendanceStatus: "no"</InlineCode>. The RSVP row is
              kept so hosts retain visibility and counts stay consistent; there is no hard delete
              via the API.
            </DocParagraph>
          </div>
        </div>
      </PageCard>

      <PageCard
        title="Webhooks"
        description="Encrypted, signed notifications delivered to your HTTPS endpoints when RSVPs or events change. Register endpoints and manage secrets on the Developers page."
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Event types</h3>
            <div className="overflow-x-auto rounded-md border border-[var(--border-subtle)]">
              <table className="w-full text-sm">
                <tbody>
                  {WEBHOOK_EVENT_TYPES.map((eventType) => (
                    <tr
                      key={eventType}
                      className="border-b border-[var(--border-subtle)] last:border-b-0"
                    >
                      <td className="whitespace-nowrap px-3 py-1.5 align-top">
                        <InlineCode>{eventType}</InlineCode>
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">
                        {WEBHOOK_EVENT_TYPE_DESCRIPTIONS[eventType]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Delivery format</h3>
            <DocParagraph>
              Each endpoint has two independent 32-byte secrets (base64url): an{" "}
              <strong>encryption secret</strong> (AES-256-GCM) and a <strong>signing secret</strong>{" "}
              (HMAC-SHA256). Every delivery:
            </DocParagraph>
            <CodeBlock code={EXAMPLE_WEBHOOK_HEADERS} />
            <DocParagraph>
              The request body is a plaintext envelope; your payload is encrypted inside it:
            </DocParagraph>
            <CodeBlock code={EXAMPLE_WEBHOOK_ENVELOPE} />
            <DocParagraph>
              Decrypted payload. Event deliveries retain event and origin, but omit the
              RSVP-specific rsvp, identity, and ticket fields:
            </DocParagraph>
            <CodeBlock code={EXAMPLE_WEBHOOK_PAYLOAD} />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">Consuming a delivery</h3>
            <DocList
              items={[
                <>
                  Read the <strong>raw body</strong> before JSON parsing — the signature covers
                  exact bytes.
                </>,
                <>
                  Verify <InlineCode>X-Coucou-Signature</InlineCode>: recompute{" "}
                  <InlineCode>{'HMAC-SHA256(signingSecret, "<t>.<rawBody>")'}</InlineCode>, compare
                  in constant time, and reject if the timestamp is older than 300s (replay
                  protection).
                </>,
                <>
                  Decrypt with AES-256-GCM. WebCrypto&apos;s <InlineCode>subtle.decrypt</InlineCode>{" "}
                  takes the ciphertext as-is; with Node&apos;s{" "}
                  <InlineCode>createDecipheriv</InlineCode>, split the last 16 bytes off as the auth
                  tag.
                </>,
                <>
                  Dedupe on <InlineCode>deliveryId</InlineCode> — retries reuse the same id.
                </>,
                <>
                  Respond 2xx within 10 seconds. Failures are retried with backoff (30s, 2m, 10m,
                  30m, 2h — 6 attempts total). After sustained failures the endpoint is
                  auto-disabled; re-enable it on the Developers page.
                </>,
              ]}
            />
            <DocParagraph>Inside this monorepo, use the typed helpers:</DocParagraph>
            <CodeBlock code={EXAMPLE_SDK_CONSUMER} />
            <DocParagraph>Standalone (Node ≥ 18, no dependencies):</DocParagraph>
            <CodeBlock code={EXAMPLE_NODE_CONSUMER} />
            <DocParagraph>
              Rotating secrets switches deliveries to the new secrets immediately and bumps{" "}
              <InlineCode>keyGeneration</InlineCode> — hold old + new configs during cutover if your
              consumer can only store one.
            </DocParagraph>
          </div>
        </div>
      </PageCard>

      <PageCard
        title="Identity matching"
        description="How users are correlated between coucou and your app."
      >
        <DocList
          items={[
            <>
              Matching is by <strong>phone number</strong>, normalized to E.164 (e.g.{" "}
              <InlineCode>+15551234567</InlineCode>). Webhook payloads include both{" "}
              <InlineCode>identity.phone</InlineCode> and{" "}
              <InlineCode>identity.phoneHash</InlineCode> (SHA-256 hex of the E.164 string) so you
              can match either way.
            </>,
            <>
              <InlineCode>identity.phone</InlineCode> can be <InlineCode>null</InlineCode> for
              guests who RSVP&apos;d before phone persistence shipped — fall back to comparing{" "}
              <InlineCode>phoneHash</InlineCode> against hashes of your own users&apos; numbers.
            </>,
            <>
              If a guest later signs up in coucou with the same phone, their RSVPs merge into the
              real account automatically and you receive <InlineCode>rsvp.updated</InlineCode> with{" "}
              <InlineCode>isGuest</InlineCode> flipping to <InlineCode>false</InlineCode>.
            </>,
            <>
              <InlineCode>origin.type</InlineCode> is <InlineCode>"api"</InlineCode> when the change
              came through the partner API. Compare <InlineCode>origin.apiClientId</InlineCode> with
              your provisioned client ID and skip only your own writes; changes from other API
              clients still need processing.
            </>,
          ]}
        />
      </PageCard>

      <PageCard title="Errors & limits">
        <div className="space-y-3">
          <DocParagraph>Every error is JSON with a stable code:</DocParagraph>
          <CodeBlock code={EXAMPLE_ERROR_RESPONSE} />
          <DocParagraph>
            Codes: <InlineCode>unauthorized</InlineCode> (401), <InlineCode>forbidden</InlineCode>{" "}
            (403 — key lacks the scope), <InlineCode>not_found</InlineCode> (404),{" "}
            <InlineCode>invalid_request</InlineCode> (400), <InlineCode>conflict</InlineCode> (409),{" "}
            <InlineCode>method_not_allowed</InlineCode> (405),{" "}
            <InlineCode>internal_error</InlineCode> (500).
          </DocParagraph>
          <DocParagraph>
            Rate limiting is not enforced yet — be a good citizen; limits may be added in a future
            API version.
          </DocParagraph>
        </div>
      </PageCard>
    </div>
  );
}

export default function DevelopersDocsPage() {
  const workspaceScope = useWorkspaceScope();
  const pathname = usePathname();
  const isPublicDocumentationRoute = pathname === "/docs/partner-api";

  if (!workspaceScope && !isPublicDocumentationRoute) {
    return <p className="text-sm text-[var(--text-secondary)]">Loading workspace…</p>;
  }

  const developersPagePath = workspaceScope
    ? buildWorkspaceOperationPath(workspaceScope.workspaceSlug, "host", "developers")
    : undefined;

  return (
    <PartnerApiDocumentation
      brandName={workspaceScope?.brandName ?? "Coucou"}
      backHref={developersPagePath}
    />
  );
}
