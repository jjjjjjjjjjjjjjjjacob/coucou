interface ClerkAuthProvider {
  domain: string;
  applicationID: "convex";
}

function splitFrontendApiUrls(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((frontendApiUrl) => frontendApiUrl.trim())
    .filter((frontendApiUrl) => frontendApiUrl.length > 0);
}

export function resolveClerkFrontendApiUrls(environmentVariables: {
  CLERK_FRONTEND_API_URL?: string;
  CLERK_FRONTEND_API_URLS?: string;
}): string[] {
  const configuredUrls = splitFrontendApiUrls(
    environmentVariables.CLERK_FRONTEND_API_URLS,
  );
  const fallbackUrl = splitFrontendApiUrls(
    environmentVariables.CLERK_FRONTEND_API_URL,
  );
  const frontendApiUrls =
    configuredUrls.length > 0 ? configuredUrls : fallbackUrl;

  return [...new Set(frontendApiUrls)];
}

export function buildClerkAuthProviders(environmentVariables: {
  CLERK_FRONTEND_API_URL?: string;
  CLERK_FRONTEND_API_URLS?: string;
}): ClerkAuthProvider[] {
  return resolveClerkFrontendApiUrls(environmentVariables).map(
    (frontendApiUrl) => ({
      domain: frontendApiUrl,
      applicationID: "convex",
    }),
  );
}
