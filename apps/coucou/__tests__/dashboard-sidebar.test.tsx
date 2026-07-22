import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPaletteProvider } from "../components/command-palette-provider";
import { DashboardTitleBar } from "../components/dashboard-title-bar";
import { SidebarProvider } from "../components/ui/sidebar";

const dashboardAppearanceStorageKey = "coucou-dashboard-appearance";
const dashboardLightModeClassName = "maison-dashboard-light";

interface ClerkTestStateSetter {
  __setClerkTestState?: (nextState: { isSignedIn: boolean }) => void;
}

function renderSidebar(canWrite: boolean) {
  return render(
    <CommandPaletteProvider>
      <SidebarProvider>
        <AppSidebar canWrite={canWrite} />
      </SidebarProvider>
    </CommandPaletteProvider>,
  );
}

describe("AppSidebar tenant role navigation", () => {
  it("shows all dashboard sections to write roles", () => {
    renderSidebar(true);

    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Events")).toBeTruthy();
    expect(screen.getByText("Guests")).toBeTruthy();
    expect(screen.getByText("Text Blasts")).toBeTruthy();
    expect(screen.getByText("Texts")).toBeTruthy();
    expect(screen.getByText("Analytics")).toBeTruthy();
    expect(screen.getByText("Door Scan")).toBeTruthy();
    expect(screen.getByText("Door List")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("New Event")).toBeTruthy();
    expect(screen.queryByText("Users")).toBeNull();
  });

  it("shows only read, door, and settings sections to read roles", () => {
    renderSidebar(false);

    expect(screen.getByText("Door Scan")).toBeTruthy();
    expect(screen.getByText("Door List")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.queryByText("Overview")).toBeNull();
    expect(screen.queryByText("Events")).toBeNull();
    expect(screen.queryByText("Guests")).toBeNull();
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

    expect(document.documentElement.classList.contains(dashboardLightModeClassName)).toBe(true);
    expect(window.localStorage.getItem(dashboardAppearanceStorageKey)).toBe("light");
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("toggles the expanded sidebar from the footer", () => {
    renderSidebar(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  });

  it("links the Workspace breadcrumb to the overview", () => {
    render(
      <DashboardTitleBar
        title="Events"
        breadcrumb={[{ label: "Workspace" }, { label: "Events" }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Workspace" }).getAttribute("href")).toBe("/host");
  });

  it("does not render fallback user badge text when user data is missing", () => {
    (globalThis as typeof globalThis & ClerkTestStateSetter).__setClerkTestState?.({
      isSignedIn: false,
    });

    renderSidebar(true);

    expect(screen.queryByText("Host")).toBeNull();
    expect(screen.queryByText("host@example.com")).toBeNull();
  });
});
