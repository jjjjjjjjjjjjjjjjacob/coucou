import { describe, expect, it } from "bun:test";
import nextConfig from "../next.config";

const expectedCoucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

describe("Dojo Next.js redirects", () => {
  it("routes legacy admin entrypoints to the migrated Coucou workspace", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: "/admin",
        destination: `${expectedCoucouBaseUrl}/workspaces/dojo-pomodoro/dashboard`,
      }),
    );
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: "/door",
        destination: `${expectedCoucouBaseUrl}/workspaces/dojo-pomodoro/dashboard/door`,
      }),
    );
  });
});
