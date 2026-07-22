import { describe, expect, it } from "bun:test";
import { isPresetKey, PRESET_DEFINITIONS, PRESET_KEYS } from "../src/theming/presets";
import { resolvePreset } from "../src/theming/resolve-preset";

describe("danza preset", () => {
  it("is a registered preset key", () => {
    expect(isPresetKey("danza")).toBe(true);
    expect(PRESET_KEYS).toContain("danza");
  });

  it("keeps the dojo typography treatment with teal/black colors", () => {
    const danzaPreset = PRESET_DEFINITIONS.danza;
    const dojoPreset = PRESET_DEFINITIONS.dojo;

    expect(danzaPreset.bg).toBe("#2EC4B6");
    expect(danzaPreset.fg).toBe("#0A0A0A");
    expect(danzaPreset.accent).toBe("#0A0A0A");
    expect(danzaPreset.display).toBe(dojoPreset.display);
    expect(danzaPreset.titleSize).toBe(dojoPreset.titleSize);
    expect(danzaPreset.upper).toBe(dojoPreset.upper);
    expect(danzaPreset.ctaShape).toBe(dojoPreset.ctaShape);
    expect(danzaPreset.buttonRadius).toBe(dojoPreset.buttonRadius);
  });

  it("resolves teal/black tenant-template tokens for the danza site preset", () => {
    const resolvedPreset = resolvePreset({ siteConfigurationPreset: "danza" });

    expect(resolvedPreset.key).toBe("danza");
    expect(resolvedPreset.styleVars["--tt-bg"]).toBe("#2EC4B6");
    expect(resolvedPreset.styleVars["--tt-fg"]).toBe("#0A0A0A");
    expect(resolvedPreset.styleVars["--tt-button-radius"]).toBe("8px");
  });
});
