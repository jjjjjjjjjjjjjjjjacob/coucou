import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { TenantLegalFooter } from "./tenant-legal-footer";

describe("TenantLegalFooter", () => {
  beforeAll(() => {
    GlobalRegistrator.register({ url: "http://localhost:3000" });
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  it("protects legal text with preset-colored highlights over background artwork", () => {
    const { container, getByRole } = render(
      <TenantLegalFooter preset="danza" showBrand={false} highlightContent />,
    );

    const footer = container.querySelector("footer");
    const termsLink = getByRole("link", { name: "Terms" });

    expect(footer?.style.background).toBe("transparent");
    expect(footer?.style.position).toBe("relative");
    expect(footer?.style.zIndex).toBe("1");
    expect(termsLink.style.background).toBe("var(--tt-bg)");
    expect(termsLink.style.color).toBe("var(--tt-fg)");
  });
});
