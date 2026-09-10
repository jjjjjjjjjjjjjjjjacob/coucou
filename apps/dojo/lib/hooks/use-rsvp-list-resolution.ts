"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { siteConfiguration } from "@/lib/site";

interface ListResolution {
  eventId: Id<"events">;
  password: string;
  listKey: string | null;
  matchedPassword: boolean;
}

export function useRsvpListResolution(eventId: Id<"events">, password: string) {
  const resolveList = useAction(api.credentialsNode.resolveListByPassword);
  const [resolution, setResolution] = useState<ListResolution | null>(null);
  const normalizedPassword = password.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(
      async () => {
        try {
          const result = await resolveList({
            eventId,
            password: normalizedPassword,
            siteKey: siteConfiguration.siteKey,
          });
          if (!cancelled)
            setResolution({
              eventId,
              password: normalizedPassword,
              listKey: result.ok ? result.listKey : null,
              matchedPassword: result.ok && result.matched === "password",
            });
        } catch {
          if (!cancelled)
            setResolution({
              eventId,
              password: normalizedPassword,
              listKey: null,
              matchedPassword: false,
            });
        }
      },
      normalizedPassword ? 300 : 0,
    );
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [eventId, normalizedPassword, resolveList]);

  const isResolving =
    !resolution || resolution.eventId !== eventId || resolution.password !== normalizedPassword;
  const resolvedListKey = isResolving ? null : resolution.listKey;
  const searchStatus = isResolving
    ? "searching"
    : !normalizedPassword
      ? "idle"
      : !resolvedListKey
        ? "miss-no-fallback"
        : resolution.matchedPassword
          ? "matched"
          : "miss-with-fallback";
  return { resolvedListKey, searchStatus, isResolving };
}
