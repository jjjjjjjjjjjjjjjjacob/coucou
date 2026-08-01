import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    exclude: ["convex/_generated/**", "**/node_modules/**"],
    fakeTimers: {
      // The Convex scheduler drain helpers use real setImmediate callbacks to
      // yield while fake timeout queues are advanced explicitly.
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    },
    include: ["__tests__/**/*.test.ts"],
    passWithNoTests: false,
    reporters: ["default"],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
    testTimeout: 15_000,
  },
});
