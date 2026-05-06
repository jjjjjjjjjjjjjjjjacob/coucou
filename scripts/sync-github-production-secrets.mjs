#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  githubProductionEnvironmentName,
  githubRepositoryFullName,
  hasNonEmptyValue,
  optionalBackendEnvironmentVariables,
  requiredGitHubProductionSecrets,
  validateProductionEnvironmentValues,
} from "./backend-production-env.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = join(scriptDirectory, "..");
const localEnvironmentFiles = [
  join(repositoryDirectory, "packages", "backend", ".env.local"),
  join(repositoryDirectory, ".env.local"),
];

async function parseDotenvFile(pathname) {
  const file = Bun.file(pathname);
  if (!(await file.exists())) {
    return new Map();
  }

  const assignments = new Map();
  const contents = await file.text();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    const value = unquoteDotenvValue(rawValue.trim());
    assignments.set(key, value);
  }

  return assignments;
}

function unquoteDotenvValue(value) {
  if (value.length < 2) {
    return value;
  }

  const firstCharacter = value[0];
  const lastCharacter = value[value.length - 1];
  if (
    (firstCharacter === "\"" && lastCharacter === "\"") ||
    (firstCharacter === "'" && lastCharacter === "'")
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function loadLocalEnvironmentValues() {
  const values = new Map();

  for (const localEnvironmentFile of localEnvironmentFiles) {
    const assignments = await parseDotenvFile(localEnvironmentFile);
    for (const [key, value] of assignments) {
      if (!values.has(key) && hasNonEmptyValue(value)) {
        values.set(key, value);
      }
    }
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (hasNonEmptyValue(value)) {
      values.set(key, value);
    }
  }

  return values;
}

function runGitHubSecretSet(variableName, value) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(
      "gh",
      [
        "secret",
        "set",
        variableName,
        "--env",
        githubProductionEnvironmentName,
        "--repo",
        githubRepositoryFullName,
      ],
      {
        cwd: repositoryDirectory,
        stdio: ["pipe", "inherit", "inherit"],
      },
    );

    childProcess.stdin.end(value);

    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `gh secret set ${variableName} exited with code ${exitCode ?? "unknown"}`,
        ),
      );
    });
  });
}

const localEnvironmentValues = await loadLocalEnvironmentValues();
const missingSecretNames = requiredGitHubProductionSecrets.filter(
  (secretName) => !hasNonEmptyValue(localEnvironmentValues.get(secretName)),
);

if (missingSecretNames.length > 0) {
  console.error("Missing required GitHub production secrets:");
  for (const secretName of missingSecretNames) {
    console.error(`- ${secretName}`);
  }
  console.error("Secret values were not printed.");
  process.exit(1);
}

const productionValidationMessages = validateProductionEnvironmentValues(
  localEnvironmentValues,
);
if (productionValidationMessages.length > 0) {
  console.error("Invalid GitHub production secret values:");
  for (const validationMessage of productionValidationMessages) {
    console.error(`- ${validationMessage}`);
  }
  console.error("Secret values were not printed.");
  process.exit(1);
}

const secretNamesToSync = [
  ...requiredGitHubProductionSecrets,
  ...optionalBackendEnvironmentVariables.filter((secretName) =>
    hasNonEmptyValue(localEnvironmentValues.get(secretName)),
  ),
];

console.log(
  `Syncing ${secretNamesToSync.length} GitHub production environment secrets.`,
);

for (const secretName of secretNamesToSync) {
  await runGitHubSecretSet(secretName, localEnvironmentValues.get(secretName));
  console.log(`Synced ${secretName}`);
}

console.log("GitHub production environment secrets are synced.");
