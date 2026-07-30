const testFilePatterns = ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"];
const discoveredTestFilePaths = new Set<string>();

for (const testFilePattern of testFilePatterns) {
  const testFileGlob = new Bun.Glob(testFilePattern);
  for await (const testFilePath of testFileGlob.scan({ cwd: import.meta.dir })) {
    discoveredTestFilePaths.add(testFilePath);
  }
}

const standardTestFilePaths: string[] = [];
const moduleMockTestFilePaths: string[] = [];

for (const testFilePath of [...discoveredTestFilePaths].sort()) {
  const testFileContents = await Bun.file(`${import.meta.dir}/${testFilePath}`).text();

  // Bun module mocks are process-wide. Run files that install their own module
  // mocks separately so parallel file loading cannot leak mocks between suites.
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
    cwd: import.meta.dir,
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
