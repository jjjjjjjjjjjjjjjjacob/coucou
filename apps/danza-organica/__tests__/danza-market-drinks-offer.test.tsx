import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DanzaMarketDrinksOffer } from "../components/danza-market-drinks-offer";

describe("Danza Market drinks offer", () => {
  it("explains the first-50-match offer and links to the current download page", () => {
    const { container } = render(<DanzaMarketDrinksOffer ticketHref="/events/danza/ticket/pass" />);

    expect(screen.getByRole("heading", { name: "Drinks on us" })).toBeTruthy();
    expect(
      screen.queryByText(
        "Download The Market and match at the event. The first 50 matches get free drinks.",
      ),
    ).toBeNull();
    expect(container.querySelector(".danza-market-offer__heart")?.getAttribute("src")).toContain(
      "the-market-heart-black.svg",
    );
    expect(container.querySelector(".danza-market-offer__heart")?.closest("h2")?.textContent).toBe(
      "Drinks on us",
    );
    expect(screen.getByRole("link", { name: /Download The Market/i }).getAttribute("href")).toBe(
      "https://the-market.app/downloads",
    );
    expect(screen.getByRole("link", { name: /Go to ticket/i }).getAttribute("href")).toBe(
      "/events/danza/ticket/pass",
    );
  });

  it("shows the full download-to-redemption sequence", () => {
    const { container } = render(<DanzaMarketDrinksOffer ticketHref="/events/danza/ticket/pass" />);

    expect(screen.getByText("Download")).toBeTruthy();
    expect(screen.getByText("Onboard")).toBeTruthy();
    expect(screen.getByText("Match")).toBeTruthy();
    expect(screen.getByText("Match with someone at the event.")).toBeTruthy();
    expect(screen.getByText("Redeem")).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll(".danza-market-offer__route")).map((route) =>
        route.getAttribute("d"),
      ),
    ).toEqual(["M155 105H225", "M345 105H398", "M552 105H605"]);
    expect(container.querySelectorAll(".danza-market-offer__icon-plate")).toHaveLength(4);
    expect(container.querySelectorAll(".danza-market-offer__micro")).toHaveLength(4);
    expect(container.querySelectorAll(".danza-market-offer__text-step")).toHaveLength(4);
    expect(container.querySelector(".danza-market-offer__text-step--match")?.textContent).toContain(
      "Match with someone at the event.",
    );
  });

  it("cascades offer content and actions in visual order", () => {
    const { container } = render(<DanzaMarketDrinksOffer ticketHref="/events/danza/ticket/pass" />);
    const entranceElements = Array.from(
      container.querySelectorAll<HTMLElement>(".danza-bauhaus-enter"),
    );
    const frameElement = container.querySelector<HTMLElement>(".danza-bauhaus-frame-enter");
    const borderElements = Array.from(
      container.querySelectorAll<HTMLElement>(".danza-bauhaus-border-enter"),
    );

    expect(entranceElements).toHaveLength(11);
    expect(
      entranceElements.map((element) =>
        element.style.getPropertyValue("--danza-bauhaus-enter-delay"),
      ),
    ).toEqual(entranceElements.map((_element, sequenceIndex) => `${180 + sequenceIndex * 90}ms`));
    expect(frameElement?.style.getPropertyValue("--danza-bauhaus-enter-delay")).toBe("180ms");
    expect(
      borderElements.map((element) =>
        element.style.getPropertyValue("--danza-bauhaus-enter-delay"),
      ),
    ).toEqual(["630ms", "630ms", "720ms", "810ms", "900ms"]);
  });
});
