import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { colors, minimumTargetStyle, radii, spacing, typography } from "@/theme";

interface ActionButtonProps extends Omit<PressableProps, "style"> {
  label: string;
  variant?: "primary" | "secondary" | "danger" | "quiet";
  isLoading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ActionButton({
  label,
  variant = "primary",
  isLoading = false,
  disabled,
  style,
  ...pressableProps
}: ActionButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || isLoading}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && styles.pressed,
        (disabled || isLoading) && styles.disabled,
        style,
      ]}
      {...pressableProps}
    >
      {isLoading ? (
        <ActivityIndicator color={variant === "primary" ? colors.night : colors.paper} />
      ) : (
        <Text
          allowFontScaling
          style={[
            styles.label,
            variant === "primary" && styles.primaryLabel,
            variant === "danger" && styles.dangerLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    ...minimumTargetStyle,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.medium,
    paddingHorizontal: spacing.large,
  },
  primary: {
    backgroundColor: colors.admit,
  },
  secondary: {
    backgroundColor: colors.booth,
    borderColor: colors.rule,
    borderWidth: StyleSheet.hairlineWidth,
  },
  danger: {
    backgroundColor: colors.booth,
    borderColor: colors.failure,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quiet: {
    backgroundColor: colors.transparent,
  },
  label: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 15,
    lineHeight: 20,
  },
  primaryLabel: {
    color: colors.night,
  },
  dangerLabel: {
    color: colors.failure,
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.42,
  },
});
