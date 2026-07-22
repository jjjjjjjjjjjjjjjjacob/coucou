import { describe, expect, it } from "bun:test";
import { siteConfigurations } from "../src/site-config";

describe("siteConfigurations", () => {
  it("keeps Dojo site routing separate from its Coucou workspace slug", () => {
    expect(siteConfigurations.dojo.siteKey).toBe("dojo");
    expect(siteConfigurations.dojo.workspaceSlug).toBe("dojo-pomodoro");
  });

  it("registers Danza Organica as a client site on the danza preset", () => {
    expect(siteConfigurations["danza-organica"].siteKey).toBe("danza-organica");
    expect(siteConfigurations["danza-organica"].workspaceSlug).toBe("danza-organica");
    expect(siteConfigurations["danza-organica"].domain).toBe("https://danzaorganica.coucou.events");
    expect(siteConfigurations["danza-organica"].appKind).toBe("client");
    expect(siteConfigurations["danza-organica"].preset).toBe("danza");
  });
});
