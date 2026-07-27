/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    EXPO_PUBLIC_CONVEX_URL?: string;
  }
}
