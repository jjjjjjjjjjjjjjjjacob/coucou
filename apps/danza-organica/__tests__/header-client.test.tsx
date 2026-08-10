import { describe, expect, it } from "bun:test";
import userEvent from "@testing-library/user-event";
import HeaderClient from "../app/header-client";
import { renderWithProviders, screen } from "./test-wrapper";

describe("HeaderClient navigation", () => {
  it("opens the account menu and shows signed-in navigation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HeaderClient />);

    const triggerButton = screen.getByRole("button", { name: /Danza Organica menu/i });
    expect(triggerButton.querySelector("svg")).toHaveAttribute("data-icon", "globe-02");
    expect(triggerButton.className).toContain("rounded-full");
    expect(triggerButton.className).toContain("size-[26px]");
    expect(triggerButton.className).toContain("after:-inset-[9px]");
    expect(triggerButton.className).toContain("bg-[#17E1E5]");
    expect(triggerButton.className).toContain("text-[#0A0A0A]");
    await user.click(triggerButton);

    const homeItem = await screen.findByRole("menuitem", { name: /^Home$/i });
    const profileItem = await screen.findByRole("menuitem", { name: /^Profile$/i });
    const accountItem = await screen.findByRole("menuitem", { name: /Account Settings/i });
    const menuItems = screen.getAllByRole("menuitem");
    expect(homeItem).toHaveAttribute("href", "/");
    expect(menuItems[0]).toBe(homeItem);
    expect(profileItem).toHaveAttribute("href", "/profile");
    expect(accountItem).toHaveAttribute("href", "/account");
    expect(profileItem.className).toContain("[&_svg:not([class*='text-'])]:text-current");
    expect(accountItem.className).toContain("[&_svg:not([class*='text-'])]:text-current");
  });
});
