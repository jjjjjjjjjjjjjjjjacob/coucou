import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "@/theme";

interface StatusPillProps {
  label: string;
  tone?: "neutral" | "success" | "warning" | "failure" | "admit";
}

const toneColors: Record<NonNullable<StatusPillProps["tone"]>, string> = {
  neutral: colors.steel,
  success: colors.success,
  warning: colors.warning,
  failure: colors.failure,
  admit: colors.admit,
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps): React.JSX.Element {
  const toneColor = toneColors[tone];
  return (
    <View style={[styles.container, { borderColor: toneColor }]}>
      <Text allowFontScaling numberOfLines={1} style={[styles.label, { color: toneColor }]}>
        {label.replaceAll("_", " ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 24,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.small,
  },
  label: {
    fontFamily: typography.mono,
    fontSize: 10,
    lineHeight: 14,
    textTransform: "uppercase",
  },
});
