import type { PropsWithChildren, ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  colors,
  eyebrowStyle,
  screenTitleStyle,
  spacing,
} from "@/theme";

interface AppScreenProps extends PropsWithChildren {
  title: string;
  eyebrow?: string;
  headerAccessory?: ReactNode;
  scroll?: boolean;
  scrollViewProps?: ScrollViewProps;
}

export function AppScreen({
  title,
  eyebrow,
  headerAccessory,
  scroll = false,
  scrollViewProps,
  children,
}: AppScreenProps): React.JSX.Element {
  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.headerText}>
          {eyebrow ? <Text style={eyebrowStyle}>{eyebrow}</Text> : null}
          <Text allowFontScaling style={screenTitleStyle}>
            {title}
          </Text>
        </View>
        {headerAccessory}
      </View>
      {children}
    </>
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          {...scrollViewProps}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.content}>{content}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.night,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.large,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.large,
    paddingBottom: spacing.huge,
  },
  header: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.medium,
  },
  headerText: {
    flex: 1,
    gap: spacing.extraSmall,
  },
});
