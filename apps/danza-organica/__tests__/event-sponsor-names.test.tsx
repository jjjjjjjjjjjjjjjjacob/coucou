import { describe, expect, it } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import { EventSponsorNames } from "../components/event-sponsor-names";

describe("EventSponsorNames", () => {
  it("renders sponsor labels as ordered text and only links entries with URLs", () => {
    render(
      <EventSponsorNames
        entries={[
          {
            label: "The Market",
            logoStorageId: "market" as Id<"_storage">,
          },
          {
            label: "Guest Sponsor",
            logoStorageId: "guest" as Id<"_storage">,
            url: "https://sponsor.example.com",
          },
        ]}
      />,
    );

    const sponsorGroup = screen.getByLabelText("Event sponsors");
    const marketName = screen.getByText("The Market");
    const guestSponsorLink = screen.getByRole("link", { name: "Guest Sponsor" });

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("link", { name: "The Market" })).toBeNull();
    expect(guestSponsorLink).toHaveAttribute("href", "https://sponsor.example.com");
    expect(
      marketName.compareDocumentPosition(guestSponsorLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(sponsorGroup).toHaveTextContent("The Market·Guest Sponsor");
  });
});
