import { describe, expect, it } from "bun:test";
import userEvent from "@testing-library/user-event";
import HeaderClient from "../app/header-client";
import { renderWithProviders, screen } from "./test-wrapper";

describe("HeaderClient navigation", () => {
  it("opens the account menu and shows signed-in navigation", async () => {
    const user = userEvent.setup();
    renderWithProviders(<HeaderClient />);

    const triggerButton = screen.getByRole("button", { name: /Danza Organica menu/i });
    const discoBallIcon = triggerButton.querySelector("svg");
    expect(discoBallIcon).toBeTruthy();
    expect(discoBallIcon).toHaveAttribute("viewBox", "0 0 1200 1200");
    expect(discoBallIcon?.querySelectorAll("path")).toHaveLength(1);
    expect(discoBallIcon?.getAttribute("class")).toContain("-translate-y-[1.5px]");
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
