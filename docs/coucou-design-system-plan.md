# Coucou Design System & Branded Tenant Surfaces — Implementation Plan

Last updated: 2026-04-25
Implementation status: **PR1–PR5 landed in-tree (uncommitted)** — see § 13 below.

Companion docs:

- [Coucou Product Source Of Truth](./coucou-product-source-of-truth.md)
- [Coucou Migration And Refactor Plan](./coucou-migration-refactor-plan.md)
- [Coucou New Feature Buildout Plan](./coucou-new-feature-buildout-plan.md)

Source design bundle: `Coucou.html` handoff from Claude Design (claude.ai/design). Files of record: `tenant.jsx` (tenant guest surfaces), `auth.jsx` (branded sign-in), `system.jsx` (design tokens reference).

---

## 1. Summary

The Coucou design handoff defines a **shared visual system** that applies across every tenant site (dojo-pomodoro, club-chlorine, future tenants) and the platform admin (coucou). The system is organized around **three named presets** — `maison`, `dojo`, `atrium` — each with its own typography, button shape, masthead voice, and color defaults. A tenant adopts one preset; per-event color overrides (the existing `themeBackgroundColor` / `themeTextColor`) layer on top.

This plan covers two tightly coupled workstreams:

1. **Tenant guest surfaces** — landing → password gate → RSVP → status → ticket+QR — built once in shared UI, configured per tenant by preset.
2. **Per-tenant branded sign-in** — Clerk-backed phone/email/OTP flow that takes on each tenant's brand identity (mark, name, voice) so guests never see Coucou's chrome.

The branded sign-in is modeled after the structural pattern in `../the-market/apps/web/src/components/phone-auth/` (single phone-auth flow, configurable heading, `input-otp` for the 6-digit grid) but extended with preset-aware visual chrome from `auth.jsx`.

Out of scope for this plan (separate efforts): Coucou superadmin (`admin.jsx`), the 8-step organizer onboarding (`onboarding.jsx`), the organizer CMS for password management (`PasswordsAdmin` in `tenant.jsx`).

---

## 2. Goals & non-goals

### Goals

- Define `maison` / `dojo` / `atrium` as first-class presets in the shared SDK.
- Promote per-event theming logic to `@coucou/sdk` so all apps share one source of truth.
- Ship a shared `tenant-template` package of guest-flow components that any tenant app can drop in.
- Convert the dojo password modal to a dedicated `/events/[id]/rsvp` full-page gate.
- Add a `preset` field to the `workspaces` schema with a `siteConfiguration` fallback chain.
- Deliver a per-tenant branded sign-in that wraps Clerk and matches each tenant's preset.
- Keep all existing Convex queries/mutations unchanged — the redesign is presentation only.

### Non-goals (this plan)

- New backend features beyond the `workspaces.preset` field and a `setPreset` mutation.
- The Coucou superadmin portal, organizer onboarding, or CMS UIs.
- Maison Obscure as a deployed tenant (no app exists yet — preset is built but unused until a tenant claims it).
- New animations beyond what already works in the existing app and the `the-market` reference.

---

## 3. Inventory — what already exists

### Backend & data

- `packages/backend/convex/schema.ts` — `workspaces`, `workspaceSites`, `events` (already has `themeBackgroundColor`, `themeTextColor`, `customFields`).
- Convex queries/mutations to reuse unchanged: `events.get`, `rsvps.statusForUserEvent`, `rsvps.submitRequest`, `credentialsNode.resolveListByPassword`, `redemptions.forCurrentUserEvent`, `files.getUrl`.

### Shared packages

- `packages/sdk/` — `siteConfigurations` map keyed by app slug (`dojo` | `coucou` | `club-chlorine`); QR color helpers in `shared/qr-code-colors.ts`.
- `packages/ui/` — already contains `auth/auth-shell.tsx`, `auth/phone-auth-page.tsx`, `auth/phone-auth-flow.tsx`, `auth/email-auth-page.tsx`, `auth/email-auth-flow.tsx`, `auth/verification-code-input.tsx`, `auth/use-phone-auth-flow.ts`, `auth/use-email-auth-flow.ts`, `auth/types.ts`, `auth/phone-number-input.tsx`. The shell already reads `siteAuthConfiguration` (heading, description, accentMark, brandName, allowedMethods) — but renders a single generic visual style, not preset-specific.

### Per-tenant apps

- `apps/dojo/`, `apps/coucou/`, `apps/club-chlorine/` each have:
  - `app/events/[eventId]/page.tsx` + `page-client.tsx` (landing with password modal)
  - `app/events/[eventId]/rsvp/page.tsx` (RSVP form, currently behind password modal)
  - `app/events/[eventId]/status/page.tsx`
  - `app/events/[eventId]/ticket/ticket-client.tsx`
  - `app/events/[eventId]/denied/page.tsx`
  - `lib/site.ts` declaring the `siteConfiguration`
  - `lib/event-theme.ts` with `buildEventThemeStyle()` (duplicated across all three apps — needs lifting)
  - `components/event-theme-provider.tsx` (also duplicated)
  - `components/ui/` shadcn primitive set (Button, Input, Dialog, Form, etc.)

### Reference for branded sign-in

