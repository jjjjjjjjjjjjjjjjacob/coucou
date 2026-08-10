import { describe, expect, it } from "bun:test";
import { buildEventThemeStyle, getEventThemeColors } from "../src/theming/build-event-theme";

describe("event theme accent colors", () => {
  it("normalizes explicit accent overrides", () => {
    expect(
      getEventThemeColors({
        themeBackgroundColor: "17e1e5",
        themeTextColor: "0a0a0a",
        themeAccentColor: "fc7243",
      }),
    ).toEqual({
      backgroundColor: "#17E1E5",
      textColor: "#0A0A0A",
      accentColor: "#FC7243",
    });
  });

  it("falls back to the resolved text color when accent is absent or invalid", () => {
    expect(
      getEventThemeColors(
        { themeAccentColor: "orange" },
        { backgroundColor: "#17E1E5", textColor: "#0A0A0A", accentColor: "#FC7243" },
      ),
    ).toEqual({
      backgroundColor: "#17E1E5",
      textColor: "#0A0A0A",
      accentColor: "#0A0A0A",
    });
  });

  it("keeps typography on text while assigning action tokens to accent", () => {
    const style = buildEventThemeStyle({
      themeBackgroundColor: "#17E1E5",
      themeTextColor: "#0A0A0A",
      themeAccentColor: "#FC7243",
    }) as Record<string, string | undefined>;

    expect(style["--foreground"]).toBe("#0A0A0A");
    expect(style["--primary"]).toBe("#FC7243");
    expect(style["--accent"]).toBe("#FC7243");
    expect(style["--ring"]).toBe("#FC7243");
    expect(style["--primary-foreground"]).toBe("#000000");
  });
});
