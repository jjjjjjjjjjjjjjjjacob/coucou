export const githubRepositoryFullName = "jjjjjjjjjjjjjjjjacob/dojo-pomodoro";
export const githubProductionEnvironmentName = "production";

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
