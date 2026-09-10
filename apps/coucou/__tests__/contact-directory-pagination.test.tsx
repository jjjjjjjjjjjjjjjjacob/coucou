import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { FunctionArgs } from "convex/server";
import {
  createDefaultGuestDirectoryFilterState,
  type GuestDirectoryFilterState,
} from "../lib/text-blast-filters";
import type { WorkspaceScope } from "../lib/use-workspace-scope";

type DirectoryArgs = FunctionArgs<typeof api.contacts.list>;
type Batch = {
  people: Array<{ contactId: Id<"workspaceContacts">; name: string }>;
  nextCursor: string | null;
  isDone: boolean;
  directoryStatus: "ready" | "building" | "not_started" | "failed";
};

const workspace: WorkspaceScope = {
  workspaceSlug: "dojo-pomodoro",
  siteKey: "dojo",
  brandName: "Dojo",
  queryArgs: { workspaceSlug: "dojo-pomodoro", siteKey: "dojo" },
};
const batches = new Map<string, Batch>();
const errors = new Map<string, Error>();
const queriedArguments: DirectoryArgs[] = [];
const refetch = mock(async (_cursor: string) => undefined);
const startBackfill = mock(async () => undefined);
let debouncedSearchOverride: string | undefined;

mock.module("@/lib/hooks/use-debounce", () => ({
  useDebounce: (value: string) => debouncedSearchOverride ?? value,
}));
mock.module("@convex-dev/react-query", () => ({
  convexQuery: (_reference: unknown, args: DirectoryArgs) => ({ args }),
}));
mock.module("@tanstack/react-query", () => ({
  useQueries: ({ queries }: { queries: Array<{ args: DirectoryArgs }> }) =>
    queries.map(({ args }) => {
      queriedArguments.push(args);
      const cursor = args.cursor ?? "first";
      return {
        data: batches.get(cursor),
        error: errors.get(cursor) ?? null,
        refetch: () => refetch(cursor),
      };
    }),
}));
mock.module("convex/react", () => ({ useMutation: () => startBackfill }));

const { useContactDirectory } = await import("../lib/hooks/use-contact-directory");
const { DirectoryPagination } = await import("../components/ui/directory-pagination");

function seedBatches(batchSizes: number[]) {
  let contactNumber = 0;
  batches.clear();
  for (const [batchIndex, batchSize] of batchSizes.entries()) {
    const isDone = batchIndex === batchSizes.length - 1;
    batches.set(batchIndex === 0 ? "first" : `cursor-${batchIndex}`, {
      people: Array.from({ length: batchSize }, () => {
        contactNumber += 1;
        return {
          contactId: `contact-${contactNumber}` as Id<"workspaceContacts">,
          name: `Contact ${contactNumber}`,
        };
      }),
      nextCursor: isDone ? null : `cursor-${batchIndex + 1}`,
      isDone,
      directoryStatus: "ready",
    });
  }
}

function Directory({ filters }: { filters: GuestDirectoryFilterState }) {
  const directory = useContactDirectory(filters, workspace);
  return (
    <>
      {directory.isLoading ? <p role="status">Searching contacts…</p> : null}
      {directory.people.map((person) => (
        <p key={person.contactId}>{person.name}</p>
      ))}
      <DirectoryPagination
        itemCount={directory.people.length}
        itemLabel="contacts"
        currentPage={directory.pageIndex + 1}
        pageSize={20}
        hasActiveFilters
        hasPreviousPage={directory.hasPreviousPage}
        hasNextPage={directory.hasNextPage}
        isLoading={directory.isLoading}
        onPreviousPage={directory.previousPage}
        onNextPage={directory.nextPage}
      />
    </>
  );
}

beforeEach(() => {
  batches.clear();
  errors.clear();
  queriedArguments.length = 0;
  debouncedSearchOverride = undefined;
  refetch.mockClear();
  startBackfill.mockClear();
});

