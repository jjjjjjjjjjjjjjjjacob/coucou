import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const repositoryRootUrl = new URL("../../", import.meta.url);
const backendPackageUrl = new URL("packages/backend/package.json", repositoryRootUrl);
const backendTestDirectoryUrl = new URL("packages/backend/__tests__/", repositoryRootUrl);
const backendVitestConfiguration = readFileSync(
  new URL("packages/backend/vitest.config.ts", repositoryRootUrl),
  "utf8",
);
const backendPackage = JSON.parse(readFileSync(backendPackageUrl, "utf8"));

describe("backend test isolation", () => {
  it("runs Convex tests through the isolated Vitest Edge Runtime", () => {
    expect(backendPackage.scripts.test).toBe("vitest run");
    expect(backendPackage.scripts["test:run"]).toBe("vitest run");
    expect(backendVitestConfiguration).toContain('environment: "edge-runtime"');
    expect(backendVitestConfiguration).toContain('inline: ["convex-test"]');
  });

  it("does not load backend suites through bun:test", () => {
    const backendTestFilesUsingBunTest = readdirSync(backendTestDirectoryUrl)
      .filter((testFileName) => testFileName.endsWith(".test.ts"))
      .filter((testFileName) =>
        readFileSync(new URL(testFileName, backendTestDirectoryUrl), "utf8").includes("bun:test"),
      );

    expect(backendTestFilesUsingBunTest).toEqual([]);
  });
});
