import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import TicketsPage from "../app/tickets/page";

interface TicketsAuthTestGlobal {
  __setClerkTestState?: (nextState: {
    isLoaded?: boolean;
    isSignedIn?: boolean;
    userId?: string | null;
  }) => void;
  __setConvexAuthTestState?: (nextState: {
    isLoading?: boolean;
    isAuthenticated?: boolean;
  }) => void;
}

function getTicketsAuthTestGlobal(): typeof globalThis & TicketsAuthTestGlobal {
  return globalThis as typeof globalThis & TicketsAuthTestGlobal;
}

describe("TicketsPage auth readiness", () => {
  it("waits for Convex auth before loading user tickets", () => {
    getTicketsAuthTestGlobal().__setClerkTestState?.({
      isLoaded: true,
      isSignedIn: true,
      userId: "user_123",
    });
    getTicketsAuthTestGlobal().__setConvexAuthTestState?.({
      isLoading: true,
      isAuthenticated: false,
    });

    render(<TicketsPage />);

    expect(screen.getByRole("img", { name: "Loading" })).toBeTruthy();
    expect(screen.queryByText("No tickets found")).toBeNull();
  });
});
