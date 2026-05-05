const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{6})$/;

export const DEFAULT_QR_CODE_BACKGROUND_COLOR = "#FFFFFF";
export const DEFAULT_QR_CODE_FOREGROUND_COLOR = "#EF4444";

export interface QrCodeColorSource {
  backgroundColor?: string | null;
  foregroundColor?: string | null;
}

export function normalizeQrCodeHexColor(
  value: string | null | undefined,
): string | undefined {
  if (!value) return undefined;

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) return undefined;

  const normalizedValue = trimmedValue.startsWith("#")
    ? trimmedValue
    : `#${trimmedValue}`;

  if (!HEX_COLOR_PATTERN.test(normalizedValue)) {
    return undefined;
  }

  return `#${normalizedValue.slice(1).toUpperCase()}`;
}

export function resolveQrCodeColors(
  source: QrCodeColorSource | null | undefined,
): {
  backgroundColor: string;
  foregroundColor: string;
} {
  return {
    backgroundColor:
      normalizeQrCodeHexColor(source?.backgroundColor) ??
      DEFAULT_QR_CODE_BACKGROUND_COLOR,
    foregroundColor:
      normalizeQrCodeHexColor(source?.foregroundColor) ??
      DEFAULT_QR_CODE_FOREGROUND_COLOR,
  };
}
