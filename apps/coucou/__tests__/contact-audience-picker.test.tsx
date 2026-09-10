import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import type { ContactAudience } from "@convex/lib/contactValidators";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { useState } from "react";
import type { GuestDirectoryFilterState } from "../lib/text-blast-filters";

let directoryError: string | null = null;
let directoryTotalCount: number | undefined = 463;
let countError: string | null = null;
let latestDirectoryFilters: GuestDirectoryFilterState | null = null;
const retry = mock(async () => undefined);
const retryCount = mock(async () => undefined);
const prepareAudience = mock(async () => "eligibility_preview");
const workspace = { workspaceSlug: "dojo-pomodoro", queryArgs: { workspaceSlug: "dojo-pomodoro" } };

mock.module("@/lib/use-workspace-scope", () => ({
  useWorkspaceScope: () => workspace,
  useWorkspaceOperationPath: () => "/workspaces/dojo-pomodoro/host/guests",
}));
const savePreference = mock(async () => undefined);
mock.module("@convex-dev/react-query", () => ({
  useConvexMutation: () => savePreference,
  convexQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
    queryKey: [getFunctionName(reference)],
  }),
}));
mock.module("@tanstack/react-query", () => ({
  useMutation: () => ({ mutateAsync: savePreference }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0].includes("TablePreference")
      ? null
      : queryKey[0].includes("Facets")
        ? { events: [], tags: [], defaultListKeys: [], customFieldOptions: [] }
        : [],
    error: null,
  }),
}));
mock.module("convex/react", () => ({
  useMutation: () => prepareAudience,
  useQuery: (reference: Parameters<typeof getFunctionName>[0], args: unknown) => {
    if (args === "skip") return undefined;
    const queryName = getFunctionName(reference);
    if (queryName.includes("getBlastsByWorkspaceWithSenderNames")) return [];
    return undefined;
  },
}));
mock.module("@/components/guests/guest-directory-filters", () => ({
  GuestDirectoryFilters: ({
    value,
    onChange,
    hideSmsConsentFilter,
  }: {
    value: GuestDirectoryFilterState;
    onChange: (state: GuestDirectoryFilterState) => void;
    hideSmsConsentFilter?: boolean;
  }) => (
    <div>
      <span data-testid="sms-consent-filter-hidden">{String(hideSmsConsentFilter)}</span>
      <input
        aria-label="Search contacts"
        value={value.searchText}
        onChange={(event) => onChange({ ...value, searchText: event.target.value })}
      />
      <button
        type="button"
        onClick={() =>
          onChange({ ...value, sortDirection: value.sortDirection === "asc" ? "desc" : "asc" })
        }
      >
        Change sort
      </button>
      <button type="button" onClick={() => onChange({ ...value, searchText: "" })}>
        Clear filters
      </button>
      <button
        type="button"
        onClick={() => onChange({ ...value, smsConsentFilter: "not_consented" })}
      >
        Try showing non-consented
      </button>
    </div>
  ),
}));
mock.module("@/lib/hooks/use-contact-filter-options", () => ({
  useContactFilterOptions: () => ({
    data: {
      events: [],
      tags: [],
      defaultListKeys: [],
      workspaceListKeys: [],
      customFieldOptions: [],
    },
    error: null,
    refetch: async () => undefined,
  }),
}));
mock.module("@/lib/hooks/use-contact-directory", () => ({
  useContactDirectory: (filterState: GuestDirectoryFilterState) => {
    latestDirectoryFilters = filterState;
    const [page, setPage] = useState(0);
    return {
      people: directoryError
        ? []
        : [
            {
              contactId: `contact_${page}` as Id<"workspaceContacts">,
              name: page ? "Bea" : "Ada",
              phoneObfuscated: "***0101",
              tags: [],
              smsConsent: true,
              hasPhone: true,
              hasOptedOut: false,
              eventCount: 2,
              eventsAttendedCount: 1,
              events: [],
              socialProfiles: [
                { platformKey: "instagram", handle: "ada", normalizedHandle: "ada" },
              ],
            },
          ],
      configured: true,
      totalCount: directoryTotalCount,
      countError,
      retryCount,
      error: directoryError,
      isPreparing: false,
      isLoading: false,
      pageIndex: page,
      hasNextPage: page === 0,
      hasPreviousPage: page === 1,
      nextPage: () => setPage(1),
      previousPage: () => setPage(0),
      retry,
    };
  },
}));

