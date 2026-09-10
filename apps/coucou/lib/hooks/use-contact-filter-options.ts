"use client";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GuestDirectoryFacets } from "@/lib/types";
import type { WorkspaceScope } from "@/lib/use-workspace-scope";

function useOptionPages<Option>(workspaceSlug: string) {
  const [state, setState] = useState<{
    workspace: string;
    cursor?: string;
    pages: Record<string, Option[]>;
  }>({ workspace: workspaceSlug, pages: {} });
  const current = useMemo(
    () =>
      state.workspace === workspaceSlug
        ? state
        : { workspace: workspaceSlug, cursor: undefined, pages: {} },
    [state, workspaceSlug],
  );
  const acceptPage = useCallback(
    (result: { page: Option[]; nextCursor: string | null }) => {
      setState((previous) => ({
        workspace: workspaceSlug,
        cursor: result.nextCursor ?? current.cursor,
        pages: {
          ...(previous.workspace === workspaceSlug ? previous.pages : {}),
          [current.cursor ?? "first"]: result.page,
        },
      }));
    },
    [workspaceSlug, current.cursor],
  );
  return { cursor: current.cursor, options: Object.values(current.pages).flat(), acceptPage };
}

type EventOption = GuestDirectoryFacets["events"][number] & {
  customFields: Array<{ key: string; label: string }>;
};

export function useContactFilterOptions(workspace: WorkspaceScope | null) {
  const workspaceSlug = workspace?.workspaceSlug ?? "";
  const facets = useOptionPages<Doc<"contactFacets">>(workspaceSlug);
  const events = useOptionPages<EventOption>(workspaceSlug);
  const facetQuery = useQuery(
    convexQuery(
      api.contacts.facetPage,
      workspace ? { workspaceSlug, cursor: facets.cursor } : "skip",
    ),
  );
  const eventQuery = useQuery(
    convexQuery(
      api.contacts.eventOptions,
      workspace ? { workspaceSlug, cursor: events.cursor } : "skip",
    ),
  );
  useEffect(() => {
    if (facetQuery.data) facets.acceptPage(facetQuery.data);
  }, [facetQuery.data, facets.acceptPage]);
  useEffect(() => {
    if (eventQuery.data) events.acceptPage(eventQuery.data);
  }, [eventQuery.data, events.acceptPage]);
  const values = (kind: Doc<"contactFacets">["kind"]) =>
    Array.from(
      new Set(
        facets.options
          .filter((facet) => facet.kind === kind && facet.count > 0)
          .map((facet) => facet.value),
      ),
    ).sort();
  const eventOptions = Array.from(
    new Map(events.options.map((event) => [event.eventId, event])).values(),
  ).sort((first, second) => second.eventDate - first.eventDate);
  const customFields = new Map(
    eventOptions.flatMap((event) => event.customFields.map((field) => [field.key, field] as const)),
  );
  return {
    data: {
      tags: values("tag"),
      defaultListKeys: values("defaultList"),
      workspaceListKeys: values("eventList"),
      events: eventOptions,
      customFieldOptions: Array.from(customFields.values()),
    } satisfies GuestDirectoryFacets,
    error: facetQuery.error ?? eventQuery.error,
    refetch: async () => {
      await Promise.all([facetQuery.refetch(), eventQuery.refetch()]);
    },
  };
}
