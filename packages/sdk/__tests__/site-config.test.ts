import { describe, expect, it } from "bun:test";
import { siteConfigurations } from "../src/site-config";

describe("siteConfigurations", () => {
  it("keeps Dojo site routing separate from its Coucou workspace slug", () => {
    expect(siteConfigurations.dojo.siteKey).toBe("dojo");
    expect(siteConfigurations.dojo.workspaceSlug).toBe("dojo-pomodoro");
  });
});
