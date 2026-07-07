#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasNonEmptyValue, isProductionHttpsUrl } from "./backend-production-env.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = join(scriptDirectory, "..");
const backendDirectory = join(repositoryDirectory, "packages", "backend");
const clerkFrontendApiSubdomain = "clerk";

function runCommandCapturingOutput(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      cwd: repositoryDirectory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let standardOutput = "";
    let standardError = "";

    childProcess.stdout.on("data", (chunk) => {
      standardOutput += chunk.toString();
    });
    childProcess.stderr.on("data", (chunk) => {
      standardError += chunk.toString();
    });

    childProcess.on("error", reject);
    childProcess.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve({ standardOutput, standardError });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${
            exitCode ?? "unknown"
          }${standardError ? `\n${standardError.trim()}` : ""}`,
        ),
      );
    });
  });
}

export function normalizeProductionHttpsOrigin(value, label = "URL") {
  if (!hasNonEmptyValue(value)) {
    throw new Error(`${label} is required.`);
  }

  const trimmedValue = value.trim();
  if (!isProductionHttpsUrl(trimmedValue)) {
    throw new Error(`${label} must be a production HTTPS URL.`);
  }

  const parsedUrl = new URL(trimmedValue);
  if ((parsedUrl.pathname && parsedUrl.pathname !== "/") || parsedUrl.search || parsedUrl.hash) {
    throw new Error(`${label} must be an origin without a path.`);
  }

  return parsedUrl.origin;
}

export function buildClerkFrontendApiUrlFromSiteDomain(siteDomain) {
  const trimmedSiteDomain = siteDomain?.trim();
  if (!trimmedSiteDomain) {
    throw new Error("Static site domain is required.");
  }

  const siteDomainWithProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedSiteDomain)
    ? trimmedSiteDomain
    : `https://${trimmedSiteDomain}`;
  const parsedSiteDomain = new URL(siteDomainWithProtocol);

  if (parsedSiteDomain.protocol !== "https:") {
    throw new Error("Static site domain must use HTTPS.");
  }

  if (parsedSiteDomain.port) {
    throw new Error("Static site domain must not include a port.");
  }

  const hostname = parsedSiteDomain.hostname.toLowerCase();
  const frontendApiUrl = `https://${clerkFrontendApiSubdomain}.${hostname}`;
  return normalizeProductionHttpsOrigin(frontendApiUrl, `Clerk Frontend API URL for ${hostname}`);
}

export function buildStaticFallbackClerkFrontendApiUrls(staticSiteConfigurations) {
  return staticSiteConfigurations
    .filter((siteConfiguration) => siteConfiguration.appKind === "client")
    .flatMap((siteConfiguration) => {
      const siteDomains = [siteConfiguration.domain, ...(siteConfiguration.domainAliases ?? [])];
      return siteDomains.map((siteDomain) => buildClerkFrontendApiUrlFromSiteDomain(siteDomain));
    });
}

export function collectVerifiedWorkspaceSiteClerkFrontendApiUrls(workspaceSites) {
  const clerkFrontendApiUrls = [];

  for (const workspaceSite of workspaceSites) {
    if (workspaceSite.clerkSatelliteAuthEnabled !== true) {
      continue;
    }
    if (workspaceSite.clerkSatelliteVerificationStatus !== "verified") {
      continue;
    }
    if (!hasNonEmptyValue(workspaceSite.clerkFrontendApiUrl)) {
      continue;
    }

    clerkFrontendApiUrls.push(
      normalizeProductionHttpsOrigin(
        workspaceSite.clerkFrontendApiUrl,
        `Workspace site ${workspaceSite.siteKey ?? "unknown"} Clerk Frontend API URL`,
      ),
    );
  }

  return clerkFrontendApiUrls;
}

export function dedupeClerkFrontendApiUrls(clerkFrontendApiUrls) {
  return [...new Set(clerkFrontendApiUrls)];
}

export function buildClerkFrontendApiAllowlist({
  primaryClerkFrontendApiUrl,
  workspaceSites = [],
  verifiedWorkspaceSiteClerkFrontendApiUrls = [],
  staticSiteConfigurations = [],
}) {
  const clerkFrontendApiUrls = [];

  if (hasNonEmptyValue(primaryClerkFrontendApiUrl)) {
    clerkFrontendApiUrls.push(
      normalizeProductionHttpsOrigin(primaryClerkFrontendApiUrl, "CLERK_FRONTEND_API_URL"),
    );
  }

  clerkFrontendApiUrls.push(...collectVerifiedWorkspaceSiteClerkFrontendApiUrls(workspaceSites));

  for (const verifiedWorkspaceSiteClerkFrontendApiUrl of verifiedWorkspaceSiteClerkFrontendApiUrls) {
    clerkFrontendApiUrls.push(
      normalizeProductionHttpsOrigin(
        verifiedWorkspaceSiteClerkFrontendApiUrl,
        "Verified workspace-site Clerk Frontend API URL",
      ),
    );
  }

  clerkFrontendApiUrls.push(...buildStaticFallbackClerkFrontendApiUrls(staticSiteConfigurations));

  return dedupeClerkFrontendApiUrls(clerkFrontendApiUrls);
}

