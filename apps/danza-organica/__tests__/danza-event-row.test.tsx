import { describe, expect, it } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DanzaEventRow } from "../components/danza-event-row";

describe("DanzaEventRow", () => {
  it("presents the complete event identity and artist lineup", () => {
    render(
      <DanzaEventRow
        event={{
          id: "nothing-radio",
          title: "Nothing Radio",
          subtitle: "A night of live transmission",
          date: "FRI 08.21",
          location: "Brooklyn, New York",
          lineup: [{ label: "Ana Roxanne", descriptorBadges: ["LIVE"] }, { label: "DJ Python" }],
          rsvpHref: "/events/nothing-radio/rsvp",
          rsvpLabel: "RSVP",
        }}
        mobile={false}
        visible
        delayMs={0}
        detailHref="/events/nothing-radio"
      />,
    );

    expect(screen.getByRole("heading", { name: "Nothing Radio" })).toBeTruthy();
    expect(screen.getByText("A night of live transmission")).toBeTruthy();
    expect(screen.getByLabelText("Featuring")).toHaveTextContent("Ana Roxanne");
    expect(screen.getByLabelText("Featuring")).toHaveTextContent("DJ Python");
    expect(screen.getByText("FRI 08.21")).toBeTruthy();
    expect(screen.getByText("Brooklyn, New York")).toBeTruthy();
    expect(screen.getByRole("link", { name: "RSVP" })).toHaveAttribute(
      "href",
      "/events/nothing-radio/rsvp",
    );
    expect(screen.getByRole("link", { name: "Details" })).toHaveAttribute(
      "href",
      "/events/nothing-radio",
    );
  });

  it("keeps sibling events compact while retaining their title and artists", () => {
    render(
      <DanzaEventRow
        event={{
          id: "next-event",
          title: "Body Language",
          subtitle: "Summer Session",
          date: "SAT 09.12",
          lineup: ["KeiyaA", "Duendita"],
        }}
        mobile={false}
        visible
        delayMs={0}
        variant="minimized"
        detailHref="/events/next-event"
      />,
    );

    const detailLink = screen.getByRole("link");
    expect(detailLink).toHaveAttribute("href", "/events/next-event");
    expect(detailLink).toHaveTextContent("Body Language — Summer Session");
    expect(detailLink).toHaveTextContent("KeiyaA · Duendita");
  });

  it("renders Back beneath the event action on the detail view", () => {
    render(
      <DanzaEventRow
        event={{
          id: "nothing-radio",
          title: "Nothing Radio",
          date: "FRIDAY 08.21.26 · 9:00 PM",
          lineup: ["Ana Roxanne"],
          rsvpHref: "/events/nothing-radio/rsvp",
          rsvpLabel: "RSVP",
        }}
        mobile={false}
        visible
        delayMs={0}
        variant="expanded"
        detailHref="/"
        detailLabel="← Back"
      />,
    );

    const rsvpLink = screen.getByRole("link", { name: "RSVP" });
    const backLink = screen.getByRole("link", { name: "← Back" });
    expect(backLink).toHaveAttribute("href", "/");
    expect(rsvpLink.compareDocumentPosition(backLink) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(
      0,
    );
  });
});
