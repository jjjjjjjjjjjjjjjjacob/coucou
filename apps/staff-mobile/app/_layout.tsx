import { ClerkProvider, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StaffSessionProvider } from "@/providers/staff-session-provider";
import { colors, spacing, typography } from "@/theme";

void SplashScreen.preventAutoHideAsync();

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

export default function RootLayout(): React.JSX.Element {
  const [fontsLoaded, fontError] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_500Medium,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return <View style={styles.loading} />;
  }

  if (!clerkPublishableKey || !convexClient) {
    return (
      <SafeAreaProvider>
        <View style={styles.configurationError}>
          <Text style={styles.configurationTitle}>Configuration required</Text>
          <Text style={styles.configurationBody}>
            Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY and EXPO_PUBLIC_CONVEX_URL to
            apps/staff-mobile/.env.local, then restart Metro.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
        <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
          <StaffSessionProvider>
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                animation: "fade",
                contentStyle: { backgroundColor: colors.night },
                headerShown: false,
              }}
            />
          </StaffSessionProvider>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.night,
  },
  configurationError: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.medium,
    backgroundColor: colors.night,
    padding: spacing.extraLarge,
  },
  configurationTitle: {
    color: colors.failure,
    fontFamily: typography.semibold,
    fontSize: 24,
  },
  configurationBody: {
    color: colors.steel,
    fontFamily: typography.regular,
    fontSize: 16,
    lineHeight: 24,
  },
});
