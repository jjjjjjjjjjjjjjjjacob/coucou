import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DanzaTicket } from "../components/danza-ticket";

describe("Danza ticket", () => {
  it("cascades ticket content, actions, and details in visual order", () => {
    const { container } = render(
      <DanzaTicket
        backHref="/events/danza/ticket"
        eventName="Danza Organica"
        secondaryTitle="Vol. 4"
        qrValue=""
        showQr={false}
        noQrSlot={<p>Confirmed by name</p>}
        actions={[
          <button key="download" type="button">
            Download
          </button>,
          <button key="share" type="button">
            Share
          </button>,
        ]}
        details={[
          { label: "When", value: "Friday 08.21.26" },
          { label: "Where", value: "Laissez-Faire" },
        ]}
      />,
    );
    const entranceElements = Array.from(
      container.querySelectorAll<HTMLElement>(".danza-bauhaus-enter"),
    );
    const ruleElements = Array.from(
      container.querySelectorAll<HTMLElement>(".danza-bauhaus-rule-enter"),
    );

    expect(screen.getByRole("heading", { name: "Danza Organica" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    expect(entranceElements).toHaveLength(9);
    expect(
      entranceElements.map((element) =>
        element.style.getPropertyValue("--danza-bauhaus-enter-delay"),
      ),
    ).toEqual(entranceElements.map((_element, sequenceIndex) => `${180 + sequenceIndex * 90}ms`));
    expect(
      ruleElements.map((element) => element.style.getPropertyValue("--danza-bauhaus-enter-delay")),
    ).toEqual(["540ms", "810ms", "900ms"]);
  });
});
