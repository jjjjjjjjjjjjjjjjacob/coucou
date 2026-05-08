import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { AdminShell } from "./admin-shell";

describe("AdminShell", () => {
  beforeAll(() => {
    GlobalRegistrator.register({ url: "http://localhost:3000" });
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    GlobalRegistrator.unregister();
  });

  it("uses the maison obscur preset", () => {
    const { container } = render(
      <AdminShell sidebar={<nav>Navigation</nav>}>Admin content</AdminShell>,
    );

    expect(container.querySelector('[data-preset="maison"]')).toBeTruthy();
    expect(container.textContent).toContain("Admin content");
  });
});
