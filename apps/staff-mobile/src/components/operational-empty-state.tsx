import { StyleSheet, Text, View } from "react-native";
import { ThresholdMark } from "@/components/threshold-mark";
import { colors, spacing, typography } from "@/theme";

interface OperationalEmptyStateProps {
  title: string;
  message: string;
}

export function OperationalEmptyState({
  title,
  message,
}: OperationalEmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.container}>
      <ThresholdMark color={colors.warning} height={56} />
      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.large,
    paddingHorizontal: spacing.extraLarge,
  },
  text: {
    maxWidth: 300,
    gap: spacing.small,
  },
  title: {
    color: colors.paper,
    fontFamily: typography.semibold,
    fontSize: 22,
  },
  message: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 15,
    lineHeight: 22,
  },
});
