import { describe, expect, it } from "bun:test";
import type { Id } from "@convex/_generated/dataModel";
import { render, screen } from "@testing-library/react";
import { TextBlastRecipientTable } from "../components/text-blasts/text-blast-recipient-table";
import { HapticProvider } from "../contexts/haptic-context";

describe("TextBlastRecipientTable", () => {
  it("counts a contact with RSVPs at multiple events as one selected recipient", () => {
    const firstRsvpId = "rsvp_first" as Id<"rsvps">;
    const secondRsvpId = "rsvp_second" as Id<"rsvps">;

    render(
      <HapticProvider>
        <TextBlastRecipientTable
          recipients={[
            {
              rsvpId: firstRsvpId,
              sourceRsvpIds: [firstRsvpId, secondRsvpId],
              name: "Jacob Stein",
              listKey: "rsvp",
              eventId: "event_first" as Id<"events">,
              eventName: "Club Chlorine",
              approvalStatus: "approved",
              attendanceStatus: "yes",
              ticketStatus: "issued",
              smsConsent: true,
              createdAt: Date.now(),
            },
          ]}
          selectedRsvpIds={[firstRsvpId, secondRsvpId]}
          sendableRecipientCount={1}
          listOptions={["rsvp"]}
          onSelectedRsvpIdsChange={() => undefined}
        />
      </HapticProvider>,
    );

    expect(screen.getByText(/selected · 1 matching · 1 sendable/).textContent).toBe(
      "1 selected · 1 matching · 1 sendable",
    );
  });
});
