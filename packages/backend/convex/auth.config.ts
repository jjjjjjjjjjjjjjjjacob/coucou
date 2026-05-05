export default {
  // Configure Convex to verify Clerk-issued JWTs.
  // Use Clerk's Frontend API URL as the OIDC issuer domain, e.g.
  //   https://<your-subdomain>.clerk.accounts.dev
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL,
      applicationID: "convex",
    },
  ],
} as const;