- `../the-market/apps/web/src/components/phone-auth/` — uses `@clerk/clerk-react`, `input-otp@^1.4.2` for the 6-digit grid, single-tenant pattern with a configurable `heading` prop. We adapt this pattern to be preset-aware.

---

## 4. Architecture

### 4.1 Preset model

```ts
// packages/sdk/src/theming/presets.ts
export type PresetKey = "maison" | "dojo" | "atrium";

export interface PresetDefinition {
  key: PresetKey;
  name: string;              // "Dojo Pomodoro" — for default brand name; tenant can override
  tagline: string;           // "06.06 · brooklyn"
  bg: string;                // "#FFFFFF"
  bg2: string;               // "#F8F6F1"
  fg: string;                // "#EF4444"
  fgDim: string;
  fgMute: string;
  rule: string;
  ruleStrong: string;
  accent: string;
  display: string;           // CSS font-family stack for headlines
  text: string;              // CSS font-family stack for body
  titleSize: number;         // base h1 size
  upper: boolean;            // whether to UPPERCASE display text
  ctaShape: "rounded" | "ghost-link" | "ghost-bordered";
  brandMarkStyle: "filled-circle" | "square-serif" | "thin-ring";
  qrFg: string;
  qrBg: string;
  buttonRadius: number;      // 8 for dojo, 0 for maison/atrium
  authCopy: {
    heading: string;         // "Sign in to RSVP."
    sub: string;             // "We'll text a code..."
    eyebrow: string;         // "Members & guests"
  };
}

export const PRESET_DEFINITIONS: Record<PresetKey, PresetDefinition>;
```

Preset values port verbatim from `coucou/project/tenant.jsx:17-99` and `coucou/project/auth.jsx:191-207`.

### 4.2 Resolution order

When a tenant page renders, the active preset is resolved by (first hit wins):

1. `event.preset` — *future*, not added in this plan.
2. `workspace.preset` — per-tenant default, **new schema field**.
3. `siteConfiguration.preset` — hardcoded fallback in `packages/sdk/src/site-config.ts` (always set; never undefined).
4. `"dojo"` — defensive last resort, never reached if (3) is set.

Per-event color overrides (`themeBackgroundColor`, `themeTextColor`) merge over the resolved preset's `bg` / `fg` / `qrFg` / `qrBg` / derived rules. Typography, button shape, and layout knobs come from the preset and do **not** change per event.

### 4.3 Package layout

```
packages/sdk/src/theming/
  ├── presets.ts                  # NEW — PRESET_DEFINITIONS map
  ├── build-event-theme.ts        # MOVED from each apps/{tenant}/lib/event-theme.ts
  ├── resolve-preset.ts           # NEW — merge preset + per-event overrides → final tokens
  └── qr-code-colors.ts           # already exists; reused

packages/ui/src/tenant-template/
  ├── provider.tsx                # NEW — emits CSS vars from resolved preset onto a wrapper
  ├── use-preset.ts               # NEW — client hook reading from provider
  ├── use-mobile.ts               # NEW — viewport hook (390px breakpoint)
  ├── components/
  │   ├── tenant-shell.tsx        # masthead bar + footer chrome
  │   ├── tenant-landing.tsx      # featured event hero + meta + recent events list
  │   ├── rsvp-gate.tsx           # full-page password input (replaces dialog)
  │   ├── rsvp-accepted.tsx       # tier reveal + name/phone/+1/note form
  │   ├── rsvp-pending.tsx        # awaiting-review status
  │   ├── rsvp-denied.tsx         # restyled denial page
  │   ├── ticket.tsx              # QR + tier + door details
  │   ├── primitives/
  │   │   ├── eyebrow.tsx
  │   │   ├── meta-row.tsx        # the "WHEN | Saturday 06.06.26" hairline rows
  │   │   ├── field.tsx           # form field with eyebrow label + hairline underline
  │   │   ├── button.tsx          # CTA — switches between rounded/ghost-link/ghost-bordered
  │   │   └── qr-frame.tsx        # wraps react-qr-code with preset bg/fg + contrast badge
  │   └── index.ts
  └── index.ts                    # re-exports

packages/ui/src/auth/                # extend, do not replace
  ├── auth-shell.tsx               # MODIFIED — add preset prop, switch chrome by preset
  ├── brand-mark.tsx               # NEW — the per-preset mark from auth.jsx:115-186
  ├── auth-shell-bar.tsx           # NEW — masthead reused from tenant-shell
  ├── otp-grid.tsx                 # NEW — 6-digit grid; uses input-otp like the-market
  ├── phone-auth-page.tsx          # MODIFIED — pipe preset through; render BrandMark
  ├── email-auth-page.tsx          # MODIFIED — same
  ├── verification-code-input.tsx  # KEEP — but rebuild internals on input-otp; preserve API
  └── index.ts
```

### 4.4 Component contracts

Each guest-surface component takes a `preset?: PresetKey` (resolved in the page if omitted) plus the data it needs:

```tsx
<TenantLanding event={event} preset={preset} />
<RsvpGate event={event} preset={preset} state="idle" | "wrong" onSubmit={...} />
<RsvpAccepted event={event} listKey={listKey} preset={preset} onSubmit={...} />
<RsvpPending event={event} rsvp={rsvp} preset={preset} />
<RsvpDenied event={event} preset={preset} />
<Ticket event={event} redemption={redemption} preset={preset} />
```

