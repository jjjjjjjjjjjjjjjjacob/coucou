import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  night: "#0B0D10",
  booth: "#171B23",
  paper: "#F3F0E8",
  steel: "#9AA0AA",
  rule: "#2B313C",
  admit: "#82A7FF",
  success: "#72D39B",
  warning: "#F6C56D",
  failure: "#FF8C87",
  transparent: "transparent",
} as const;

export const spacing = {
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 24,
  huge: 32,
} as const;

export const radii = {
  small: 6,
  medium: 10,
  large: 16,
  pill: 999,
} as const;

export const typography = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  mono: "GeistMono_500Medium",
} as const;

export const minimumTargetStyle: ViewStyle = {
  minHeight: 48,
  minWidth: 48,
};

export const screenTitleStyle: TextStyle = {
  color: colors.paper,
  fontFamily: typography.semibold,
  fontSize: 28,
  lineHeight: 34,
};

export const eyebrowStyle: TextStyle = {
  color: colors.steel,
  fontFamily: typography.mono,
  fontSize: 11,
  lineHeight: 16,
  letterSpacing: 1.1,
  textTransform: "uppercase",
};
