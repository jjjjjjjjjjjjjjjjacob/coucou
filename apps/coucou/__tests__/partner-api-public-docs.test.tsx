import { describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";

mock.module("next/navigation", () => ({
  usePathname: () => "/docs/partner-api",
}));

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceOperationPath: (_surface: string, pathname = "") => (pathname ? `/${pathname}` : "/"),
  useWorkspaceScope: () => null,
}));

const { default: PartnerApiPublicDocumentationPage } = await import("../app/docs/partner-api/page");

describe("public partner API documentation", () => {
  it("renders without a workspace session", () => {
    render(<PartnerApiPublicDocumentationPage />);

    expect(screen.getByText("Partner API documentation")).toBeTruthy();
    expect(screen.getByText("Configuration guides")).toBeTruthy();
    expect(screen.getByText("Coucou-managed RSVP and SMS")).toBeTruthy();
    expect(screen.queryByText("Loading workspace…")).toBeNull();
  });
});
