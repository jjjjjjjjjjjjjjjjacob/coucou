import { describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";

mock.module("convex/react", () => ({
  useQuery: (_queryReference: unknown, queryArguments: { storageId: string }) => ({
    url: `https://assets.example.com/${queryArguments.storageId}.png`,
  }),
}));

const { BauhausLineField } = await import("../components/bauhaus-line-field");
const { DanzaBauhausEvent } = await import("../components/danza-bauhaus-event");

describe("Danza Bauhaus event experience", () => {
  it("keeps the production camera surface frozen", () => {
    const { container, unmount } = render(<BauhausLineField />);
    const field = container.querySelector('[data-bauhaus-camera="frozen"]');
    expect(field).toBeTruthy();
    expect(field).toHaveClass("danza-bauhaus-field");
    unmount();
  });

  it("cascades poster lines and actions in visual order", () => {
    const { container } = render(
      <DanzaBauhausEvent
        event={{
          id: "sequence",
          title: "Danza Organica",
          subtitle: "Vol. 4",
          hosts: ["Toma Shade", "Luis V", "Alegra", "Kelsey", "Elsb3th", "Gio", "Carter H"],
          date: "Friday 08.21.26 · 9:00 PM",
          lineup: [{ label: "Nothing Radio" }],
          rsvpHref: "/events/sequence/rsvp",
          rsvpLabel: "RSVP",
        }}
      />,
    );

    const entranceElements = Array.from(
      container.querySelectorAll<HTMLElement>(".danza-bauhaus-enter"),
    );
    expect(entranceElements.length).toBeGreaterThan(6);
    expect(
      entranceElements.map((element) =>
        element.style.getPropertyValue("--danza-bauhaus-enter-delay"),
      ),
    ).toEqual(entranceElements.map((_element, sequenceIndex) => `${180 + sequenceIndex * 90}ms`));
    expect(screen.getByRole("link", { name: "RSVP" })).toHaveClass("danza-bauhaus-enter");
  });

  it("renders poster billing, the fixed host break, RSVP, and bottom partner logos", () => {
    render(
      <DanzaBauhausEvent
        event={{
          id: "tgn47p2",
          title: "Danza Organica",
          subtitle: "Vol. 4",
          hosts: ["Toma Shade", "Luis V", "Alegra", "Kelsey", "Elsb3th", "Gio", "Carter H"],
          date: "Friday 08.21.26 · 9:00 PM",
          location: "Laissez-Faire",
          lineup: [{ label: "Nothing Radio", href: "https://example.com/radio" }],
          rsvpHref: "/events/tgn47p2/rsvp",
          rsvpLabel: "RSVP",
        }}
        sponsors={[
          {
            label: "The Market",
            logoStorageId: "market" as Id<"_storage">,
          },
        ]}
        partners={[
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

    expect(screen.getByRole("heading", { name: "Danza Organica" })).toBeTruthy();
    expect(screen.getByLabelText("Featuring")).toHaveTextContent("Nothing Radio");
    expect(screen.getByLabelText("Sponsored by")).toHaveTextContent("The Market");
    expect(screen.getByRole("link", { name: "RSVP" })).toHaveAttribute(
      "href",
      "/events/tgn47p2/rsvp",
    );
    expect(screen.queryByRole("link", { name: "Details" })).toBeNull();
    expect(screen.queryByRole("link", { name: "← Back" })).toBeNull();

    const hostBilling = screen.getByLabelText("Hosted by");
    const forcedLineBreak = hostBilling.querySelector("br");
    expect(forcedLineBreak).toBeTruthy();
    expect(hostBilling.innerHTML.indexOf("Kelsey")).toBeLessThan(
      hostBilling.innerHTML.indexOf("<br>"),
    );
    expect(hostBilling.innerHTML.indexOf("<br>")).toBeLessThan(
      hostBilling.innerHTML.indexOf("Elsb3th"),
    );

    const partnerRegion = screen.getByLabelText("Event partners");
    const marketLogo = screen.getByRole("img", { name: "The Market" });
    const nothingRadioLogo = screen.getByRole("img", { name: "Nothing Radio" });
    expect(partnerRegion).toContainElement(marketLogo);
    expect(partnerRegion).toContainElement(nothingRadioLogo);
    expect(marketLogo).toHaveAttribute("src", "/partners/the-market-wordmark-teal-black.svg");
    expect(nothingRadioLogo).toHaveAttribute("src", "/partners/nothing-radio-teal-black.svg");
    expect(
      screen.getByRole("link", { name: "RSVP" }).compareDocumentPosition(partnerRegion) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});
