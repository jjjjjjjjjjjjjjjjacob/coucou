import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const repositoryRootUrl = new URL("../../", import.meta.url);
const repositoryPackage = JSON.parse(
  readFileSync(new URL("package.json", repositoryRootUrl), "utf8"),
);
const continuousIntegrationWorkflow = readFileSync(
  new URL(".github/workflows/ci.yml", repositoryRootUrl),
  "utf8",
);
const configuredBunVersion = repositoryPackage.packageManager.replace(/^bun@/, "");

function readWorkspacePackages() {
  return ["apps", "packages"].flatMap((workspaceParentDirectory) =>
    readdirSync(new URL(`${workspaceParentDirectory}/`, repositoryRootUrl), {
      withFileTypes: true,
    })
      .filter((directoryEntry) => directoryEntry.isDirectory())
      .map((directoryEntry) => {
        const workspacePackagePath = `${workspaceParentDirectory}/${directoryEntry.name}/package.json`;
        return {
          packagePath: workspacePackagePath,
          packageContents: JSON.parse(
            readFileSync(new URL(workspacePackagePath, repositoryRootUrl), "utf8"),
          ),
        };
      }),
  );
}

describe("Bun runtime alignment", () => {
  it("uses the packageManager Bun version in CI", () => {
    expect(repositoryPackage.packageManager).toMatch(/^bun@\d+\.\d+\.\d+$/);
    expect(continuousIntegrationWorkflow).toContain(`bun-version: "${configuredBunVersion}"`);
  });

  it("does not let a workspace dependency shadow the configured Bun runtime", () => {
    const dependencySections = [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ];
    const packagesWithBundledBunRuntime = readWorkspacePackages()
      .filter(({ packageContents }) =>
        dependencySections.some(
          (dependencySection) => packageContents[dependencySection]?.bun !== undefined,
        ),
      )
      .map(({ packagePath }) => packagePath);

    expect(packagesWithBundledBunRuntime).toEqual([]);
  });

  it("exposes a test script from every workspace so Turbo cannot skip a suite", () => {
    const packagesWithoutTestScript = readWorkspacePackages()
      .filter(({ packageContents }) => packageContents.scripts?.test === undefined)
      .map(({ packagePath }) => packagePath);

    expect(packagesWithoutTestScript).toEqual([]);
  });
});
