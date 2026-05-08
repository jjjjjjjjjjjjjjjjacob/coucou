import { describe, expect, it } from "bun:test";
import userEvent from "@testing-library/user-event";
import HeaderClient from "../app/header-client";
import { renderWithProviders, screen } from "./test-wrapper";

describe("HeaderClient navigation", () => {
  it("opens the hamburger menu and shows the home link", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HeaderClient />);

    // Brand wordmark links to / so users can always click home from the
    // masthead itself.
    const homeBrand = screen.getByRole("link", {
      name: /Club Chlorine home/i,
    });
    expect(homeBrand).toHaveAttribute("href", "/");

    // Hamburger trigger lives in the rightSlot. aria-label="Menu" is
    // unconditional (never depends on the Clerk loading state), so the
    // menu is always reachable even before auth resolves.
    const triggerButton = screen.getByRole("button", { name: /Menu/i });
    await user.click(triggerButton);

    // The slide-in panel always renders at least a Home item.
    const homeItem = await screen.findByRole("link", { name: /^Home$/i });
    expect(homeItem).toHaveAttribute("href", "/");
  });
});
