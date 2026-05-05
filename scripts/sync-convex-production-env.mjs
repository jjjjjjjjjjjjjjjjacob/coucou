#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  allBackendEnvironmentVariables,
  findMissingEnvironmentVariables,
  hasNonEmptyValue,
  requiredBackendEnvironmentVariables,
} from "./backend-production-env.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = join(scriptDirectory, "..");
const backendDirectory = join(repositoryDirectory, "packages", "backend");

function runCommandWithSecretInput(command, args, input, options = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd: backendDirectory,
      env: process.env,
      stdio: ["pipe", "inherit", "inherit"],
      ...options,
    });

    childProcess.stdin.end(input);

    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${exitCode ?? "unknown"}`,
        ),
      );
    });
  });
}

const missingEnvironmentVariables = findMissingEnvironmentVariables(
  process.env,
  requiredBackendEnvironmentVariables,
);
const missingDeploymentVariables = findMissingEnvironmentVariables(process.env, [
  "CONVEX_DEPLOY_KEY",
]);

if (
  missingDeploymentVariables.length > 0 ||
  missingEnvironmentVariables.length > 0
) {
  if (missingDeploymentVariables.length > 0) {
    console.error("Missing required deployment environment variables:");
    for (const variableName of missingDeploymentVariables) {
      console.error(`- ${variableName}`);
    }
  }

  if (missingEnvironmentVariables.length > 0) {
    console.error("Missing required Convex production environment variables:");
  }
  for (const variableName of missingEnvironmentVariables) {
    console.error(`- ${variableName}`);
  }
  process.exit(1);
}

const variablesToSync = allBackendEnvironmentVariables.filter((variableName) =>
  hasNonEmptyValue(process.env[variableName]),
);

console.log(
  `Syncing ${variablesToSync.length} Convex production environment variables.`,
);

for (const variableName of variablesToSync) {
  await runCommandWithSecretInput(
    "bunx",
    ["convex", "env", "set", "--prod", variableName],
    process.env[variableName],
  );
}

console.log("Convex production environment variables are synced.");
