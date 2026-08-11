import { describe, expect, it } from "vitest";
import {
  BAUHAUS_PARTNER_LOGO_SOURCES,
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
  formatCompactBauhausDate,
  resolveBauhausEventDisplaySettings,
  splitBauhausHostLines,
} from "@/lib/bauhaus-event-display";

describe("Bauhaus event display settings", () => {
  it("defaults to the centered orange invitation with black dots", () => {
    expect(resolveBauhausEventDisplaySettings(new URLSearchParams())).toEqual(
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
    );
    expect(DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS).toEqual({
      position: "center",
      textColor: "orange",
      highlightColor: "none",
      logoVariant: "tealorange",
      dotColor: "black",
      preset: "simple",
      infoDensity: "minimal",
    });
  });

  it("accepts the supported search parameter variants", () => {
    const searchParameters = new URLSearchParams(
      "position=left&text=white&highlight=black&logo=blackwhite&dots=white&preset=simple&info=verbose",
    );

    expect(resolveBauhausEventDisplaySettings(searchParameters)).toEqual({
      position: "left",
      textColor: "white",
      highlightColor: "black",
      logoVariant: "blackwhite",
      dotColor: "white",
      preset: "simple",
      infoDensity: "verbose",
    });
  });

  it("falls back independently when a search parameter is unsupported", () => {
    const searchParameters = new URLSearchParams(
      "position=right&text=purple&highlight=transparent&logo=purple&dots=teal&preset=poster&info=full",
    );

    expect(resolveBauhausEventDisplaySettings(searchParameters)).toEqual(
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
    );
  });

  it("accepts the black-and-orange partner treatment", () => {
    expect(
      resolveBauhausEventDisplaySettings(new URLSearchParams("logo=blackorange")).logoVariant,
    ).toBe("blackorange");
  });

  it("accepts orange text and no highlight", () => {
    const settings = resolveBauhausEventDisplaySettings(
      new URLSearchParams("text=orange&highlight=none"),
    );

    expect(settings.textColor).toBe("orange");
    expect(settings.highlightColor).toBe("none");
  });

  it("makes the simple preset minimal unless verbose info is requested", () => {
    const simpleSettings = resolveBauhausEventDisplaySettings(new URLSearchParams("preset=simple"));
    const verboseSimpleSettings = resolveBauhausEventDisplaySettings(
      new URLSearchParams("preset=simple&info=verbose"),
    );
    const boldSettings = resolveBauhausEventDisplaySettings(new URLSearchParams("preset=bold"));

    expect(simpleSettings.infoDensity).toBe("minimal");
    expect(verboseSimpleSettings.infoDensity).toBe("verbose");
    expect(boldSettings.infoDensity).toBe("verbose");
  });

  it("formats the simple preset date as abbreviated weekday, month, and day", () => {
    expect(formatCompactBauhausDate(Date.UTC(2026, 7, 21, 21), "UTC")).toBe("FRI 08.21");
  });

  it("maps every logo treatment to its public partner assets", () => {
    expect(BAUHAUS_PARTNER_LOGO_SOURCES.tealorange).toEqual({
      "nothing radio": "/partners/nothing-radio.png",
      "the market": "/partners/the-market-danza.svg",
    });
    expect(BAUHAUS_PARTNER_LOGO_SOURCES.blackwhite).toEqual({
      "nothing radio": "/partners/nothing-radio-black-white.svg",
      "the market": "/partners/the-market-wordmark-black-white.svg",
    });
    expect(BAUHAUS_PARTNER_LOGO_SOURCES.blackorange).toEqual({
      "nothing radio": "/partners/nothing-radio-black-orange.svg",
      "the market": "/partners/the-market-wordmark-black-orange.svg",
    });
    expect(BAUHAUS_PARTNER_LOGO_SOURCES.tealblack).toEqual({
      "nothing radio": "/partners/nothing-radio-teal-black.svg",
      "the market": "/partners/the-market-wordmark-teal-black.svg",
    });
  });

  it("keeps the Vol. 4 host break between Kelsey and Elsb3th", () => {
    expect(
      splitBauhausHostLines([
        "Toma Shade",
        "Luis V",
        "Alegra",
        "Kelsey",
        "Elsb3th",
        "Gio",
        "Carter H",
      ]),
    ).toEqual(["Toma Shade · Luis V · Alegra · Kelsey", "Elsb3th · Gio · Carter H"]);
  });
});
