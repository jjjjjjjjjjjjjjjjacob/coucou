# Dojo Production Release

Use this checklist before pushing the migration work to `main`.

## Required Production Secrets

Populate the GitHub `Production` environment before relying on the production
workflow:

```bash
gh secret set CONVEX_DEPLOY_KEY --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set APP_BASE_URL --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set CLERK_FRONTEND_API_URL --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set CLERK_SECRET_KEY --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set CLERK_WEBHOOK_SECRET --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set COUCOU_CLERK_ORGANIZATION_SLUG --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set TWILIO_ACCOUNT_SID --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set TWILIO_AUTH_TOKEN --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
gh secret set TWILIO_PHONE_NUMBER --env Production --repo jjjjjjjjjjjjjjjjacob/coucou
```

`APP_BASE_URL` must be `https://coucou.events` for production. Known event
sites resolve to their own configured domains first, so this value is only the
generic fallback. If using
`bun run sync:github-production-secrets`, export production values first. The
sync script rejects local URLs.

## Clerk

Configure the production Clerk webhook to the Convex HTTP endpoint:

```text
https://<production-convex-deployment>.convex.site/webhooks/clerk
```

Subscribe it to user, organization, and organization membership create/update
events, plus organization membership deletion. Set `CLERK_WEBHOOK_SECRET` in
GitHub `Production` to the webhook signing secret.

## Convex Deployment And Migration

After production secrets exist, deploy the backend:

```bash
cd packages/backend
bunx convex deploy -y
```

Run the Dojo workspace scope migration as a Coucou platform member:

```bash
cd packages/backend
bunx convex run migrations:backfillDojoPomodoroWorkspaceScope '{"dryRun":true,"clerkOrganizationId":"org_32rnaa36Qh7Q15BGgwwRehP6jJ9","clerkOrganizationSlug":"dojo-pomodoro"}' --prod
bunx convex run migrations:backfillDojoPomodoroWorkspaceScope '{"dryRun":false,"clerkOrganizationId":"org_32rnaa36Qh7Q15BGgwwRehP6jJ9","clerkOrganizationSlug":"dojo-pomodoro"}' --prod
```

Save the dry-run output before the real run. It lists every event whose
`siteKey` or `workspaceSlug` will be patched.

Backfill RSVP aggregates after event scope is correct:

```bash
cd packages/backend
bunx convex run rsvps:run '{"fn":"rsvps:backfillRsvpAggregate"}' --prod
bunx convex run rsvps:checkAggregateHealth '{"eventId":"<event-id>"}' --prod
```

## Post-Push Verification

Verify the production workflow succeeds, then check:

- Dojo public pages and RSVP flows still work at `https://dojopomodoro.club`.
- Dojo admin, host, and door links land under `/workspaces/dojo-pomodoro`.
- Coucou shows Dojo events, RSVP counts, dashboard analytics, and door views.
- Aggregate health matches database counts for key Dojo events.
- Vercel deploy skipping behaves by app root and shared package changes.
