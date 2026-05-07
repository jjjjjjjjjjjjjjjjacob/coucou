import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarProvider } from "../components/ui/sidebar";

const dashboardAppearanceStorageKey = "coucou-dashboard-appearance";
const dashboardLightModeClassName = "maison-dashboard-light";

interface ClerkTestStateSetter {
  __setClerkTestState?: (nextState: { isSignedIn: boolean }) => void;
}

function renderSidebar(canWrite: boolean) {
  return render(
    <SidebarProvider>
      <AppSidebar canWrite={canWrite} />
    </SidebarProvider>,
  );
}

describe("AppSidebar tenant role navigation", () => {
  it("shows all dashboard sections to write roles", () => {
    renderSidebar(true);

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Events")).toBeTruthy();
    expect(screen.getByText("RSVPs")).toBeTruthy();
    expect(screen.getByText("Text Blasts")).toBeTruthy();
    expect(screen.getByText("Texts")).toBeTruthy();
    expect(screen.getByText("Users")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.getByText("Door Scan")).toBeTruthy();
    expect(screen.getByText("Door List")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("New Event")).toBeTruthy();
  });

  it("shows only read, door, and settings sections to read roles", () => {
    renderSidebar(false);

    expect(screen.getByText("RSVPs")).toBeTruthy();
    expect(screen.getByText("Door Scan")).toBeTruthy();
    expect(screen.getByText("Door List")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.queryByText("Overview")).toBeNull();
    expect(screen.queryByText("Events")).toBeNull();
    expect(screen.queryByText("Text Blasts")).toBeNull();
    expect(screen.queryByText("Texts")).toBeNull();
    expect(screen.queryByText("Users")).toBeNull();
    expect(screen.queryByText("Analytics")).toBeNull();
    expect(screen.queryByText("New Event")).toBeNull();
  });

  it("toggles the dashboard light mode from the sidebar footer", () => {
    window.localStorage.removeItem(dashboardAppearanceStorageKey);

    renderSidebar(true);

    const appearanceToggleButton = screen.getByRole("button", {
      name: "Switch to light mode",
    });

    fireEvent.click(appearanceToggleButton);

    expect(
      document.documentElement.classList.contains(dashboardLightModeClassName),
    ).toBe(true);
    expect(window.localStorage.getItem(dashboardAppearanceStorageKey)).toBe(
      "light",
    );
    expect(
      screen
        .getByRole("button", { name: "Switch to dark mode" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("does not render fallback user badge text when user data is missing", () => {
    (globalThis as typeof globalThis & ClerkTestStateSetter)
      .__setClerkTestState?.({ isSignedIn: false });

    renderSidebar(true);

    expect(screen.queryByText("Host")).toBeNull();
    expect(screen.queryByText("host@example.com")).toBeNull();
  });
});
