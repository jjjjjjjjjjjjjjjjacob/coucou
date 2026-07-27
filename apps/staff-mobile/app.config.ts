import type { ConfigContext, ExpoConfig } from "expo/config";

type AppEnvironment = "development" | "preview" | "production";

const applicationEnvironment =
  (process.env.APP_ENV as AppEnvironment | undefined) ?? "development";

const applicationNames: Record<AppEnvironment, string> = {
  development: "Coucou Staff Dev",
  preview: "Coucou Staff Preview",
  production: "Coucou Staff",
};

const applicationIdentifiers: Record<AppEnvironment, string> = {
  development: "events.coucou.staff.dev",
  preview: "events.coucou.staff.preview",
  production: "events.coucou.staff",
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: applicationNames[applicationEnvironment],
  slug: "coucou-staff",
  scheme: "coucou-staff",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  platforms: ["ios", "android"],
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-build-properties",
      {
        "android": {
          "minSdkVersion": 29
        },
        "ios": {
          "deploymentTarget": "16.4"
        }
      }
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow Coucou Staff to scan guest tickets at the door.",
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  ios: {
    bundleIdentifier: applicationIdentifiers[applicationEnvironment],
    buildNumber: "1",
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: [],
      UIRequiresFullScreen: true,
    },
  },
  android: {
    package: applicationIdentifiers[applicationEnvironment],
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#0B0D10",
    },
  },
  extra: {
    appEnvironment: applicationEnvironment,
    clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    convexUrl: process.env.EXPO_PUBLIC_CONVEX_URL,
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
  updates: {
    url: process.env.EAS_UPDATE_URL,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
});
