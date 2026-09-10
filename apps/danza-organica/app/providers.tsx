"use client";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { RsvpReconciliationBoundary } from "@coucou/ui/auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient, useAction, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback } from "react";
import { PostHogUserIdentifier } from "@/components/posthog-user-identifier";
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

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <QueryClientProvider client={queryClient}>
        <HapticProvider>
          <EventBrandingProvider>
            <PostHogUserIdentifier />
            <GuestRsvpRecovery>{children}</GuestRsvpRecovery>
            <Toaster position="top-center" />
          </EventBrandingProvider>
        </HapticProvider>
      </QueryClientProvider>
    </ConvexProviderWithClerk>
  );
}

function GuestRsvpRecovery({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, userId, signOut } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const reconcileRsvps = useAction(api.rsvps.reconcileCurrentUserRsvps);
  const reconcile = useCallback(async () => {
    await reconcileRsvps();
    await queryClient.invalidateQueries();
  }, [reconcileRsvps]);
  const switchAccount = useCallback(
    () => signOut({ redirectUrl: window.location.href }),
    [signOut],
  );
  const authentication =
    !isLoaded || (isSignedIn && (isLoading || !isAuthenticated))
      ? "loading"
      : isSignedIn
        ? "signedIn"
        : "signedOut";
  return (
    <RsvpReconciliationBoundary
      active={pathname.startsWith("/events/") || pathname === "/tickets"}
      authentication={authentication}
      identityKey={`${userId ?? ""}:${pathname}`}
      reconcile={reconcile}
      switchAccount={switchAccount}
    >
      {children}
    </RsvpReconciliationBoundary>
  );
}
