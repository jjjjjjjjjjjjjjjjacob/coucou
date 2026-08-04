import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPaletteProvider } from "../components/command-palette-provider";
import { CoucouLinearShell } from "../components/coucou-linear-shell";

const dashboardAppearanceStorageKey = "coucou-dashboard-appearance";
const dashboardLightModeClassName = "maison-dashboard-light";
const desktopViewportWidth = 1024;
const mobileViewportWidth = 390;

function setViewportWidth(viewportWidth: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: viewportWidth,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("dashboard mobile navigation", () => {
  beforeEach(() => {
    window.localStorage.removeItem(dashboardAppearanceStorageKey);
    setViewportWidth(mobileViewportWidth);
  });

  afterEach(() => {
    setViewportWidth(desktopViewportWidth);
    window.localStorage.removeItem(dashboardAppearanceStorageKey);
    document.documentElement.classList.remove(dashboardLightModeClassName);
  });

  it("opens the organizer navigation and exposes a synchronized light mode control", async () => {
    render(
      <CommandPaletteProvider>
        <CoucouLinearShell sidebar={<AppSidebar />} mobileTitle="Night Moves">
          <div>Dashboard content</div>
        </CoucouLinearShell>
      </CommandPaletteProvider>,
    );

    expect(screen.getByText("Night Moves")).toBeTruthy();
    expect(screen.getByText("Dashboard content")).toBeTruthy();

    await waitFor(() => {
      expect(screen.queryByText("Overview")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));

    expect(document.documentElement.classList.contains(dashboardLightModeClassName)).toBe(true);
    expect(window.localStorage.getItem(dashboardAppearanceStorageKey)).toBe("light");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    await waitFor(() => {
      expect(screen.getByText("Overview")).toBeTruthy();
      expect(screen.getByText("Events")).toBeTruthy();
      expect(screen.getByText("Door Scan")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
    });
  });
});
