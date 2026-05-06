# Production Migration Guide

This repository deploys the Coucou platform plus the Dojo Pomodoro and Club
Chlorine client sites. Use this guide when preparing or running production
deployments that require Convex data migrations.

All commands use Bun. Do not use npm, yarn, or pnpm in this repo.

## Production IDs

Use these Clerk organization IDs for production data and Vercel environment
configuration:

```text
Dojo Pomodoro: org_32rnaa36Qh7Q15BGgwwRehP6jJ9
Club Chlorine: org_3DJfIuDejALI0S4PKobczmBixxn
```

The current Dojo migration links the production Dojo workspace to
`org_32rnaa36Qh7Q15BGgwwRehP6jJ9` and moves legacy Dojo events into the
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
gh secret list --env Production --repo jjjjjjjjjjjjjjjjacob/dojo-pomodoro
```

Required backend secrets include:

```text
CONVEX_DEPLOY_KEY_PRODUCTION
APP_BASE_URL
CLERK_FRONTEND_API_URL
CLERK_SECRET_KEY
CLERK_WEBHOOK_SECRET
COUCOU_CLERK_ORGANIZATION_SLUG
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

`APP_BASE_URL` must be `https://dojopomodoro.club` in production. If you use
`bun run sync:github-production-secrets`, export production values first; the
sync script rejects local URLs.

Also confirm Vercel production env vars exist for each app. These two public
organization IDs are used by the client headers to decide whether to show host
and door links:

```text
NEXT_PUBLIC_DOJO_CLERK_ORGANIZATION_ID=org_32rnaa36Qh7Q15BGgwwRehP6jJ9
NEXT_PUBLIC_CLUB_CHLORINE_CLERK_ORGANIZATION_ID=org_3DJfIuDejALI0S4PKobczmBixxn
```

## Deploy Backend First

Pushing to `main` runs `.github/workflows/deploy-production.yml`, which deploys
the Convex backend after CI passes. Wait for that workflow to finish before
running production migrations.

For a manual backend deploy, run:

```bash
bun run sync:convex-production-env
cd packages/backend
bunx convex deploy -y
```

## Migration Identity

The Dojo workspace migration is protected by Coucou platform auth. Run it as a
Coucou platform member. When using the Convex CLI, provide an identity whose
active organization slug is `coucou`.

Set this once in the shell you use for migration commands:

```bash
export COUCOU_PLATFORM_IDENTITY='{"subject":"<production-coucou-admin-clerk-user-id>","issuer":"<production-clerk-issuer>","tokenIdentifier":"<production-coucou-admin-clerk-user-id>","org_slug":"coucou","role":"org:admin"}'
```

Keep `subject` and `tokenIdentifier` as the same production Clerk user ID for
the operator running the migration.

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

The Dojo workspace organization link is handled by the Dojo migration below.

## Dojo Workspace Migration

Always run the dry run first and save the output:

```bash
cd packages/backend
bunx convex run migrations:backfillDojoPomodoroWorkspaceScope '{"dryRun":true,"clerkOrganizationId":"org_32rnaa36Qh7Q15BGgwwRehP6jJ9","clerkOrganizationSlug":"dojo-pomodoro"}' --prod --identity "$COUCOU_PLATFORM_IDENTITY"
```

Review the dry-run output before continuing:

```text
workspaceAction
workspaceSiteAction
matchingEventCount
patchedEventCount
patchedEvents
```

Stop if `patchedEvents` includes anything that is not a Dojo Pomodoro event, or
if the migration reports that the existing Dojo workspace is linked to a
different Clerk organization.

After the dry run looks correct, run the real migration:

```bash
bunx convex run migrations:backfillDojoPomodoroWorkspaceScope '{"dryRun":false,"clerkOrganizationId":"org_32rnaa36Qh7Q15BGgwwRehP6jJ9","clerkOrganizationSlug":"dojo-pomodoro"}' --prod --identity "$COUCOU_PLATFORM_IDENTITY"
```

This migration:

- creates or updates the `dojo-pomodoro` workspace
- links it to the production Dojo Clerk organization
- creates, reassigns, or updates the `dojo` workspace site
- patches legacy Dojo events to `siteKey="dojo"` and
  `workspaceSlug="dojo-pomodoro"`

## RSVP Aggregate Backfill

Run the RSVP aggregate backfill after the Dojo workspace scope migration:

```bash
cd packages/backend
bunx convex run rsvps:run '{"fn":"rsvps:backfillRsvpAggregate"}' --prod
```

Then list the production Dojo events and check aggregate health for each event
ID returned:

```bash
bunx convex run events:listAll '{"siteKey":"dojo","workspaceSlug":"dojo-pomodoro"}' --prod
bunx convex run rsvps:checkAggregateHealth '{"eventId":"<event-id>"}' --prod
```

Every health check should return `isHealthy: true` and `difference: 0`.

## Post-Migration Verification

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

## Rollback Notes

Do not roll back with ad hoc database edits. If a production migration result
looks wrong, stop deploying new changes, keep the saved dry-run and real-run
outputs, and inspect the specific `workspaces`, `workspaceSites`, and `events`
records before making any corrective mutation.
