import { describe, expect, it } from "bun:test";
import { buildEventReferralShareButtonThemeStyle } from "../lib/event-referral-share-theme";
import { buildEventThemeStyle } from "../lib/event-theme";

describe("Danza Organica event theming", () => {
  it("carries event colors into shadcn and tenant-template tokens", () => {
    const themeStyle = buildEventThemeStyle({
      themeBackgroundColor: "#123456",
      themeTextColor: "#FEDCBA",
    }) as Record<string, string | undefined>;

    expect(themeStyle["--background"]).toBe("#123456");
    expect(themeStyle["--primary"]).toBe("#FEDCBA");
    expect(themeStyle["--tt-bg"]).toBe("#123456");
    expect(themeStyle["--tt-fg"]).toBe("#FEDCBA");
    expect(themeStyle["--tt-button-radius"]).toBe("8px");
  });

  it("keeps neutral card and popover surfaces outside event takeovers", () => {
    const themeStyle = buildEventThemeStyle({
      themeBackgroundColor: "#123456",
      themeTextColor: "#FEDCBA",
    }) as Record<string, string | undefined>;

    expect(themeStyle["--card"]).toBeUndefined();
    expect(themeStyle["--card-foreground"]).toBeUndefined();
    expect(themeStyle["--popover"]).toBeUndefined();
    expect(themeStyle["--popover-foreground"]).toBeUndefined();
  });

  it("reserves the explicit accent while keeping shared controls text-colored", () => {
    const themeStyle = buildEventThemeStyle({
      themeBackgroundColor: "#17E1E5",
      themeTextColor: "#0A0A0A",
      themeAccentColor: "#FC7243",
    }) as Record<string, string | undefined>;

    expect(themeStyle["--foreground"]).toBe("#0A0A0A");
    expect(themeStyle["--primary"]).toBe("#0A0A0A");
    expect(themeStyle["--ring"]).toBe("#0A0A0A");
    expect(themeStyle["--destructive"]).toBe("#B91C1C");
    expect(themeStyle["--tt-fg"]).toBe("#0A0A0A");
    expect(themeStyle["--tt-accent"]).toBe("#FC7243");
  });

  it("uses the event accent for referral share borders and strokes", () => {
    expect(buildEventReferralShareButtonThemeStyle("outline")).toEqual({
      backgroundColor: "transparent",
      borderColor: "var(--tt-accent, var(--accent))",
      color: "var(--tt-accent, var(--accent))",
    });
    expect(buildEventReferralShareButtonThemeStyle("prominent")).toEqual({
      backgroundColor: "var(--tt-fg, var(--foreground))",
      borderColor: "var(--tt-accent, var(--accent))",
      borderStyle: "solid",
      borderWidth: 1,
      color: "var(--tt-accent, var(--accent))",
    });
  });
});
