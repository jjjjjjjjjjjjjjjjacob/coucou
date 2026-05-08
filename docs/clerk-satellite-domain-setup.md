# Clerk Satellite Domain Setup

Use this checklist when a tenant app shares the Coucou production Clerk
instance across a separate custom domain, such as `dojopomodoro.club` or
`clubchlorine.party`.

## Current Domains

- Primary auth domain: `coucou.events`
- Satellite tenant domains:
  - `dojopomodoro.club`
  - `clubchlorine.party`

## Clerk Dashboard

1. Open the production Clerk application for `coucou.events`.
2. Go to **DNS & Domains**.
3. Keep `coucou.events` as the primary domain.
4. Add each tenant domain on the **Satellites** tab.
5. For every satellite domain, add the Clerk-provided DNS record for the
   `clerk` subdomain in the domain's DNS provider.
6. Wait until Clerk shows the satellite domain as verified.

Clerk's production keys only work on the primary domain and verified satellite
domains. If `clerk.<tenant-domain>` is missing or unverified, browsers will log:

```text
Clerk: Production Keys are only allowed for domain "coucou.events".
```

Reference: [Clerk satellite domains](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains).

## Vercel Environment

Set these variables on Coucou and every satellite tenant deployment:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_COUCOU_BASE_URL=https://coucou.events
NEXT_PUBLIC_CONVEX_URL=https://...
```

Tenant apps also need their workspace organization ID:

```bash
NEXT_PUBLIC_DOJO_CLERK_ORGANIZATION_ID=org_...
NEXT_PUBLIC_CLUB_CHLORINE_CLERK_ORGANIZATION_ID=org_...
```

Convex production must use the same Clerk issuer/front-end API URL that matches
the Coucou Clerk application. When satellite domains are enabled, set the
primary Frontend API host as a production secret:

```bash
CLERK_FRONTEND_API_URL=https://clerk.coucou.events
```

Production deploys generate `CLERK_FRONTEND_API_URLS` before syncing Convex
environment variables and before `convex deploy`. The generator combines:

- the primary `CLERK_FRONTEND_API_URL`
- enabled and verified workspace-site `clerkFrontendApiUrl` metadata
- static site config fallback values for known tenant apps

## Code Checklist

For a new tenant app:

1. Add the tenant to `siteConfigurations` in `packages/sdk/src/site-config.ts`.
2. Give the tenant `appKind: "client"`, a stable `workspaceSlug`, and its
   production `domain`.
3. Use the tenant app's root `layout.tsx` to mount `ClerkProvider` with:
   - `isSatellite`
   - `domain={clerkSatelliteDomain}`, where `clerkSatelliteDomain` comes from
     `NEXT_PUBLIC_CLERK_DOMAIN` or the canonical `siteConfiguration.domain`
   - `signInUrl` and `signUpUrl` pointing to the Coucou workspace login URL
4. Use tenant middleware to configure Clerk with `isSatellite`, `domain` set
   from `req.nextUrl.host`, and primary-domain `signInUrl` / `signUpUrl`
   values.
5. Redirect unauthenticated users to Coucou workspace login, not the
   tenant-local `/sign-in`.
6. Build the `redirect_url` as an absolute tenant URL and include
   `__clerk_synced=false`.
7. Add the tenant origin to the primary Coucou `ClerkProvider`
   `allowedRedirectOrigins`.
8. Allow Coucou login pages to redirect only to known tenant origins via
   `resolveSafeRedirectUrl`.
9. Add tests for the tenant auth-domain helper path.
10. Provision the workspace-site Clerk satellite auth metadata:
    - `clerkFrontendApiUrl`
    - `clerkSatelliteVerificationStatus="verified"`
    - `clerkSatelliteAuthEnabled=true`
    - `clerkSatelliteLastSyncedAt`

The shared helpers for steps 3 through 8 live in:

- `packages/sdk/src/auth-domains.ts`
- `packages/sdk/src/routes.ts`

For local development, set `NEXT_PUBLIC_CLERK_DOMAIN` in the tenant app's own
`.env.local` to the app's local host and port, such as `localhost:5678` for
Dojo or `localhost:5679` for Club Chlorine. Production can use the canonical
domain from `siteConfigurations` unless the deployment needs an override.

Club Chlorine keeps its old satellite-local OTP page behind
`CLUB_CHLORINE_ENABLE_SATELLITE_LOCAL_LOGIN=true` for development experiments.
Leave that flag unset or `false` in production so Clerk phone auth runs on the
primary `coucou.events` domain.

## Production Smoke Test

For each tenant domain:

1. Open an unauthenticated protected route, for example
   `https://dojopomodoro.club/events/<eventId>/ticket`.
2. Confirm it redirects to
   `https://coucou.events/workspaces/<workspaceSlug>/login?...`.
3. Complete phone auth on `coucou.events`.
4. Confirm the browser returns to the tenant domain with an active session.
5. Refresh the tenant page and confirm Clerk still loads without console
   origin errors.

If the redirect succeeds but the tenant app does not recognize the session,
check that the tenant return URL includes `__clerk_synced=false`.
