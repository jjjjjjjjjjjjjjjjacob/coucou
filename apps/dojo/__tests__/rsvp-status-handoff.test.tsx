import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type FunctionReference, getFunctionName } from "convex/server";
import { Suspense } from "react";

type RsvpStatus = {
  status: "pending" | "approved" | "denied";
  listKey: string;
  smsConsent: boolean;
};
let currentStatus: RsvpStatus | null = null;
let claimedStatus: RsvpStatus | null = null;
let isAuthenticated = true;
const router = { replace: mock((_path: string) => {}) };
let searchParameters = new URLSearchParams("password=FANCY&ref=friend&utm_source=test");
const finalizeGuestRsvp = mock(async (_arguments: { token: string }) => ({ rsvpId: "rsvp_123" }));
const claimGuestRsvps = mock(async () => ({ paired: 1, merged: 0 }));
const refetchStatus = mock(async () => {
  currentStatus = claimedStatus;
});
const eventDocument = {
  _id: "event_123" as Id<"events">,
  name: "Dojo Pomodoro",
  location: "Main Room",
};
mock.module("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => searchParameters,
}));
mock.module("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "verified_user" }),
}));
mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated, isLoading: !isAuthenticated }),
  useQuery: () => undefined,
  useAction: () => finalizeGuestRsvp,
  useMutation: (reference: FunctionReference<"mutation">) =>
    getFunctionName(reference) === "rsvps:claimGuestRsvpsForCurrentUser"
      ? claimGuestRsvps
      : mock(async () => {}),
}));
mock.module("@tanstack/react-query", () => ({
  useQuery: ({ queryFn }: { queryFn: FunctionReference<"query"> }) => ({
    data: getFunctionName(queryFn) === "events:getByRouteId" ? eventDocument : currentStatus,
    isLoading: false,
    refetch: refetchStatus,
  }),
}));
const { default: StatusPage } = await import("../app/events/[eventId]/status/page");
const params = Promise.resolve({ eventId: "dojo-night" });
const statusPage = () => (
  <Suspense fallback={null}>
    <StatusPage params={params} />
  </Suspense>
);

beforeEach(() => {
  isAuthenticated = true;
  currentStatus = null;
  claimedStatus = { status: "pending", listKey: "vip", smsConsent: true };
  router.replace.mockClear();
  searchParameters = new URLSearchParams("password=FANCY&ref=friend&utm_source=test");
  finalizeGuestRsvp.mockReset();
  finalizeGuestRsvp.mockResolvedValue({ rsvpId: "rsvp_123" });
  claimGuestRsvps.mockReset();
  claimGuestRsvps.mockResolvedValue({ paired: 1, merged: 0 });
  refetchStatus.mockClear();
});

describe("Dojo post-verification RSVP handoff", () => {
  it("finalizes the saved draft only after auth and removes the token while preserving routing context", async () => {
    searchParameters.set("rsvp_handoff", "draft_token");
    isAuthenticated = false;
    const view = render(statusPage());
    await act(async () => {});
    expect(finalizeGuestRsvp).not.toHaveBeenCalled();
    isAuthenticated = true;
    await act(async () => {
      view.rerender(statusPage());
    });
    expect(finalizeGuestRsvp).toHaveBeenCalledTimes(1);
    expect(finalizeGuestRsvp).toHaveBeenCalledWith({ token: "draft_token" });
    expect(claimGuestRsvps).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(
      "/events/dojo-night/status?password=FANCY&ref=friend&utm_source=test",
    );
    expect(screen.getByText("pending host approval")).toBeInTheDocument();
  });
  it("preserves a failed draft for retry and provides a return path for expired drafts", async () => {
    searchParameters.set("rsvp_handoff", "draft_token");
    finalizeGuestRsvp.mockRejectedValueOnce(new Error("Your RSVP draft expired."));
    await act(async () => {
      render(statusPage());
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Your RSVP draft expired.");
    expect(screen.getByRole("link", { name: "Return to RSVP" }).getAttribute("href")).toBe(
      "/events/dojo-night/rsvp?password=FANCY&ref=friend&utm_source=test",
    );
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(finalizeGuestRsvp).toHaveBeenCalledTimes(2));
    expect(claimGuestRsvps).not.toHaveBeenCalled();
  });
  it("waits for Convex authentication, claims the first submission once, and shows pending", async () => {
    isAuthenticated = false;
    let finishClaim: (() => void) | undefined;
    claimGuestRsvps.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishClaim = () => resolve({ paired: 1, merged: 0 });
        }),
    );
    const view = render(statusPage());
    await act(async () => {});
    expect(claimGuestRsvps).not.toHaveBeenCalled();
    isAuthenticated = true;
    await act(async () => {
      view.rerender(statusPage());
    });
    expect(claimGuestRsvps).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("No request on file yet.")).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    await act(async () => {
      finishClaim?.();
    });
    expect(screen.getByText("pending host approval")).toBeInTheDocument();
    expect(refetchStatus).toHaveBeenCalledTimes(1);
    expect(claimGuestRsvps).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
  for (const status of ["approved", "denied"] as const) {
    it(`routes a newly claimed ${status} RSVP without a second submission`, async () => {
      claimedStatus = { status, listKey: "vip", smsConsent: true };
      await act(async () => {
        render(statusPage());
      });
      expect(claimGuestRsvps).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith(
        `/events/dojo-night/${status === "approved" ? "ticket" : "denied"}?${searchParameters}`,
      );
      expect(screen.queryByText("No request on file yet.")).toBeNull();
    });
  }
  it("lets a failed claim retry without asking for another RSVP", async () => {
    claimGuestRsvps.mockRejectedValueOnce(new Error("Connection interrupted"));
    await act(async () => {
      render(statusPage());
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Connection interrupted");
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("pending host approval")).toBeInTheDocument());
    expect(claimGuestRsvps).toHaveBeenCalledTimes(2);
  });
});
