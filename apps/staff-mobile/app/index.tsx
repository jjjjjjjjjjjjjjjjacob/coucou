import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { colors } from "@/theme";

export default function IndexScreen(): React.JSX.Element {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.admit} size="large" />
      </View>
    );
  }

  return isSignedIn ? (
    <Redirect href="/(tabs)/scan" />
  ) : (
    <Redirect href="/sign-in" />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.night,
  },
});
