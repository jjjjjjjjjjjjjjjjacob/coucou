import { describe, expect, it, mock } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";

mock.module("convex/react", () => ({
  useQuery: (_queryReference: unknown, queryArguments: { storageId: string }) => ({
    url: `https://assets.example.com/${queryArguments.storageId}.png`,
  }),
}));

const { BAUHAUS_PARTICLE_APPEARANCES, BauhausLineField } = await import(
  "../components/bauhaus-line-field"
);
const { DanzaBauhausEvent, DanzaBauhausPage } = await import("../components/danza-bauhaus-event");
const { DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS } = await import("../lib/bauhaus-event-display");
const BOLD_DISPLAY_SETTINGS = {
  ...DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
  textColor: "black",
  logoVariant: "tealblack",
  dotColor: "black",
  preset: "bold",
  infoDensity: "verbose",
} as const;

describe("Danza Bauhaus event experience", () => {
  it("keeps the production camera surface frozen", () => {
    const { container, unmount } = render(<BauhausLineField />);
    const field = container.querySelector('[data-bauhaus-camera="frozen"]');
    expect(field).toBeTruthy();
    expect(field).toHaveClass("danza-bauhaus-field");
    unmount();
  });

  it("passes the selected dot color to the frozen particle field", () => {
    const { container, unmount } = render(<BauhausLineField dotColor="white" />);
    expect(container.querySelector('[data-dot-color="white"]')).toBeTruthy();
    expect(BAUHAUS_PARTICLE_APPEARANCES.white).toEqual({
      start: [1, 1, 1],
      end: [1, 1, 1],
      lightingStrength: 0,
    });
    unmount();
  });

  it("cascades poster lines and actions in visual order", () => {
    const { container } = render(
      <DanzaBauhausPage displaySettings={BOLD_DISPLAY_SETTINGS}>
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
        />
      </DanzaBauhausPage>,
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
      <DanzaBauhausPage displaySettings={BOLD_DISPLAY_SETTINGS}>
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
        />
      </DanzaBauhausPage>,
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

  it("renders the simple preset as a minimal artist-to-RSVP brand stack", () => {
    const { container } = render(
      <DanzaBauhausPage
        displaySettings={{
          ...DEFAULT_BAUHAUS_EVENT_DISPLAY_SETTINGS,
          preset: "simple",
          infoDensity: "minimal",
          dotColor: "white",
          textColor: "orange",
        }}
      >
        <DanzaBauhausEvent
          event={{
            id: "simple",
            title: "Danza Organica",
            subtitle: "Vol. 4",
            hosts: ["Host One"],
            date: "Friday 08.21.26 · 9:00 PM",
            compactDate: "FRI 08.21",
            location: "Laissez-Faire",
            lineup: [{ label: "Nothing Radio" }],
            rsvpHref: "/events/simple/rsvp",
          }}
          sponsors={[
            {
              label: "The Market",
              logoStorageId: "market" as Id<"_storage">,
            },
          ]}
          partners={[
            {
              label: "Nothing Radio",
              logoStorageId: "radio" as Id<"_storage">,
            },
            {
              label: "The Market",
              logoStorageId: "market" as Id<"_storage">,
            },
          ]}
          expandedContent={<p>Long event description</p>}
        />
      </DanzaBauhausPage>,
    );

    const simplePage = container.querySelector<HTMLElement>(
      '[data-preset="simple"][data-info="minimal"]',
    );
    expect(simplePage).toBeTruthy();
    expect(simplePage?.style.getPropertyValue("--danza-bauhaus-dot")).toBe("#FFFFFF");
    expect(container.querySelector('[data-dot-color="white"]')).toBeTruthy();
    expect(container.querySelector('[data-text-color="orange"]')).toBeTruthy();
    expect(screen.queryByLabelText("Featuring")).toBeNull();
    expect(screen.queryByLabelText("Hosted by")).toBeNull();
    expect(screen.queryByLabelText("Sponsored by")).toBeNull();
    expect(screen.queryByText("Long event description")).toBeNull();
    expect(container.querySelector(".danza-bauhaus-copy-line--date")).toHaveTextContent(
      "FRI 08.21Laissez-Faire",
    );

    const artistLogo = screen.getByRole("img", { name: "Nothing Radio" });
    const marketLogo = screen.getByRole("img", { name: "The Market" });
    const rsvpLink = screen.getByRole("link", { name: "RSVP" });
    expect(screen.getByText("Featuring")).toBeVisible();
    expect(screen.getByText("Sponsored by")).toBeVisible();
    expect(artistLogo).toHaveAttribute("src", "/partners/nothing-radio.png");
    expect(marketLogo).toHaveAttribute("src", "/partners/the-market-danza.svg");
    expect(
      artistLogo.compareDocumentPosition(rsvpLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      rsvpLink.compareDocumentPosition(marketLogo) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });
});
