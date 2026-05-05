import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarProvider } from "../components/ui/sidebar";

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
});
