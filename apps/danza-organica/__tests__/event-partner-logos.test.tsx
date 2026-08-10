import { describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";

mock.module("convex/react", () => ({
  useQuery: (_queryReference: unknown, queryArguments: { storageId: string }) => ({
    url: `https://assets.example.com/${queryArguments.storageId}.png`,
  }),
}));

const { EventPartnerLogos } = await import("../components/event-partner-logos");

describe("EventPartnerLogos", () => {
  it("uses stored labels as alt text and only links entries with URLs", () => {
    render(
      <EventPartnerLogos
        ariaLabel="Event partners"
        entries={[
          {
            label: "The Market",
            logoStorageId: "market" as Id<"_storage">,
            url: "https://themarket.nyc",
          },
          {
            label: "Nothing Radio",
            logoStorageId: "radio" as Id<"_storage">,
          },
        ]}
      />,
    );

    const marketLogo = screen.getByRole("img", { name: "The Market" });
    const nothingRadioLogo = screen.getByRole("img", { name: "Nothing Radio" });
    expect(marketLogo).toHaveAttribute("src", "https://assets.example.com/market.png");
    expect(nothingRadioLogo).toHaveAttribute("src", "https://assets.example.com/radio.png");
    expect(marketLogo).toHaveStyle({ height: "42px" });
    expect(nothingRadioLogo).toHaveStyle({ height: "76px" });
    expect(screen.getByRole("link", { name: "The Market" })).toHaveAttribute(
      "href",
      "https://themarket.nyc",
    );
    expect(screen.queryByRole("link", { name: "Nothing Radio" })).toBeNull();
    expect(
      marketLogo.compareDocumentPosition(nothingRadioLogo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("gives the Market wordmark more scale in RSVP branding", () => {
    render(
      <EventPartnerLogos
        ariaLabel="RSVP event partners"
        size="rsvp"
        entries={[
          {
            label: "The Market",
            logoStorageId: "market" as Id<"_storage">,
          },
          {
            label: "Nothing Radio",
            logoStorageId: "radio" as Id<"_storage">,
          },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "The Market" })).toHaveStyle({
      height: "54px",
      maxWidth: "196px",
    });
    expect(screen.getByRole("img", { name: "Nothing Radio" })).toHaveStyle({
      height: "58px",
      maxWidth: "176px",
    });
  });
});
