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
  const primaryFrontendApiUrls = splitFrontendApiUrls(
    environmentVariables.CLERK_FRONTEND_API_URL,
  );
  const additionalFrontendApiUrls = splitFrontendApiUrls(
    environmentVariables.CLERK_FRONTEND_API_URLS,
  );
  const frontendApiUrls = [
    ...primaryFrontendApiUrls,
    ...additionalFrontendApiUrls,
  ];

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