const { ContactAudiencePicker } = await import("../components/guests/contact-audience-picker");
const { HapticProvider } = await import("../contexts/haptic-context");
const { useDashboardTableColumnLayout } = await import(
  "../lib/hooks/use-dashboard-table-column-layout"
);
const { GUEST_DIRECTORY_COLUMN_IDS, GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS } = await import(
  "../lib/guest-directory-columns"
);
const { HOST_GUEST_DIRECTORY_TABLE_KEY, HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY } = await import(
  "../lib/dashboard-table-preferences"
);

function Picker() {
  const [audience, setAudience] = useState<ContactAudience | null>(null);
  return (
    <HapticProvider>
      <ContactAudiencePicker audience={audience} onChange={setAudience} />
      <output aria-label="Audience">{JSON.stringify(audience)}</output>
    </HapticProvider>
  );
}

let testNumber = 0;
beforeEach(() => {
  workspace.workspaceSlug = `picker-test-${++testNumber}`;
  workspace.queryArgs.workspaceSlug = workspace.workspaceSlug;
  directoryError = null;
  directoryTotalCount = 463;
  countError = null;
  latestDirectoryFilters = null;
  retry.mockClear();
  retryCount.mockClear();
  prepareAudience.mockClear();
});

describe("contact audience selection", () => {
  it("shares Contacts layout changes immediately and keeps them when the picker reopens", () => {
    const contactsLayout = renderHook(() =>
      useDashboardTableColumnLayout({
        tableKey: HOST_GUEST_DIRECTORY_TABLE_KEY,
        scopeKey: HOST_GUEST_DIRECTORY_TABLE_SCOPE_KEY,
        availableColumnIds: GUEST_DIRECTORY_COLUMN_IDS,
        defaultVisibleColumnIds: GUEST_DIRECTORY_DEFAULT_VISIBLE_COLUMN_IDS,
        insertMissingColumnsCanonically: true,
        queryArgs: workspace.queryArgs,
        isEnabled: true,
      }),
    );
    const picker = render(<Picker />);
    expect(screen.getByRole("link", { name: "Instagram: @ada" }).getAttribute("href")).toBe(
      "https://instagram.com/ada",
    );
    act(() => {
      contactsLayout.result.current.setHiddenColumnIds(["notes", "events"]);
      contactsLayout.result.current.onColumnSizingChange({ person: 320 });
    });
    expect(screen.queryByRole("columnheader", { name: /^Notes(?: |$)/ })).toBeNull();
    expect(screen.getByRole("columnheader", { name: /^Contact(?: |$)/ }).style.width).toBe("320px");

    const tagsHeader = screen.getByRole("columnheader", { name: /^Tags(?: |$)/ });
    fireEvent.dragStart(tagsHeader.querySelector("[draggable]") as HTMLElement, {
      dataTransfer: { setData: () => undefined, setDragImage: () => undefined },
    });
    fireEvent.drop(screen.getByRole("columnheader", { name: /^Contact(?: |$)/ }));
    expect(contactsLayout.result.current.columnOrder.slice(0, 3)).toEqual([
      "select",
      "tags",
      "person",
    ]);
    const headers = screen.getAllByRole("columnheader").map((header) => header.title);
    picker.unmount();
    contactsLayout.unmount();
    render(<Picker />);
    expect(screen.getAllByRole("columnheader").map((header) => header.title)).toEqual(headers);
    expect(screen.getByRole("columnheader", { name: /^Contact(?: |$)/ }).style.width).toBe("320px");
    expect(screen.queryByRole("columnheader", { name: /^Notes(?: |$)/ })).toBeNull();
  });

  it("resizes columns without changing recipient selections", () => {
    render(<Picker />);
    fireEvent.click(screen.getByLabelText("Select Ada"));
    const contactHeader = screen.getByRole("columnheader", { name: /^Contact(?: |$)/ });
    const initialWidth = Number.parseFloat(contactHeader.style.width);
    fireEvent.mouseDown(screen.getByRole("separator", { name: "Resize Contact column" }), {
      clientX: 100,
    });
    fireEvent.mouseMove(document, { clientX: 180 });
    fireEvent.mouseUp(document, { clientX: 180 });
    expect(Number.parseFloat(contactHeader.style.width)).toBe(initialWidth + 80);
    expect(JSON.parse(screen.getByLabelText("Audience").textContent ?? "null")).toEqual({
      type: "contacts",
      contactIds: ["contact_0"],
    });
  });

  it("starts with no recipients and preserves explicit selections across pages and sorting", () => {
    render(<Picker />);
    expect(screen.getByLabelText("Audience").textContent).toBe("null");
    expect(screen.getByText("0 people selected")).toBeTruthy();
    expect(screen.getByText("Showing 1-1 of 463 contacts (filtered)")).toBeTruthy();
    expect(screen.getByText("Page 1")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Select Ada"));
    expect(screen.getByText("1 person selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Showing 21-21 of 463 contacts (filtered)")).toBeTruthy();
    expect(screen.getByText("Page 2")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Select Bea"));
    fireEvent.click(screen.getByText("Change sort"));
    expect(screen.getByText("2 people selected")).toBeTruthy();
    expect(JSON.parse(screen.getByLabelText("Audience").textContent ?? "null")).toEqual({
      type: "contacts",
      contactIds: ["contact_0", "contact_1"],
    });
    fireEvent.click(screen.getByText("Previous"));
    expect(screen.getByLabelText("Select Ada").getAttribute("data-state")).toBe("checked");
  });

  it("clears selections when filters change or are cleared", () => {
    render(<Picker />);
    fireEvent.click(screen.getByLabelText("Select Ada"));
    fireEvent.change(screen.getByLabelText("Search contacts"), { target: { value: "Ada" } });
    expect(screen.getByLabelText("Audience").textContent).toBe("null");
    fireEvent.click(screen.getByLabelText("Select Ada"));
    fireEvent.click(screen.getByText("Clear filters"));
    expect(screen.getByLabelText("Audience").textContent).toBe("null");
  });

  it("forces SMS consent eligibility while hiding the redundant filter", () => {
    render(<Picker />);
    expect(screen.getByTestId("sms-consent-filter-hidden").textContent).toBe("true");
    expect(latestDirectoryFilters?.smsConsentFilter).toBe("consented");
    fireEvent.click(screen.getByText("Try showing non-consented"));
    expect(latestDirectoryFilters?.smsConsentFilter).toBe("consented");
  });

  it("uses the search total for all matching selections without preparing recipients", async () => {
    render(<Picker />);
    await act(async () => {
      fireEvent.click(screen.getByText("Select all matching"));
    });
    const audience = JSON.parse(screen.getByLabelText("Audience").textContent ?? "null");
    expect(audience).toEqual({ type: "filter", filters: { smsConsentFilter: "consented" } });
    expect(await screen.findByText("463 people selected")).toBeTruthy();
    fireEvent.click(screen.getByText("Change sort"));
    expect(JSON.parse(screen.getByLabelText("Audience").textContent ?? "null")).toEqual(audience);
    fireEvent.click(screen.getByText("Clear selection"));
    expect(screen.getByLabelText("Audience").textContent).toBe("null");
    expect(screen.getByText("0 people selected")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Search contacts"), { target: { value: "Ada" } });
    expect(prepareAudience).not.toHaveBeenCalled();
  });

  it("confirms all matches immediately and updates the total when the search count arrives", () => {
    directoryTotalCount = undefined;
    const picker = render(<Picker />);
    fireEvent.click(screen.getByText("Select all matching"));
    expect(screen.getByText("All matching contacts selected")).toBeTruthy();
    expect(screen.queryByText("Counting selected people…")).toBeNull();
    directoryTotalCount = 512;
    picker.rerender(<Picker />);
    expect(screen.getByText("512 people selected")).toBeTruthy();
    expect(screen.getByText("Showing 1-1 of 512 contacts (filtered)")).toBeTruthy();
    expect(prepareAudience).not.toHaveBeenCalled();
  });

  it("keeps all matches selected when the count fails and allows retrying it", () => {
    directoryTotalCount = undefined;
    countError = "Count failed";
    render(<Picker />);
    fireEvent.click(screen.getByText("Select all matching"));
    expect(screen.getByText("All matching contacts selected (count unavailable)")).toBeTruthy();
    expect(JSON.parse(screen.getByLabelText("Audience").textContent ?? "null").type).toBe("filter");
    fireEvent.click(screen.getByText("Retry count"));
    expect(retryCount).toHaveBeenCalledOnce();
    expect(prepareAudience).not.toHaveBeenCalled();
  });

  it("shows a retryable query error without presenting an empty directory", () => {
    directoryError = "The directory query failed";
    render(<Picker />);
    expect(screen.getByRole("alert").textContent).toContain("The directory query failed");
    expect(screen.queryByText("No contacts match these filters.")).toBeNull();
    fireEvent.click(screen.getByText("Retry"));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByText("Select all matching").hasAttribute("disabled")).toBe(true);
  });
});
