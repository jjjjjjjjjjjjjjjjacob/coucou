export const githubRepositoryFullName = "jjjjjjjjjjjjjjjjacob/dojo-pomodoro";
export const githubProductionEnvironmentName = "Production";

export const requiredBackendEnvironmentVariables = Object.freeze([
  "APP_BASE_URL",
  "CLERK_FRONTEND_API_URL",
  "CLERK_SECRET_KEY",
  "CLERK_WEBHOOK_SECRET",
  "COUCOU_CLERK_ORGANIZATION_SLUG",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
]);

export const optionalBackendEnvironmentVariables = Object.freeze([
  "TWILIO_MESSAGING_SERVICE_SID",
  "DEV_TWILIO_ENABLED",
]);

export const requiredGitHubProductionSecrets = Object.freeze([
  "CONVEX_DEPLOY_KEY_PRODUCTION",
  ...requiredBackendEnvironmentVariables,
]);

export const allBackendEnvironmentVariables = Object.freeze([
  ...requiredBackendEnvironmentVariables,
  ...optionalBackendEnvironmentVariables,
]);

export function hasNonEmptyValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function findMissingEnvironmentVariables(environmentVariables, names) {
  return names.filter((name) => !hasNonEmptyValue(environmentVariables[name]));
}

function getEnvironmentVariableValue(environmentVariables, name) {
  if (environmentVariables instanceof Map) {
    return environmentVariables.get(name);
  }

  return environmentVariables[name];
}

function isProductionHttpsUrl(value) {
  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== "https:") {
      return false;
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1"
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function validateProductionEnvironmentValues(environmentVariables) {
  const validationMessages = [];
  const appBaseUrl = getEnvironmentVariableValue(
    environmentVariables,
    "APP_BASE_URL",
  );
  const clerkFrontendApiUrl = getEnvironmentVariableValue(
    environmentVariables,
    "CLERK_FRONTEND_API_URL",
  );
  const developmentTwilioEnabled = getEnvironmentVariableValue(
    environmentVariables,
    "DEV_TWILIO_ENABLED",
  );

  if (hasNonEmptyValue(appBaseUrl) && !isProductionHttpsUrl(appBaseUrl)) {
    validationMessages.push(
      "APP_BASE_URL must be a production HTTPS URL, not a local or development URL.",
    );
  }

  if (
    hasNonEmptyValue(clerkFrontendApiUrl) &&
    !isProductionHttpsUrl(clerkFrontendApiUrl)
  ) {
    validationMessages.push(
      "CLERK_FRONTEND_API_URL must be a production HTTPS URL.",
    );
  }

  if (developmentTwilioEnabled?.trim().toLowerCase() === "true") {
    validationMessages.push(
      "DEV_TWILIO_ENABLED must not be true for the Production environment.",
    );
  }

  return validationMessages;
}
