"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";
import { isPostHogConfigured } from "@/lib/posthog";

export function PostHogUserIdentifier() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isPostHogConfigured()) return;
    if (!isLoaded) return;
    if (user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        phone: user.primaryPhoneNumber?.phoneNumber,
        name: user.fullName,
      });
    } else {
      posthog.reset();
    }
  }, [user, isLoaded]);

  return null;
}
