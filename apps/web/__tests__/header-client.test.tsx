import React from "react";
import { describe, it, expect } from "bun:test";
import { renderWithProviders, screen } from "./test-wrapper";
import userEvent from "@testing-library/user-event";

async function renderAndOpenMenu() {
  const user = userEvent.setup();
  renderWithProviders(<HeaderClient />);
  const triggerButton = screen.getByRole("button", {
    name: /dojo pomodoro icon/i,
  });
  await user.click(triggerButton);
}

import HeaderClient from "../app/header-client";

describe("HeaderClient navigation", () => {
  it("shows profile and account links for signed in users", async () => {
    await renderAndOpenMenu();

    const profileLink = await screen.findByRole("menuitem", { name: /profile/i });
    const accountLink = await screen.findByRole("menuitem", { name: /account settings/i });

    expect(profileLink).toBeInTheDocument();
    expect(accountLink).toBeInTheDocument();
    expect(profileLink).toHaveAttribute("href", "/profile");
    expect(accountLink).toHaveAttribute("href", "/account");
  });
});
