"use client";
import { useAuth } from "@clerk/nextjs";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type React from "react";
import { Toaster } from "@/components/ui/sonner";
import { EventBrandingProvider } from "@/contexts/event-branding-context";
import { HapticProvider } from "@/contexts/haptic-context";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
const convex = new ConvexReactClient(convexUrl);
const convexQueryClient = new ConvexQueryClient(convex);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
    },
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <QueryClientProvider client={queryClient}>
        <HapticProvider>
          <EventBrandingProvider>
            {children}
            <Toaster position="top-center" />
          </EventBrandingProvider>
        </HapticProvider>
      </QueryClientProvider>
    </ConvexProviderWithClerk>
  );
}
