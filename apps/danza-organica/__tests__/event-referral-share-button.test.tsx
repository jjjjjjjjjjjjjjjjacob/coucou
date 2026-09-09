import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen, waitFor } from "@testing-library/react";

const prepareReferralLink = mock(async () => ({
  referralCode: "guest-referral",
  shortId: "event-short-id",
}));
const useReferralMutation = mock(() => prepareReferralLink);
const useReferralQuery = mock(() => null);

mock.module("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useMutation: useReferralMutation,
  useQuery: useReferralQuery,
}));

const { EventReferralShareButton } = await import("../components/event-referral-share-button");

const event = {
  _id: "event_123" as Id<"events">,
  name: "Danza Organica",
  shortId: "event-short-id",
};

describe("Event referral sharing opt-in", () => {
  beforeEach(() => {
    prepareReferralLink.mockClear();
    useReferralMutation.mockClear();
    useReferralQuery.mockClear();
  });

  it.each([
    undefined,
    false,
  ])("hides sharing and avoids preparing referral links when enabled is %s", (referralSharingEnabled) => {
    render(<EventReferralShareButton event={{ ...event, referralSharingEnabled }} />);

    expect(screen.queryByRole("button", { name: "Share referral link" })).toBeNull();
    expect(useReferralMutation).not.toHaveBeenCalled();
    expect(useReferralQuery).not.toHaveBeenCalled();
    expect(prepareReferralLink).not.toHaveBeenCalled();
  });

  it("prepares sharing only after opt-in and removes the button when disabled", async () => {
    const renderedButton = render(<EventReferralShareButton event={event} />);
    renderedButton.rerender(
      <EventReferralShareButton event={{ ...event, referralSharingEnabled: true }} />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Share referral link" })).not.toBeDisabled();
    });
    expect(prepareReferralLink).toHaveBeenCalledTimes(2);

    renderedButton.rerender(
      <EventReferralShareButton event={{ ...event, referralSharingEnabled: false }} />,
    );
    expect(screen.queryByRole("button", { name: "Share referral link" })).toBeNull();
  });
});
