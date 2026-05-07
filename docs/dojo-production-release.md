# Dojo Production Release Record

Completed: May 7, 2026

This document is now a production release record and verification checklist. The
Dojo workspace migration, RSVP aggregate backfill, and RSVP social/profile-field
backfill have already been completed in development and production. Do not run
those backfills as part of routine deploys.

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
generic fallback. Production CD generates `CLERK_FRONTEND_API_URLS` from
`CLERK_FRONTEND_API_URL`, verified workspace-site satellite metadata, and
static known-tenant fallback values. If using `bun run sync:github-production-secrets`,
export production values first. The sync script rejects local URLs.

## Clerk

Configure the production Clerk webhook to the Convex HTTP endpoint:

```text
https://<production-convex-deployment>.convex.site/webhooks/clerk
```

Subscribe it to user, organization, and organization membership create/update
events, plus organization membership deletion. Set `CLERK_WEBHOOK_SECRET` in
GitHub `Production` to the webhook signing secret.

## Convex Deployment

After production secrets exist, deploy the backend:

```bash
cd packages/backend
bunx convex deploy -y
```

Normal production deploys no longer require migration commands.

## Completed Migrations

The completed Dojo production migration:

- linked the `dojo-pomodoro` workspace to Clerk organization
  `org_32rnaa36Qh7Q15BGgwwRehP6jJ9`
- configured the `dojo` workspace site for `dojopomodoro.club`
- patched legacy Dojo events to `siteKey="dojo"` and
  `workspaceSlug="dojo-pomodoro"`
- backfilled RSVP aggregates after event scope was correct
- backfilled RSVP social/profile data into first-class profile value records and
  workspace grants while preserving legacy `customFieldValues`

The temporary primary-field and snapshot-restore scripts/functions were removed
after dev and production verification.

## Post-Push Verification

Verify the production workflow succeeds, then check:

- Dojo public pages and RSVP flows still work at `https://dojopomodoro.club`.
- Dojo admin, host, and door links land under `/workspaces/dojo-pomodoro`.
- Coucou shows Dojo events, RSVP counts, dashboard analytics, and door views.
- Aggregate health matches database counts for key Dojo events if investigated.
- Vercel deploy skipping behaves by app root and shared package changes.
