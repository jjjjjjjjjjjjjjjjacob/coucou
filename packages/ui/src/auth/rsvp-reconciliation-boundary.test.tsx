import { afterAll, afterEach, beforeAll, describe, expect, it, mock } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { RsvpReconciliationBoundary } from "./rsvp-reconciliation-boundary";

describe("guest RSVP recovery boundary", () => {
  beforeAll(() => GlobalRegistrator.register({ url: "https://dojopomodoro.club/events/night" }));
  afterEach(cleanup);
  afterAll(() => GlobalRegistrator.unregister());
  it.each([
    "dojo",
    "club-chlorine",
    "danza-organica",
    "coucou",
  ])("holds %s guest pages until reconciliation and query refresh finish", async (site) => {
    let finish: () => void = () => {};
    const reconcile = mock(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const switchAccount = mock(async () => {});
    const view = render(
      <RsvpReconciliationBoundary
        active
        authentication="loading"
        identityKey={`${site}:guest:/tickets`}
        reconcile={reconcile}
        switchAccount={switchAccount}
      >
        No tickets found
      </RsvpReconciliationBoundary>,
    );
    expect(reconcile).not.toHaveBeenCalled();
    expect(view.queryByText("No tickets found")).toBeNull();
    view.rerender(
      <RsvpReconciliationBoundary
        active
        authentication="signedIn"
        identityKey={`${site}:guest:/tickets`}
        reconcile={reconcile}
        switchAccount={switchAccount}
      >
        My Tickets
      </RsvpReconciliationBoundary>,
    );
    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    expect(view.queryByText("My Tickets")).toBeNull();
    finish();
    await waitFor(() => expect(view.getByText("My Tickets")).toBeTruthy());
  });

  it("retries a failure without exposing a new RSVP form", async () => {
    const reconcile = mock(async () => {});
    reconcile.mockRejectedValueOnce(new Error("Connection interrupted"));
    const view = render(
      <RsvpReconciliationBoundary
        active
        authentication="signedIn"
        identityKey="guest:/events/night/rsvp"
        reconcile={reconcile}
        switchAccount={async () => {}}
      >
        RSVP form
      </RsvpReconciliationBoundary>,
    );
    await waitFor(() => expect(view.getByRole("alert").textContent).toBe("Connection interrupted"));
    expect(view.queryByText("RSVP form")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(view.getByText("RSVP form")).toBeTruthy());
    expect(reconcile).toHaveBeenCalledTimes(2);
  });

  it("ignores a stale account response and recovers again when the route changes", async () => {
    const completions: Array<() => void> = [];
    const reconcile = mock(() => new Promise<void>((resolve) => completions.push(resolve)));
    const switchAccount = async () => {};
    const view = render(
      <RsvpReconciliationBoundary
        active
        authentication="signedIn"
        identityKey="first:/events/night"
        reconcile={reconcile}
        switchAccount={switchAccount}
      >
        Guest page
      </RsvpReconciliationBoundary>,
    );
    await waitFor(() => expect(completions).toHaveLength(1));
    view.rerender(
      <RsvpReconciliationBoundary
        active
        authentication="signedIn"
        identityKey="second:/events/night/status"
        reconcile={reconcile}
        switchAccount={switchAccount}
      >
        Guest page
      </RsvpReconciliationBoundary>,
    );
    await waitFor(() => expect(completions).toHaveLength(2));
    completions[0]();
    await Promise.resolve();
    expect(view.queryByText("Guest page")).toBeNull();
    completions[1]();
    await waitFor(() => expect(view.getByText("Guest page")).toBeTruthy());
  });

  it("leaves signed-out visitors and host pages available", () => {
    const reconcile = mock(async () => {});
    const view = render(
      <RsvpReconciliationBoundary
        active
        authentication="signedOut"
        identityKey="guest"
        reconcile={reconcile}
        switchAccount={async () => {}}
      >
        Public event
      </RsvpReconciliationBoundary>,
    );
    expect(view.getByText("Public event")).toBeTruthy();
    expect(reconcile).not.toHaveBeenCalled();
  });
});
