"use client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";

/** Keep labels separate from routing/filter keys. */
export function ListName({ eventId, listKey }: { eventId?: string; listKey: string }) {
  const lists = useQuery(
    api.credentials.getCredsForEvent,
    eventId ? { eventId: eventId as Id<"events"> } : "skip",
  );
  return lists?.find((list) => list.listKey === listKey)?.displayName ?? listKey;
}
