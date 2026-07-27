import { useAuth } from "@clerk/expo";
import { Redirect, Tabs } from "expo-router";
import { ListFilter, ScanLine, UserRound } from "lucide-react-native";
import { colors, typography } from "@/theme";

export default function TabsLayout(): React.JSX.Element {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && !isSignedIn) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      initialRouteName="scan"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.admit,
        tabBarInactiveTintColor: colors.steel,
        tabBarLabelStyle: {
          fontFamily: typography.medium,
          fontSize: 11,
        },
        tabBarStyle: {
          height: 82,
          borderTopColor: colors.rule,
          borderTopWidth: 1,
          backgroundColor: colors.night,
          paddingBottom: 12,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => (
            <ScanLine color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="guests"
        options={{
          title: "Guests",
          tabBarIcon: ({ color, size }) => (
            <ListFilter color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => (
            <UserRound color={color} size={size} strokeWidth={1.75} />
          ),
        }}
      />
    </Tabs>
  );
}
