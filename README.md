# Production Operations Guide

This repository deploys the Coucou platform plus the Dojo Pomodoro and Club
Chlorine client sites. Use this guide when preparing production deployments,
checking production configuration, or investigating completed Convex data
migrations.

The Dojo workspace migration, RSVP aggregate backfill, and RSVP
social/profile-field backfill were completed in development and production on
May 7, 2026. They are no longer part of the normal production deployment
checklist.

All commands use Bun. Do not use npm, yarn, or pnpm in this repo.

## Production IDs

Use these Clerk organization IDs for production data and Vercel environment
configuration:

```text
Dojo Pomodoro: org_32rnaa36Qh7Q15BGgwwRehP6jJ9
Club Chlorine: org_3DJfIuDejALI0S4PKobczmBixxn
```

The completed Dojo migration linked the production Dojo workspace to
`org_32rnaa36Qh7Q15BGgwwRehP6jJ9` and moved legacy Dojo events into the
`dojo-pomodoro` workspace scope.

## Before Pushing To Main

Run the normal repo checks locally:

```bash
bun install --frozen-lockfile
bun run lint
bun run test
bun run build
```

Confirm the GitHub `Production` environment has the backend deploy secrets. The
production workflow syncs these into Convex before deploying the backend:

```bash
gh secret list --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
```

Required backend secrets include:

```text
CONVEX_DEPLOY_KEY
APP_BASE_URL
CLERK_FRONTEND_API_URL
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
COUCOU_CLERK_ORGANIZATION_SLUG
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

`APP_BASE_URL` must be `https://coucou.events` in production. Known event
sites resolve to their own configured domains first, so this value is only the
generic fallback. For Clerk satellite domains, production CD generates
`CLERK_FRONTEND_API_URLS` from the primary Clerk Frontend API host, verified
workspace-site satellite metadata, and static known-tenant fallback values
before Convex environment sync and deploy. If you use
`bun run sync:github-production-secrets`, export production values first; the
sync script rejects local URLs.

Also confirm Vercel production env vars exist for each app. These two public
organization IDs are used by the client headers to decide whether to show host
and door links:

```text
NEXT_PUBLIC_DOJO_CLERK_ORGANIZATION_ID=org_32rnaa36Qh7Q15BGgwwRehP6jJ9
NEXT_PUBLIC_CLUB_CHLORINE_CLERK_ORGANIZATION_ID=org_3DJfIuDejALI0S4PKobczmBixxn
NEXT_PUBLIC_DANZA_ORGANICA_CLERK_ORGANIZATION_ID=org_3GsWCYDtyVfcRNEVh7RLar74SUJ
```

## Deploy Backend First

Pushing to `main` runs `.github/workflows/deploy-production.yml`, which deploys
the Convex backend after CI passes. Wait for that workflow to finish before
running production verification or intentional maintenance commands.

For a manual backend deploy, run:

```bash
bun run sync:convex-production-env
cd packages/backend
bunx convex deploy -y
```

## Maintenance Identity

Some maintenance mutations are protected by Coucou platform auth. Run them as a
Coucou platform member. When using the Convex CLI, provide an identity whose
active organization slug is `coucou`.

Set this once in the shell you use for maintenance commands:

```bash
export COUCOU_PLATFORM_IDENTITY='{"subject":"<production-coucou-admin-clerk-user-id>","issuer":"<production-clerk-issuer>","tokenIdentifier":"<production-coucou-admin-clerk-user-id>","org_slug":"coucou","role":"org:admin"}'
```

Keep `subject` and `tokenIdentifier` as the same production Clerk user ID for
the operator running the command.

## Optional Workspace Bootstrap

Run this only if production is missing the default workspace records. It is
safe to run more than once because the mutation upserts records.

```bash
cd packages/backend
bunx convex run workspaces:seedDefaultWorkspaces '{}' --prod
```

Then link the Club Chlorine workspace to its production Clerk organization:

```bash
bunx convex run workspaces:setClerkOrganizationId '{"slug":"club-chlorine","clerkOrganizationId":"org_3DJfIuDejALI0S4PKobczmBixxn","clerkOrganizationSlug":"club-chlorine"}' --prod --identity "$COUCOU_PLATFORM_IDENTITY"
```

The Dojo workspace organization link was handled by the completed Dojo
workspace migration.

## Completed Dojo Workspace Migration

The Dojo workspace migration has already completed in development and
production. Do not run it during routine deploys.

It:

- created or updated the `dojo-pomodoro` workspace
- linked it to the production Dojo Clerk organization
- created, reassigned, or updated the `dojo` workspace site
- patched legacy Dojo events to `siteKey="dojo"` and
  `workspaceSlug="dojo-pomodoro"`

Verify the production workspace record when investigating production state:

```bash
bunx convex run workspaces:getWorkspaceBySlug '{"slug":"dojo-pomodoro"}' --prod
```

## Completed RSVP Aggregate Backfill

The RSVP aggregate backfill has already completed in development and
production. Do not run it during routine deploys.

To investigate aggregate health, list production Dojo events and check each
event ID returned:

```bash
bunx convex run events:listAll '{"siteKey":"dojo","workspaceSlug":"dojo-pomodoro"}' --prod
bunx convex run rsvps:checkAggregateHealth '{"eventId":"<event-id>"}' --prod
```

Every health check should return `isHealthy: true` and `difference: 0`.

## Completed RSVP Social/Profile Backfill

The RSVP custom-field to first-class social/profile-field backfill has already
completed in development and production. Legacy RSVP `customFieldValues` remain
for compatibility, while reusable user-owned profile values and workspace grants
now provide the first-class profile data path.

The temporary snapshot restore and primary-field backfill scripts/functions were
removed after verification.

## Production Verification

Verify the Dojo workspace record:

```bash
bunx convex run workspaces:getWorkspaceBySlug '{"slug":"dojo-pomodoro"}' --prod
```

Expected production values:

```text
slug: dojo-pomodoro
kind: client
primaryDomain: dojopomodoro.club
clerkOrganizationId: org_32rnaa36Qh7Q15BGgwwRehP6jJ9
clerkOrganizationSlug: dojo-pomodoro
siteKey: dojo
site domain: dojopomodoro.club
site appKind: client
```

Verify dashboard analytics through the migrated workspace scope:

```bash
bunx convex run dashboard:getDashboardStats '{"siteKey":"dojo","workspaceSlug":"dojo-pomodoro"}' --prod --identity "$COUCOU_PLATFORM_IDENTITY"
```

Then check the live apps:

- `https://dojopomodoro.club` loads public Dojo pages and RSVP flows.
- Dojo host and door links point to `/workspaces/dojo-pomodoro/...` in Coucou.
- Coucou can see Dojo events, RSVP counts, dashboard analytics, host views, and
  door views.
- Club Chlorine deploys with its production Clerk organization ID and does not
  show Dojo admin links.

## Incident Notes

Do not roll back with ad hoc database edits. If a historical migration result
looks wrong, stop deploying new changes and inspect the specific `workspaces`,
`workspaceSites`, `events`, `rsvps`, `profileFieldValues`, and
`workspaceProfileValueGrants` records before making any corrective mutation.
