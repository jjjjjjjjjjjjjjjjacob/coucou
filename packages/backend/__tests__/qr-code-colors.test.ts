import { describe, expect, it } from "bun:test";
import { resolveQrCodeColors } from "@coucou/sdk/shared/qr-code-colors";

describe("resolveQrCodeColors in Convex QR generation", () => {
  it("normalizes provided colors before QR images are generated", () => {
    const qrCodeColors = resolveQrCodeColors({
      foregroundColor: "ef4444",
      backgroundColor: "ffffff",
    });

    expect(qrCodeColors).toEqual({
      foregroundColor: "#EF4444",
      backgroundColor: "#FFFFFF",
    });
  });

  it("keeps the theme colors aligned with the browser when a white foreground is chosen", () => {
    const qrCodeColors = resolveQrCodeColors({
      foregroundColor: "#FFFFFF",
      backgroundColor: "#D14D43",
    });

    expect(qrCodeColors).toEqual({
      foregroundColor: "#FFFFFF",
      backgroundColor: "#D14D43",
    });
  });
});