describe("contact directory pagination", () => {
  it("fills filtered pages across short and empty batches with contiguous displayed ranges", () => {
    seedBatches([5, 0, 9, 6, 0, 8, 0]);
    const filters = {
      ...createDefaultGuestDirectoryFilterState(),
      listKeys: ["vip"],
      recipientHistoryFilter: { type: "received_any" as const, textBlastIds: ["blast-1"] },
    };
    render(<Directory filters={filters} />);
    expect(screen.getByText("Showing 1-20 contacts (filtered)")).toBeTruthy();
    expect(screen.getByText("Contact 20")).toBeTruthy();
    expect(screen.queryByText("Contact 21")).toBeNull();
    expect(queriedArguments.every((args) => args.listKeys?.[0] === "vip")).toBe(true);
    expect(
      queriedArguments.every((args) => args.recipientHistoryFilter?.type === "received_any"),
    ).toBe(true);

    fireEvent.click(screen.getByLabelText("Go to next page"));
    expect(screen.getByText("Showing 21-28 contacts (filtered)")).toBeTruthy();
    expect(screen.getByText("Contact 21")).toBeTruthy();
    expect(screen.getByText("Contact 28")).toBeTruthy();
    expect(screen.queryByText("Contact 20")).toBeNull();
    expect(screen.getByLabelText("Go to next page").getAttribute("aria-disabled")).toBe("true");

    fireEvent.click(screen.getByLabelText("Go to previous page"));
    expect(screen.getByText("Showing 1-20 contacts (filtered)")).toBeTruthy();
    expect(screen.getByText("Contact 1")).toBeTruthy();
  });

  it("keeps a partial page hidden until the remaining matching batches arrive", () => {
    seedBatches([5, 15, 1]);
    const pendingBatch = batches.get("cursor-1");
    batches.delete("cursor-1");
    const filters = createDefaultGuestDirectoryFilterState();
    const directory = render(<Directory filters={filters} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Contact 1")).toBeNull();
    expect(screen.queryByText(/Showing/)).toBeNull();

    if (!pendingBatch) throw new Error("Missing test batch");
    batches.set("cursor-1", pendingBatch);
    directory.rerender(<Directory filters={filters} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Showing 1-20 contacts (filtered)")).toBeTruthy();
  });

  it("does not offer an empty next page when only nonmatching batches remain", () => {
    seedBatches([20, 0, 0]);
    const { result } = renderHook(() =>
      useContactDirectory(createDefaultGuestDirectoryFilterState(), workspace),
    );
    expect(result.current.people).toHaveLength(20);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it("restarts the page and cursor chain for filters, sorting, page size, and workspace changes", () => {
    seedBatches([20, 20, 5]);
    const initialProps = {
      filters: createDefaultGuestDirectoryFilterState(),
      scope: workspace,
      pageSize: 20,
    };
    const { result, rerender } = renderHook(
      ({ filters, scope, pageSize }) => useContactDirectory(filters, scope, pageSize),
      { initialProps },
    );
    for (const nextProps of [
      { ...initialProps, filters: { ...initialProps.filters, tags: ["vip"] } },
      { ...initialProps, filters: { ...initialProps.filters, sortDirection: "desc" as const } },
      { ...initialProps, pageSize: 10 },
      {
        ...initialProps,
        scope: {
          ...workspace,
          siteKey: "other",
          queryArgs: { ...workspace.queryArgs, siteKey: "other" },
        },
      },
    ]) {
      rerender(initialProps);
      act(() => result.current.nextPage());
      expect(result.current.pageIndex).toBe(1);
      queriedArguments.length = 0;
      rerender(nextProps);
      expect(result.current.pageIndex).toBe(0);
      expect(result.current.people).toHaveLength(nextProps.pageSize);
      expect(queriedArguments[0]?.cursor).toBeUndefined();
    }
  });

  it("hides old search results while the new search is debouncing", () => {
    seedBatches([5]);
    const initialFilters = createDefaultGuestDirectoryFilterState();
    const { result, rerender } = renderHook((filters) => useContactDirectory(filters, workspace), {
      initialProps: initialFilters,
    });
    debouncedSearchOverride = "";
    queriedArguments.length = 0;
    rerender({ ...initialFilters, searchText: "Ada" });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.people).toEqual([]);
    expect(queriedArguments).toEqual([]);
    debouncedSearchOverride = "Ada";
    rerender({ ...initialFilters, searchText: "Ada" });
    expect(result.current.isLoading).toBe(false);
    expect(queriedArguments.every((args) => args.searchText === "Ada")).toBe(true);
  });

  it("replaces stale continuations when a subscribed batch changes", () => {
    seedBatches([5, 20]);
    const { result, rerender } = renderHook(() =>
      useContactDirectory(createDefaultGuestDirectoryFilterState(), workspace),
    );
    const firstBatch = batches.get("first");
    if (!firstBatch) throw new Error("Missing test batch");
    batches.set("first", { ...firstBatch, nextCursor: "updated-cursor" });
    batches.set("updated-cursor", {
      people: [
        { contactId: "updated-contact" as Id<"workspaceContacts">, name: "Updated contact" },
      ],
      nextCursor: null,
      isDone: true,
      directoryStatus: "ready",
    });
    rerender();
    expect(result.current.people.map((person) => person.name)).toEqual([
      "Contact 1",
      "Contact 2",
      "Contact 3",
      "Contact 4",
      "Contact 5",
      "Updated contact",
    ]);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("surfaces a failed continuation and retries it without advancing the displayed page", async () => {
    seedBatches([5, 20]);
    errors.set("cursor-1", new Error("Could not load more contacts"));
    const { result, rerender } = renderHook(() =>
      useContactDirectory(createDefaultGuestDirectoryFilterState(), workspace),
    );
    expect(result.current.error).toBe("Could not load more contacts");
    expect(result.current.people).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);
    expect(result.current.pageIndex).toBe(0);
    await act(async () => result.current.retry());
    expect(refetch).toHaveBeenCalledWith("cursor-1");
    errors.clear();
    rerender();
    expect(result.current.error).toBeNull();
    expect(result.current.people).toHaveLength(20);
  });
});
