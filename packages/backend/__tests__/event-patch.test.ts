import { describe, expect, it } from "bun:test";
import { applyEventUnsetFields } from "../convex/lib/eventPatch";

describe("event patch helpers", () => {
  it("preserves omitted fields and clears only explicit unset fields", () => {
    const patch = applyEventUnsetFields(
      {
        updatedAt: 123,
        name: "Pool Night",
      },
      ["primaryFieldConfig", "guestPortalLinkUrl"],
    );

    expect(patch).toEqual({
      updatedAt: 123,
      name: "Pool Night",
      primaryFieldConfig: undefined,
      guestPortalLinkUrl: undefined,
    });
    expect("customFields" in patch).toBe(false);
  });
});
