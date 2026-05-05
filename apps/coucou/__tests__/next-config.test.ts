import { describe, expect, it } from "bun:test";
import nextConfig from "../next.config";

describe("Coucou route redirects", () => {
  it("does not redirect user account routes to admin", async () => {
    const redirects = await nextConfig.redirects?.();
    const redirectSources = redirects?.map((redirect) => redirect.source) ?? [];

    expect(redirectSources).not.toContain("/profile");
    expect(redirectSources).not.toContain("/account");
  });

  it("redirects legacy workspace host and door routes to dashboard routes", async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toContainEqual({
      source: "/workspaces/:workspaceSlug/host/:path*",
      destination: "/workspaces/:workspaceSlug/dashboard/:path*",
      permanent: false,
    });
    expect(redirects).toContainEqual({
      source: "/workspaces/:workspaceSlug/door/:path*",
      destination: "/workspaces/:workspaceSlug/dashboard/door/:path*",
      permanent: false,
    });
  });
});
