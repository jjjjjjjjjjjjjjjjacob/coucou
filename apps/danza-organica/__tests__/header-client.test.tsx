import { describe, expect, it } from "bun:test";
import userEvent from "@testing-library/user-event";
import HeaderClient from "../app/header-client";
import { renderWithProviders, screen } from "./test-wrapper";

describe("HeaderClient navigation", () => {
  it("opens the account menu and shows signed-in navigation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HeaderClient />);

    const triggerButton = screen.getByRole("button", { name: /Danza Organica menu/i });
    await user.click(triggerButton);

    const profileItem = await screen.findByRole("menuitem", { name: /^Profile$/i });
    const accountItem = await screen.findByRole("menuitem", { name: /Account Settings/i });
    expect(profileItem).toHaveAttribute("href", "/profile");
    expect(accountItem).toHaveAttribute("href", "/account");
  });
});
