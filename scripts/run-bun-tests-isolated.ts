const workspaceDirectory = process.cwd();
const testFilePatterns = [
  "**/*.test.js",
  "**/*.test.jsx",
  "**/*.test.mjs",
  "**/*.test.ts",
  "**/*.test.tsx",
];
const ignoredDirectoryPrefixes = [".next/", "dist/", "node_modules/"];
const discoveredTestFilePaths = new Set<string>();

for (const testFilePattern of testFilePatterns) {
  const testFileGlob = new Bun.Glob(testFilePattern);
  for await (const testFilePath of testFileGlob.scan({ cwd: workspaceDirectory })) {
    if (
      !ignoredDirectoryPrefixes.some((ignoredDirectoryPrefix) =>
        testFilePath.startsWith(ignoredDirectoryPrefix),
      )
    ) {
      discoveredTestFilePaths.add(testFilePath);
    }
  }
}

const standardTestFilePaths: string[] = [];
const moduleMockTestFilePaths: string[] = [];

for (const testFilePath of [...discoveredTestFilePaths].sort()) {
  const testFileContents = await Bun.file(`${workspaceDirectory}/${testFilePath}`).text();

  // Bun module mocks are process-wide. Isolate files that install their own
  // mocks so parallel file loading cannot leak replacements between suites.
  if (testFileContents.includes("mock.module(")) {
    moduleMockTestFilePaths.push(testFilePath);
  } else {
    standardTestFilePaths.push(testFilePath);
  }
}

async function runTestFiles(testFilePaths: string[]): Promise<void> {
  if (testFilePaths.length === 0) {
    return;
  }

  const testProcess = Bun.spawn([process.execPath, "test", ...testFilePaths], {
    cwd: workspaceDirectory,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const testProcessExitCode = await testProcess.exited;

  if (testProcessExitCode !== 0) {
    process.exit(testProcessExitCode);
  }
}

await runTestFiles(standardTestFilePaths);

for (const moduleMockTestFilePath of moduleMockTestFilePaths) {
  await runTestFiles([moduleMockTestFilePath]);
}