export function parseJsonArrayFromConvexRunOutput(output) {
  const trimmedOutput = output.trim();
  if (!trimmedOutput) {
    return [];
  }

  const candidateJsonValues = [trimmedOutput, ...trimmedOutput.split(/\r?\n/).reverse()];
  const arrayStartIndex = trimmedOutput.lastIndexOf("[");
  const arrayEndIndex = trimmedOutput.lastIndexOf("]");
  if (arrayStartIndex >= 0 && arrayEndIndex > arrayStartIndex) {
    candidateJsonValues.push(trimmedOutput.slice(arrayStartIndex, arrayEndIndex + 1));
  }

  for (const candidateJsonValue of candidateJsonValues) {
    try {
      const parsedValue = JSON.parse(candidateJsonValue);
      if (!Array.isArray(parsedValue)) {
        continue;
      }

      return parsedValue.map((entry) => {
        if (typeof entry !== "string") {
          throw new Error("Convex returned a non-string Frontend API URL.");
        }

        return entry;
      });
    } catch {}
  }

  throw new Error("Unable to parse Convex Frontend API URL query output.");
}

export async function fetchVerifiedWorkspaceSiteClerkFrontendApiUrlsFromConvex({
  commandRunner = runCommandCapturingOutput,
  convexBackendDirectory = backendDirectory,
} = {}) {
  const { standardOutput } = await commandRunner(
    "bunx",
    ["convex", "run", "workspaces:listVerifiedClerkFrontendApiUrls", "{}", "--prod"],
    {
      cwd: convexBackendDirectory,
    },
  );

  return parseJsonArrayFromConvexRunOutput(standardOutput);
}

async function loadStaticSiteConfigurations() {
  const siteConfigModule = await import("../packages/sdk/src/site-config.ts");
  return Object.values(siteConfigModule.siteConfigurations);
}

async function buildProductionClerkFrontendApiAllowlist({
  environmentVariables = process.env,
  skipConvexQuery = false,
} = {}) {
  const staticSiteConfigurations = await loadStaticSiteConfigurations();
  let verifiedWorkspaceSiteClerkFrontendApiUrls = [];

  if (!skipConvexQuery) {
    try {
      verifiedWorkspaceSiteClerkFrontendApiUrls =
        await fetchVerifiedWorkspaceSiteClerkFrontendApiUrlsFromConvex();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Unable to load verified workspace-site Clerk Frontend API URLs from Convex; using static bootstrap fallback only.\n${message}`,
      );
    }
  }

  return buildClerkFrontendApiAllowlist({
    primaryClerkFrontendApiUrl: environmentVariables.CLERK_FRONTEND_API_URL ?? "",
    verifiedWorkspaceSiteClerkFrontendApiUrls,
    staticSiteConfigurations,
  });
}

async function main() {
  try {
    const shouldWriteGitHubEnvironment = process.argv.includes("--github-env");
    const shouldSkipConvexQuery = process.argv.includes("--skip-convex");
    const clerkFrontendApiAllowlist = await buildProductionClerkFrontendApiAllowlist({
      skipConvexQuery: shouldSkipConvexQuery,
    });

    if (clerkFrontendApiAllowlist.length === 0) {
      throw new Error("No Clerk Frontend API URLs were generated.");
    }

    const clerkFrontendApiAllowlistValue = clerkFrontendApiAllowlist.join(",");

    if (shouldWriteGitHubEnvironment) {
      const githubEnvironmentPath = process.env.GITHUB_ENV;
      if (!hasNonEmptyValue(githubEnvironmentPath)) {
        throw new Error("GITHUB_ENV is required when using --github-env.");
      }

      await appendFile(
        githubEnvironmentPath,
        `CLERK_FRONTEND_API_URLS=${clerkFrontendApiAllowlistValue}\n`,
      );
      console.log(
        `Generated CLERK_FRONTEND_API_URLS with ${clerkFrontendApiAllowlist.length} entries.`,
      );
      return;
    }

    console.log(clerkFrontendApiAllowlistValue);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
