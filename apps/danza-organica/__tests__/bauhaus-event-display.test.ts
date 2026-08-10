import { describe, expect, it } from "vitest";
import {
  BAUHAUS_PARTNER_LOGO_SOURCES,
  DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
  resolveBauhausEventDisplaySettings,
  splitBauhausHostLines,
} from "@/lib/bauhaus-event-display";

describe("Bauhaus event display settings", () => {
  it("defaults to a centered black-on-teal composition", () => {
    expect(resolveBauhausEventDisplaySettings(new URLSearchParams())).toEqual(
      DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
    );
    expect(DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS.logoVariant).toBe("tealblack");
  });

  it("accepts the supported search parameter variants", () => {
    const searchParameters = new URLSearchParams(
      "position=left&text=white&highlight=black&logo=blackwhite",
    );

    expect(resolveBauhausEventDisplaySettings(searchParameters)).toEqual({
      position: "left",
      textColor: "white",
      highlightColor: "black",
      logoVariant: "blackwhite",
    });
  });

  it("falls back independently when a search parameter is unsupported", () => {
    const searchParameters = new URLSearchParams(
      "position=right&text=orange&highlight=transparent&logo=purple",
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
