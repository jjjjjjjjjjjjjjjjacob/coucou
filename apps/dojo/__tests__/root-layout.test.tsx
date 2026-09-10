import { describe, expect, it, mock } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const replaceLocation = mock((_url: string) => {});
Object.defineProperty(window.location, "replace", { configurable: true, value: replaceLocation });
process.env.NEXT_PUBLIC_DOJO_CLERK_ORGANIZATION_ID = "org_123";
const passthrough = ({ children }: { children: ReactNode }) => children;
let clerkProps: { domain: string; signInUrl: string } | undefined;
mock.module("@clerk/nextjs", () => ({
  ClerkProvider: (properties: { children: ReactNode; domain: string; signInUrl: string }) => {
    clerkProps = properties;
    return properties.children;
  },
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { organizationMemberships: [{ role: "org:admin", organization: { id: "org_123" } }] },
  }),
}));
mock.module("next/font/google", () => ({
  Geist: () => ({ variable: "geist" }),
  Geist_Mono: () => ({ variable: "geist-mono" }),
  Noto_Emoji: () => ({ variable: "noto-emoji" }),
}));
mock.module("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:5678" }),
}));
mock.module("../app/providers", () => ({ default: passthrough }));
mock.module("../app/app-chrome", () => ({ AppChrome: passthrough }));
const { default: RootLayout } = await import("../app/layout");

describe("Dojo public root layout", () => {
  it("lets an admin visit the public homepage and configures Clerk for the request host", async () => {
    const layout = await RootLayout({ children: <h1>Public featured event</h1> });
    // Render the provider tree inside the document shell returned by the server layout.
    render(layout.props.children.props.children);
    expect(screen.getByRole("heading", { name: "Public featured event" })).toBeInTheDocument();
    expect(replaceLocation).not.toHaveBeenCalled();
    expect(clerkProps?.domain).toBe("localhost:5678");
    expect(new URL(clerkProps?.signInUrl ?? "").origin).toBe("http://localhost:5680");
  });
});
