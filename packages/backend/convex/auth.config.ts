import { buildClerkAuthProviders } from "./lib/clerkAuthConfig";

export default {
  // Configure Convex to verify Clerk-issued JWTs.
  // Use Clerk's Frontend API URL as the OIDC issuer domain. Production
  // satellite domains can emit tokens from multiple Frontend API hosts, so
  // CLERK_FRONTEND_API_URLS accepts a comma-separated allowlist.
  providers: buildClerkAuthProviders({
    CLERK_FRONTEND_API_URL: process.env.CLERK_FRONTEND_API_URL,
    CLERK_FRONTEND_API_URLS: process.env.CLERK_FRONTEND_API_URLS,
  }),
} as const;
