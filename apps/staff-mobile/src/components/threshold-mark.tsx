import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "@/theme";

interface ThresholdMarkProps {
  color?: string;
  height?: number;
  style?: ViewStyle;
}

export function ThresholdMark({
  color = colors.admit,
  height = 32,
  style,
}: ThresholdMarkProps): React.JSX.Element {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.track, { height }, style]}
    >
      <View style={[styles.light, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 5,
    overflow: "hidden",
    backgroundColor: colors.rule,
  },
  light: {
    width: 2,
    height: "100%",
  },
});
