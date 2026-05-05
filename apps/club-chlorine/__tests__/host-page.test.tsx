import { describe, expect, it } from "bun:test";

describe("Host Page", () => {
  it("keeps the host dashboard entrypoint in place", async () => {
    const hostPageFile = Bun.file(
      new URL("../app/host/page.tsx", import.meta.url),
    );

    expect(await hostPageFile.exists()).toBe(true);
  });
});