Internally, each renders inside `<TenantShell>` which renders the masthead bar + footer chrome and applies preset CSS vars to a wrapper div. The shell also handles per-event color overrides via inline style on the wrapper.

### 4.5 Mobile

Each component reads `useMobile()` (a `useMediaQuery("(max-width: 720px)")` hook) and switches to mobile layout: stacked CTAs, single-column meta rows, 24px gutters, smaller titles. Both desktop and mobile layouts live in the same component; no separate `LandingMobile` component.

---

## 5. Schema change

```ts
// packages/backend/convex/schema.ts
workspaces: defineTable({
  slug: v.string(),
  name: v.string(),
  kind: v.string(),
  primaryDomain: v.optional(v.string()),
  // NEW
  preset: v.optional(
    v.union(
      v.literal("maison"),
      v.literal("dojo"),
      v.literal("atrium"),
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
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

### Migration

No data migration needed — existing rows get `undefined` and resolve via `siteConfiguration.preset` fallback. Add the per-app fallbacks in `packages/sdk/src/site-config.ts`:

```ts
siteConfigurations.dojo.preset          = "dojo";
siteConfigurations["club-chlorine"].preset = "atrium";   // confirm with user
siteConfigurations.coucou.preset        = "maison";
```

### New mutations

- `packages/backend/convex/workspaces.ts` — `setPreset(workspaceSlug, preset)` and `setAuthBranding(workspaceSlug, authBranding)` for the future Coucou superadmin to call.

---

## 6. Branded sign-in detail

This is the half of the plan that integrates the `the-market` phone-auth pattern with the design's per-preset chrome from `auth.jsx`.

### 6.1 What we keep from the existing `packages/ui/src/auth/`

- The `useSignIn` / `useSignUp` Clerk strategy in `use-phone-auth-flow.ts` — already entry-agnostic (tries sign-in, falls back to sign-up).
- The `AuthMethod` union, `SiteAuthConfiguration` shape, the `phone | email` method tabs.
- `email-auth-flow.ts` for the email magic-link path.

### 6.2 What we change

- `<AuthShell>` gains `preset?: PresetKey` and an `authBranding?` override prop. Its rendered chrome:
  - **Top bar** — same masthead as `<TenantShell>` (brand name + tagline). Reused so the sign-in feels like part of the tenant site.
  - **Brand mark** — `<BrandMark preset={preset}>`, ported from `auth.jsx:115-186`:
    - `dojo` → red filled circle, white initials, weight 700
    - `atrium` → square 1.5px border, italic serif initials
    - `maison` → thin 1px ring, monospace initials, wide letter-spacing
  - **Heading + sub** — pulled from `preset.authCopy` unless the tenant sets `workspace.authBranding.heading` / `.sub` overrides.
  - **Eyebrow** — small uppercase label under the brand mark (`"Members & guests"` for dojo, `"Members entrance"` for atrium, `"Quiet entrance"` for maison).
  - **CTA button** — preset-shaped (`rounded` for dojo, `ghost-bordered` for maison/atrium).
  - **Footer** — Terms / Privacy / Cookies, with optional "powered by Coucou" toggle from `workspace.authBranding.showCoucouAttribution` (off by default).

### 6.3 OTP grid

- New component `packages/ui/src/auth/otp-grid.tsx` using `input-otp@^1.4.2` (already a dep of `the-market`; add to `packages/ui/package.json`).
- Six-slot layout (`gridTemplateColumns: "repeat(6, 1fr)"`).
- Preset styling:
  - `dojo` → 6px border-radius slots, bg-card with `border-border` default, `border-primary` on focus
  - `maison`/`atrium` → 0px radius, hairline `var(--rule)` borders
- Auto-submits when 6 digits are entered (matches `the-market` behavior).
- Error state — borders flash to `--fg` (no red) for maison/atrium; `border-destructive` for dojo.
- Replace the internals of the existing `verification-code-input.tsx` with the new `<OtpGrid>` while preserving its public API so call sites don't change.

### 6.4 Routing & domains

The current setup uses one Clerk instance per app deployment; satellite-domain support (per `auth.jsx`'s "your domain" preview) is **deferred**. For now:

- `apps/dojo` continues at `dojopomodoro.club` with its own Clerk publishable key.
- `apps/club-chlorine` continues at `clubchlorine.tld` with its own Clerk publishable key.
- `apps/coucou` is the platform admin; sign-in there is not branded by tenant.

Each tenant app's `apps/{tenant}/app/sign-in/[[...sign-in]]/page.tsx` renders `<PhoneAuthPage preset="..." />` — the preset comes from `siteConfiguration.preset` resolved at build time, so no satellite-domain plumbing needed.

A follow-up (out of scope here) can introduce Clerk satellite domains and wildcard auth domains per the design's "Hosted at dojopomodoro.tld via satellite domain" note.

### 6.5 Method allowlist

`siteAuthConfiguration.allowedMethods` already controls which method tabs appear. Per the design:

- `dojo` → phone only (no email tab)
- `atrium` → phone + email
- `maison` → phone + email

Set these defaults in `packages/sdk/src/site-config.ts` and let workspaces override via a future CMS.

### 6.6 Files modified for branded sign-in

- `packages/ui/src/auth/auth-shell.tsx` — accept `preset` prop, render `<BrandMark>` + tenant chrome.
- `packages/ui/src/auth/brand-mark.tsx` — new.
- `packages/ui/src/auth/otp-grid.tsx` — new (replaces internals of `verification-code-input.tsx`).
- `packages/ui/src/auth/verification-code-input.tsx` — internals swapped for `<OtpGrid>`; public API unchanged.
- `packages/ui/src/auth/phone-auth-page.tsx` — pass `preset` through to `<AuthShell>`.
- `packages/ui/src/auth/email-auth-page.tsx` — same.
- `packages/ui/src/auth/use-phone-auth-flow.ts` — no changes to logic; only error-message wording per preset (optional polish).
- `packages/ui/package.json` — add `input-otp@^1.4.2`.
- `apps/{tenant}/app/sign-in/[[...sign-in]]/page.tsx` — pipe `preset` from `siteConfiguration` into `<PhoneAuthPage>`.

---

## 7. Phased rollout

The work ships as **five PRs**. Each is independently mergeable and reviewable.

### PR 1 — Foundation: shared theming + preset definitions

Goal: ship the preset definitions and lift event-theme to the SDK without changing any user-visible page.

- Add `PRESET_DEFINITIONS` to `packages/sdk/src/theming/presets.ts` — verbatim port from `tenant.jsx:17-99` and `auth.jsx:191-207`.
- Move `buildEventThemeStyle()` from each `apps/{tenant}/lib/event-theme.ts` → `packages/sdk/src/theming/build-event-theme.ts`. Re-export from each app's existing `lib/event-theme.ts` so import paths don't break.
- Add `resolvePreset()` in `packages/sdk/src/theming/resolve-preset.ts` — takes `(workspace?, siteConfiguration, eventOverrides?)` → `PresetDefinition` with merged colors.
- Add `preset` field to `workspaces` table in `packages/backend/convex/schema.ts`.
- Add `preset` and `defaultAuthCopy` to `SiteConfiguration` type in `packages/sdk/src/site-config.ts`; populate per-app values.
- Create `packages/backend/convex/workspaces.ts` with `setPreset` + `setAuthBranding` mutations (gated to admin auth).
- **Verification**: each app starts and looks identical to before. Convex dashboard shows the new field on `workspaces`.

### PR 2 — Tenant template package: shared guest-surface components

Goal: ship the `tenant-template` components in `packages/ui` without wiring any app to them.

- Create `packages/ui/src/tenant-template/` per the layout in §4.3.
- Port `TenantLanding`, `RsvpGate`, `RsvpAccepted`, `RsvpPending`, `RsvpDenied`, `RsvpTicket` from `coucou/project/tenant.jsx` to TS + Tailwind. Replace inline-style JS objects with Tailwind classes that reference CSS vars emitted by `<TenantTemplateProvider>`. Keep inline `style` only for per-event color overrides.
- Use `react-qr-code` (existing dep) inside `<QrFrame>`; do not port `QrMock`.
- Reuse `apps/{tenant}/components/guest-info-form.tsx` for the form fields inside `<RsvpAccepted>` — wire it through `react-hook-form` + `mini-zod` validators that already exist.
- Add `useMobile()` and `<TenantTemplateProvider>` per §4.3.
- Storybook is not installed; verification is via a one-off scratch route in `apps/coucou/app/_design-preview/` that renders all six components for each preset. Removed before merge.
- **Verification**: `packages/ui` typechecks and lints; the temporary preview route renders correctly.

### PR 3 — Wire `apps/dojo` guest pages to the template

Goal: redesign the dojo guest flow against the new template using `preset="dojo"`.

- `apps/dojo/app/events/[eventId]/page.tsx` + `page-client.tsx` — replace landing layout with `<TenantLanding event={event} />`. Drop the password modal. Replace its CTA with `<Link href="/events/{id}/rsvp">`. Preserve any `?password=foo` deep links by redirecting them to `/events/{id}/rsvp?password=foo`.
- `apps/dojo/app/events/[eventId]/rsvp/page.tsx` — restructure as a state machine:
  - **Step 1** (no password yet) → `<RsvpGate />`. On submit calls `api.credentialsNode.resolveListByPassword`.
  - **Step 2** (password resolved, list assigned, no RSVP yet) → `<RsvpAccepted />`. Submits via `api.rsvps.submitRequest`.
  - **Step 3** (already submitted, status=`pending`) → `redirect('/events/{id}/status')`.
  - **Step 3'** (already `approved` | `attending`) → `redirect('/events/{id}/ticket')`.
  - **Step 3''** (already `denied`) → `redirect('/events/{id}/denied')`.
  - **Wrong password** → `<RsvpGate state="wrong" />`.
- `apps/dojo/app/events/[eventId]/status/page.tsx` — replace layout with `<RsvpPending />` for pending; redirect to ticket for approved.
- `apps/dojo/app/events/[eventId]/denied/page.tsx` — replace layout with `<RsvpDenied />`.
- `apps/dojo/app/events/[eventId]/ticket/ticket-client.tsx` — replace layout with `<Ticket />`. Keep the existing `downloadQRCodeAsImage()` helper.
- `apps/dojo/app/events/[eventId]/layout.tsx` — keep `<EventThemeProvider>`; it already applies `themeBackgroundColor` / `themeTextColor` over the preset.
- **Verification**: full E2E walk per §10. Test with seeded events that have a tier-routing password and a review-routing password. Mobile + desktop.

### PR 4 — Wire `apps/club-chlorine` guest pages to the template

Goal: same five surfaces in club-chlorine, configured with `preset="atrium"`.

- Mirror PR 3's page changes verbatim in `apps/club-chlorine`. Each page is a thin shell that imports the shared template component.
- Confirm with the user whether `atrium` is the right preset for club-chlorine; otherwise default to `maison` and add a club-chlorine-specific preset later.
- **Verification**: same E2E walk on club-chlorine. Per-event color overrides take precedence over atrium's defaults.

### PR 5 — Branded sign-in across all tenant apps

Goal: per-preset sign-in chrome with phone+OTP and optional email magic link.

- Add `input-otp@^1.4.2` to `packages/ui/package.json`.
- Add `<BrandMark>` and `<OtpGrid>` per §6.6.
- Modify `<AuthShell>` to accept `preset` and `authBranding`, render the masthead from `<TenantShell>`, render `<BrandMark>` per preset, switch CTA shape.
- Pipe `preset` through `<PhoneAuthPage>` and `<EmailAuthPage>`.
- Update each `apps/{tenant}/app/sign-in/[[...sign-in]]/page.tsx` to read `siteConfiguration.preset` and pass it to `<PhoneAuthPage preset={...} />`.
- **Verification**: sign-in page in each app matches the relevant preset (red on white for dojo, paper-room for club-chlorine, dark-quiet for coucou). Phone OTP flow still works. Email magic link works for tenants where it's allowed. Contrast meets WCAG AA on the OTP error state.

---

## 8. Files to modify — primary list

### Schema & backend (PR 1)

- `packages/backend/convex/schema.ts` — add `preset` + `authBranding` to `workspaces`.
- `packages/backend/convex/workspaces.ts` — *new*; `setPreset`, `setAuthBranding`.

### Shared SDK (PR 1)

- `packages/sdk/src/theming/presets.ts` — *new*; `PRESET_DEFINITIONS`.
- `packages/sdk/src/theming/build-event-theme.ts` — *new*; consolidated from `apps/*/lib/event-theme.ts`.
- `packages/sdk/src/theming/resolve-preset.ts` — *new*; merges preset + per-event overrides.
- `packages/sdk/src/site-config.ts` — add `preset` + `defaultAuthCopy`; set per-app fallbacks.

### Shared UI tenant template (PR 2)

- `packages/ui/src/tenant-template/provider.tsx` — *new*.
- `packages/ui/src/tenant-template/use-preset.ts` — *new*.
- `packages/ui/src/tenant-template/use-mobile.ts` — *new*.
- `packages/ui/src/tenant-template/components/tenant-shell.tsx` — *new*.
- `packages/ui/src/tenant-template/components/tenant-landing.tsx` — *new*; from `tenant.jsx:108-188`.
- `packages/ui/src/tenant-template/components/rsvp-gate.tsx` — *new*; from `tenant.jsx:208-277`.
- `packages/ui/src/tenant-template/components/rsvp-accepted.tsx` — *new*; from `tenant.jsx:281-338`.
- `packages/ui/src/tenant-template/components/rsvp-pending.tsx` — *new*; from `tenant.jsx:342-377`.
- `packages/ui/src/tenant-template/components/rsvp-denied.tsx` — *new*.
- `packages/ui/src/tenant-template/components/ticket.tsx` — *new*; from `tenant.jsx:381-444`.
- `packages/ui/src/tenant-template/components/primitives/{eyebrow,meta-row,field,button,qr-frame}.tsx` — *new*.

### Shared UI auth (PR 5)

- `packages/ui/src/auth/auth-shell.tsx` — modify; add `preset` prop.
- `packages/ui/src/auth/brand-mark.tsx` — *new*; from `auth.jsx:115-186`.
- `packages/ui/src/auth/otp-grid.tsx` — *new*; uses `input-otp`.
- `packages/ui/src/auth/verification-code-input.tsx` — modify internals.
- `packages/ui/src/auth/phone-auth-page.tsx` — pipe `preset`.
- `packages/ui/src/auth/email-auth-page.tsx` — pipe `preset`.
- `packages/ui/package.json` — add `input-otp@^1.4.2`.

### Per-tenant page wires (PR 3 — dojo, PR 4 — club-chlorine, PR 5 — sign-in)

- `apps/{tenant}/app/events/[eventId]/page.tsx` + `page-client.tsx`
- `apps/{tenant}/app/events/[eventId]/rsvp/page.tsx`
- `apps/{tenant}/app/events/[eventId]/status/page.tsx`
- `apps/{tenant}/app/events/[eventId]/denied/page.tsx`
- `apps/{tenant}/app/events/[eventId]/ticket/ticket-client.tsx`
- `apps/{tenant}/app/sign-in/[[...sign-in]]/page.tsx`

### Files to keep (re-export only)

- `apps/{tenant}/lib/event-theme.ts` — *re-export* `buildEventThemeStyle`, `getEventThemeColors`, `getAccessibleTextColor` from `@coucou/sdk` so admin pages keep working. Delete the re-export in a follow-up cleanup.
- `apps/{tenant}/components/event-theme-provider.tsx` — *modify*; thin wrapper around the shared theming output.
- `apps/{tenant}/components/guest-info-form.tsx` — *kept*; rendered inside `<RsvpAccepted>`.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Lifting `event-theme.ts` to `@coucou/sdk` breaks admin imports across all three apps | PR 1 keeps `apps/*/lib/event-theme.ts` as a re-export shim; remove only after a green build. |
| The prototype uses inline JS-object styles; mixing with Tailwind/CVA could be inconsistent | Convention: Tailwind classes for static styles + tokens; inline `style={...}` *only* for per-event color overrides. Document at the top of each component. |
| `Instrument Serif` (maison) and `GT Sectra` (atrium) are new fonts | `Instrument Serif` is on Google Fonts; `GT Sectra` is not — substitute `Cormorant Garamond` (Google Fonts) and document the substitution. Add to each `apps/{tenant}/app/layout.tsx` via `next/font/google`. |
| Replacing the password modal with a full-page gate breaks shared deep links | In PR 3/4, `apps/{tenant}/app/events/[eventId]/page.tsx` redirects `?password=foo` → `/events/{id}/rsvp?password=foo`. |
| `preset="atrium"` may not match what the user wants for club-chlorine | Confirm preset assignment for club-chlorine before PR 4 lands; default is reversible. |
| `input-otp` autosubmit behavior could regress accessibility | Match `the-market`'s implementation: autosubmit on 6 digits, but keep manual submit button; ensure focus order works with screen readers. |
| Tenant chrome on the sign-in page risks being inconsistent with Clerk's hosted pages | Decision: never use Clerk's hosted UI in tenant apps; always render our own `<AuthShell>`. Clerk's hosted UI stays available only for the coucou superadmin. |
| Satellite domains are not implemented in PR 5 | Acknowledged; the design's "your domain" preview is aspirational. Each tenant app is its own deployment with its own Clerk instance for now. |

---

## 10. Verification

End-to-end manual test, run for each tenant app (`apps/dojo`, `apps/club-chlorine`):

1. `cd apps/{tenant} && bun dev` (dojo: port 2345).
2. Seed Convex with at least one event that has `themeBackgroundColor` and `themeTextColor` set, plus a list with a tier-routing password and a list configured for review.
3. Visit `/events/{id}` — landing matches the tenant's preset.
4. Click RSVP CTA → lands on `/events/{id}/rsvp` (full page, not modal).
5. Enter the wrong password — see the wrong-password state without any flash of red on maison/atrium; soft inline error on dojo.
6. Enter the correct password — tier reveal screen appears with the right list label.
7. Fill name / phone / +1 / note → submit. Confirm the Convex mutation receives the data.
8. Visit `/events/{id}/status` for a pending RSVP — matches `<RsvpPending>`.
9. Approve via the host dashboard → `/events/{id}/ticket` shows the QR centered, with download-as-PNG still functioning. QR foreground/background match the per-event override (or the preset default if not set).
10. Edit `themeBackgroundColor` to a different hex on the event → reload landing → typography stays the same, background/ink colors update.
11. Mobile viewport (390 × N) — all five pages collapse to single-column with 24px gutters.
12. **Sign-in (PR 5)**: visit `/sign-in` on each tenant. Confirm:
    - Brand mark style matches preset (`filled-circle` for dojo, `square-serif` for atrium, `thin-ring` for maison).
    - Heading and sub copy come from the preset (`"Sign in to RSVP."` for dojo).
    - Phone input → OTP grid: enter 6 digits, autosubmits.
    - Wrong code → error state styled per preset.
    - Email magic link path renders for tenants where allowed.
    - No "Coucou" wordmark anywhere.
13. Type-check and lint per touched package: `bun lint` from the repo root (Turbo runs all).

---

## 11. Open questions (track before each PR)

- [ ] Which preset should `apps/club-chlorine` adopt — `atrium` or a new club-chlorine-specific preset? (Default: atrium; revisit before PR 4.)
- [ ] Should `apps/coucou`'s sign-in be branded with the maison preset, or stay as the platform's own visual identity? (Default: maison preset; revisit before PR 5.)
- [ ] Should the future organizer CMS be able to add **net-new presets**, or only tweak colors within the three named presets? (Default: tweak only; new presets require code changes.)
- [ ] Satellite-domain sign-in is deferred — tracked as a follow-up under the migration plan.
- [ ] `GT Sectra` font substitution — accept `Cormorant Garamond` as the closest free equivalent, or license `GT Sectra` for the atrium preset?

---

## 12. Reference — design source files

All paths are inside the design handoff bundle (`coucou/project/`):

| File | Lines of interest | Used for |
|---|---|---|
| `tenant.jsx` | 17–99 | `PRESETS` map → `PRESET_DEFINITIONS` |
| `tenant.jsx` | 108–188 | `<TenantLanding>` |
| `tenant.jsx` | 208–277 | `<RsvpGate>` |
| `tenant.jsx` | 281–338 | `<RsvpAccepted>` |
| `tenant.jsx` | 342–377 | `<RsvpPending>` |
| `tenant.jsx` | 381–444 | `<RsvpTicket>` |
| `tenant.jsx` | 447–486 | `<QrMock>` — replace with `react-qr-code` |
| `tenant.jsx` | 711–849 | Style helpers — convert to Tailwind classes |
| `auth.jsx` | 19–112 | `<AuthShell>` chrome |
| `auth.jsx` | 115–186 | `<BrandMark>` per preset |
| `auth.jsx` | 190–365 | `<AuthSignIn>` reference |
| `auth.jsx` | 369–467 | `<AuthCode>` — OTP grid reference |
| `auth.jsx` | 471–532 | `<AuthWelcome>` post-sign-in transition |
| `system.jsx` | (full) | Design tokens reference; render at `/design-system` in coucou |

External references:

- `../the-market/apps/web/src/components/phone-auth/` — structural pattern for the Clerk-backed phone+OTP flow.
- `../the-market/apps/web/src/components/phone-auth/otp-input.tsx` — `input-otp` integration we copy.
- `../the-market/apps/web/src/components/phone-auth/use-phone-auth-flow.ts` — entry-agnostic sign-in/sign-up Clerk strategy we mirror.

---

## 13. Implementation log

The plan was executed end-to-end in this session. All five PRs are checked into the working tree (uncommitted) and pass `bunx tsc --noEmit` per package and `bun lint` repo-wide.

### PR 1 — Foundation (landed)

- `packages/sdk/src/theming/presets.ts` — `PRESET_DEFINITIONS` for `maison` / `dojo` / `atrium` ported verbatim from the design handoff.
- `packages/sdk/src/theming/build-event-theme.ts` — moved from each app's `lib/event-theme.ts`. Adds an optional `fallbacks` parameter so callers can supply preset-derived defaults.
- `packages/sdk/src/theming/resolve-preset.ts` — `resolvePreset()` merges preset + per-event overrides; emits both shadcn-style (`--background`, `--primary`, …) and tenant-template (`--tt-bg`, `--tt-display`, …) CSS vars.
- `packages/sdk/src/theming/index.ts` re-exports the above; root `index.ts` and `package.json` exports updated.
- `packages/sdk/src/site-config.ts` — `SiteConfiguration` gains `preset: PresetKey`. Per-app fallbacks set: `dojo→dojo`, `club-chlorine→atrium`, `coucou→maison`.
- `packages/backend/convex/schema.ts` — `workspaces` gains `preset` and `authBranding` fields (both optional).
- `packages/backend/convex/workspaces.ts` — `setPreset` and `setAuthBranding` mutations added.
- `apps/{dojo,coucou,club-chlorine}/lib/event-theme.ts` — converted to thin re-export shims around the SDK so admin pages keep importing from `@/lib/event-theme`.

### PR 2 — Tenant template package (landed)

- `packages/ui/src/tenant-template/provider.tsx` — `<TenantTemplateProvider>` resolves preset + per-event overrides and emits CSS vars onto a wrapper `<div>`.
- `packages/ui/src/tenant-template/use-preset.ts`, `use-mobile.ts`, `internal-utils.ts`.
- Primitives in `packages/ui/src/tenant-template/components/primitives/`: `eyebrow`, `meta-row`, `field`, `button` (`<TenantButton>` switches between rounded / ghost-link / ghost-bordered per preset), `qr-frame` (uses `react-qr-code`).
- Surface components in `packages/ui/src/tenant-template/components/`: `tenant-shell`, `tenant-landing`, `rsvp-gate`, `rsvp-accepted`, `rsvp-pending` (with `extras` slot for tenant-specific add-ons), `rsvp-denied`, `ticket` (with `showQr` + `noQrSlot` for non-QR lists).
- `packages/ui/package.json` — added `react-qr-code` peer dep, exports for the new tenant-template paths.

### PR 3 — Dojo guest pages on the new template (landed)

- `apps/dojo/app/events/[eventId]/page-client.tsx` — replaced password modal with a CTA that pushes to `/rsvp`. Pre-existing `?password=` deep links are forwarded.
- `apps/dojo/app/events/[eventId]/rsvp/page.tsx` — orchestrator renders `<RsvpGate>` until a list resolves, then `<RsvpAccepted>` wrapping the existing form. Auto-redirects to `/status` (pending) or `/ticket` (approved/attending).
- `apps/dojo/app/events/[eventId]/rsvp/rsvp-accepted-form.tsx` — extracted form (RHF + GuestInfoFields + SMS consent dialogs) so the orchestrator can render it as children of `<RsvpAccepted>`.
- `apps/dojo/app/events/[eventId]/status/page.tsx` — uses `<RsvpPending>` with the SMS toggle + guest-portal image carried into the `extras` slot.
- `apps/dojo/app/events/[eventId]/denied/page.tsx` — uses `<RsvpDenied>` with a "try a different password" `secondaryAction`.
- `apps/dojo/app/events/[eventId]/ticket/ticket-client.tsx` — uses `<Ticket>`. QR foreground/background still come from `resolveQrCodeColors`. Download-as-PNG preserved (now via the `<QrFrame>`'s SVG id).

### PR 4 — Club-chlorine guest pages (landed)

- The five page files were copied from the dojo app and tuned only for tenant-specific platform copy ("using Dojo Pomodoro" → "using Club Chlorine" in SMS consent strings). Preset resolves to `atrium` automatically through `siteConfiguration.preset`.

### PR 5 — Branded sign-in (landed)

- `packages/ui/src/auth/verification-code-input.tsx` — gained `preset` and `autoSubmit` props. Slot styling switches per preset (rounded slots for dojo, hairline rectangles with `var(--tt-rule)` borders for maison/atrium). Auto-submit fires after a single tick once 6 digits are typed.
- `packages/ui/src/auth/brand-mark.tsx` — *new*; emits the per-preset mark (filled circle / square serif / thin ring / logo / wordmark). Reads color/font tokens from the active `<TenantTemplateProvider>`.
- `packages/ui/src/auth/auth-shell.tsx` — accepts `preset` and `authBranding`. When `preset` is set, renders the new `<PresetAuthShell>` with the tenant masthead, `<BrandMark>`, eyebrow ("Members & guests"), preset typography, and a hairline footer (Terms · Privacy · Cookies, with optional "powered by Coucou"). Without it, the original neutral aesthetic still renders for back-compat.
- `packages/ui/src/auth/types.ts` — `AuthPageProps` gains `preset` and `authBranding` fields.
- `packages/ui/src/auth/phone-auth-page.tsx`, `email-auth-page.tsx`, `phone-auth-flow.tsx`, `email-auth-flow.tsx` — pipe `preset` through; `<VerificationCodeInput>` now opts into autosubmit and preset variants.
- `packages/ui/src/auth/index.ts` and `package.json` — export `BrandMark` and the auth-shell/verification-code-input direct paths.
- `apps/{dojo,coucou,club-chlorine}/app/sign-in/[[...sign-in]]/sign-in-client.tsx` — replaced Clerk's hosted `<SignIn>` UI with `<PhoneAuthPage>` from `@coucou/ui/auth`, passing `preset={siteConfiguration.preset}`.

### Verification performed

- `bun lint` — clean for `@coucou/dojo`, `@coucou/club-chlorine`, `@coucou/site` (no lint task on `@coucou/sdk`, `@coucou/ui`, `@coucou/backend`).
- `bunx tsc --noEmit` — clean per package: `apps/dojo`, `apps/coucou`, `apps/club-chlorine`, `packages/ui`, `packages/sdk`, `packages/backend`.

### PR 6 — Fonts, integration polish, dev validation (landed)

- `apps/coucou/app/layout.tsx` — added `Instrument_Serif` (variable `--font-instrument-serif`) and `JetBrains_Mono` (variable `--font-jetbrains-mono`) via `next/font/google`; both attached to the `<body>` className alongside Geist.
- `apps/club-chlorine/app/layout.tsx` — added `Cormorant_Garamond` (variable `--font-cormorant-garamond`).
- `packages/sdk/src/theming/presets.ts` — preset `display` and `text` font stacks rewritten to lead with the matching `var(--font-*)`, then fall back to the original family name and system serif/sans. This is required because `next/font/google` registers fonts under a generated family name, so the original "Instrument Serif"/"Cormorant Garamond"/"JetBrains Mono" identifiers don't resolve unless re-mapped via the next/font CSS variable.
- Build sanity — `bun run build` for all three apps (dojo / coucou / club-chlorine) compiles cleanly with the new fonts and the new tenant-template surfaces.
- Dev sanity — confirmed via SSR HTML on the running dojo dev server (port 5678) that `/sign-in` renders `data-preset="dojo"`, the `tt-root` wrapper, the `Members & guests` eyebrow from `presetDefinition.authCopy`, the `DP` BrandMark, the `DOJO POMODORO` uppercased title, and the legal footer (`/terms`, `/privacy`, `/cookies` all return 200).
- Audit confirmed `<EventThemeProvider>` and `<TenantTemplateProvider>` coexist without conflict (both derive identical `--background`/`--foreground`/etc. from the same event via `buildEventThemeStyle`; the tenant-template's `--tt-*` vars live in their own namespace).

### Final polish pass (autonomous tick)

- `packages/ui/src/auth/phone-auth-page.tsx` now manages an internal `activeMethod` state and switches between `<PhoneAuthFlow>` and `<EmailAuthFlow>` when the tenant allows both methods. Previously it only rendered `<PhoneAuthFlow>` and dropped the method tabs because no `onMethodChange` was supplied. Callers that pass `activeMethod` + `onMethodChange` keep full external control (treated as "controlled mode").
- `apps/coucou/__tests__/sign-in-page.test.tsx` updated to query the method switcher by `role="tab"` (correct ARIA semantics) instead of `role="button"`. The updated test verifies that clicking Email reveals the email-form `aria-label="Email address"` field and the "Email me a code" submit button.
- Per-app test results after the polish: dojo 75/75, coucou 1/1, club-chlorine 75/75, backend 133/133 — **284/284 passing**.

### Still deferred (out of scope for this design implementation)

- **Live browser walkthrough** of the loaded states (signed-in user clicking through landing → `/rsvp` → `/status` → `/ticket`) — SSR-only `curl` validation can't render the post-Convex-hydration tree. Build + lint + dev SSR all clean; left for the user.
- **Per-tenant `authBranding` CMS** — schema field exists and `setAuthBranding` mutation exists, but the UI to edit them is part of the deferred organizer CMS work (`PasswordsAdmin` + `AuthBrandingAdmin` from the design).
- **Satellite-domain Clerk wiring** — deferred per § 6.4.
- **Coucou superadmin / onboarding / organizer CMS** — explicitly out of scope per § 1.
