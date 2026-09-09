import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import type { ContactAudience } from "@convex/lib/contactValidators";
import { fireEvent, render, screen } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { useState } from "react";
import type { GuestDirectoryFilterState } from "../lib/text-blast-filters";

let directoryError: string | null = null;
const retry = mock(async () => undefined);
const workspace = { workspaceSlug: "dojo-pomodoro", queryArgs: { workspaceSlug: "dojo-pomodoro" } };

mock.module("@/lib/use-workspace-scope", () => ({ useWorkspaceScope: () => workspace }));
mock.module("@convex-dev/react-query", () => ({
  convexQuery: (reference: Parameters<typeof getFunctionName>[0]) => ({
    queryKey: [getFunctionName(reference)],
  }),
}));
mock.module("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: queryKey[0].includes("Facets")
      ? { events: [], tags: [], defaultListKeys: [], customFieldOptions: [] }
      : [],
    error: null,
  }),
}));
mock.module("@/components/guests/guest-directory-filters", () => ({
  GuestDirectoryFilters: ({
    value,
    onChange,
  }: {
    value: GuestDirectoryFilterState;
    onChange: (state: GuestDirectoryFilterState) => void;
  }) => (
    <div>
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
  useContactDirectory: () => {
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
            },
          ],
      configured: true,
      error: directoryError,
      isPreparing: false,
      isLoading: false,
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

function Picker() {
  const [audience, setAudience] = useState<ContactAudience | null>(null);
  return (
    <HapticProvider>
      <ContactAudiencePicker audience={audience} onChange={setAudience} />
      <output aria-label="Audience">{JSON.stringify(audience)}</output>
    </HapticProvider>
  );
}

beforeEach(() => {
  directoryError = null;
  retry.mockClear();
});

describe("contact audience selection", () => {
  it("starts with no recipients and preserves explicit selections across pages and sorting", () => {
    render(<Picker />);
    expect(screen.getByLabelText("Audience").textContent).toBe("null");
    fireEvent.click(screen.getByLabelText("Select Ada"));
    fireEvent.click(screen.getByText("Next"));
    fireEvent.click(screen.getByLabelText("Select Bea"));
    fireEvent.click(screen.getByText("Change sort"));
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

  it("selects all matches only after an explicit action and excludes sort controls from the audience", () => {
    render(<Picker />);
    fireEvent.click(screen.getByText("Select all matching"));
    const audience = JSON.parse(screen.getByLabelText("Audience").textContent ?? "null");
    expect(audience).toEqual({ type: "filter", filters: { smsConsentFilter: "consented" } });
    fireEvent.click(screen.getByText("Change sort"));
    expect(JSON.parse(screen.getByLabelText("Audience").textContent ?? "null")).toEqual(audience);
    fireEvent.click(screen.getByText("Clear selection"));
    expect(screen.getByLabelText("Audience").textContent).toBe("null");
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
