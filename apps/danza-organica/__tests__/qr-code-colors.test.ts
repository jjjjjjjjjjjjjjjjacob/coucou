import { describe, expect, it } from "bun:test";
import {
  DEFAULT_QR_CODE_BACKGROUND_COLOR,
  DEFAULT_QR_CODE_FOREGROUND_COLOR,
  resolveQrCodeColors,
} from "@coucou/sdk/shared/qr-code-colors";

describe("resolveQrCodeColors", () => {
  it("uses the provided event theme colors for guest QR codes", () => {
    const qrCodeColors = resolveQrCodeColors({
      foregroundColor: "#ffffff",
      backgroundColor: "#d14d43",
    });

    expect(qrCodeColors).toEqual({
      foregroundColor: "#FFFFFF",
      backgroundColor: "#D14D43",
    });
  });

  it("falls back to default theme colors when inputs are missing", () => {
    const qrCodeColors = resolveQrCodeColors({});

    expect(qrCodeColors).toEqual({
      foregroundColor: DEFAULT_QR_CODE_FOREGROUND_COLOR,
      backgroundColor: DEFAULT_QR_CODE_BACKGROUND_COLOR,
    });
  });

  it("falls back to default theme colors when inputs are invalid", () => {
    const qrCodeColors = resolveQrCodeColors({
      foregroundColor: "white",
      backgroundColor: "red",
    });

    expect(qrCodeColors).toEqual({
      foregroundColor: DEFAULT_QR_CODE_FOREGROUND_COLOR,
      backgroundColor: DEFAULT_QR_CODE_BACKGROUND_COLOR,
    });
  });
});
