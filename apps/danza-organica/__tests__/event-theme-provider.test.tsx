import { describe, expect, it } from "bun:test";
import type { CSSProperties } from "react";
import { EventThemeProvider } from "../components/event-theme-provider";
import { renderWithProviders, screen, waitFor } from "./test-wrapper";

describe("EventThemeProvider", () => {
  it("applies event tokens to the Danza shell and nested derivative surfaces", async () => {
    const originalOuterStyle = {
      "--tt-bg": "#17E1E5",
      "--tt-fg": "#0A0A0A",
      "--tt-accent": "#0A0A0A",
    } as CSSProperties;
    const originalNestedStyle = {
      "--tt-bg": "#17E1E5",
      "--tt-fg": "#0A0A0A",
      "--tt-accent": "#0A0A0A",
    } as CSSProperties;

    const renderedTheme = renderWithProviders(
      <div className="tt-root" data-testid="outer-theme" style={originalOuterStyle}>
        <EventThemeProvider
          event={{
            themeBackgroundColor: "#123456",
            themeTextColor: "#FEDCBA",
            themeAccentColor: "#FC7243",
          }}
        >
          <div>Event content</div>
        </EventThemeProvider>
        <div className="tt-root" data-testid="nested-theme" style={originalNestedStyle} />
      </div>,
    );

    const outerThemeElement = screen.getByTestId("outer-theme");
    const nestedThemeElement = screen.getByTestId("nested-theme");
    await waitFor(() => {
      expect(outerThemeElement.style.getPropertyValue("--tt-bg")).toBe("#123456");
    });
    expect(outerThemeElement.style.getPropertyValue("--tt-fg")).toBe("#FEDCBA");
    expect(outerThemeElement.style.getPropertyValue("--tt-accent")).toBe("#FC7243");
    expect(nestedThemeElement.style.getPropertyValue("--tt-bg")).toBe("#123456");
    expect(nestedThemeElement.style.getPropertyValue("--tt-fg")).toBe("#FEDCBA");
    expect(nestedThemeElement.style.getPropertyValue("--tt-accent")).toBe("#FC7243");

    renderedTheme.unmount();

    expect(outerThemeElement.style.getPropertyValue("--tt-bg")).toBe("#17E1E5");
    expect(outerThemeElement.style.getPropertyValue("--tt-fg")).toBe("#0A0A0A");
    expect(outerThemeElement.style.getPropertyValue("--tt-accent")).toBe("#0A0A0A");
    expect(nestedThemeElement.style.getPropertyValue("--tt-bg")).toBe("#17E1E5");
    expect(nestedThemeElement.style.getPropertyValue("--tt-fg")).toBe("#0A0A0A");
    expect(nestedThemeElement.style.getPropertyValue("--tt-accent")).toBe("#0A0A0A");
  });
});
