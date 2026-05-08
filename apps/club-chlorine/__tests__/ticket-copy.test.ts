import { describe, expect, it } from "bun:test";
import {
  getByNameTicketInstruction,
  getTicketConfirmationToastDescription,
  ticketCopyShouldMentionQr,
} from "../lib/ticket-copy";

describe("ticket copy", () => {
  it("does not mention QR for by-name lists", () => {
    const copyInput = { generateQR: false, redemptionCode: null };

    expect(ticketCopyShouldMentionQr(copyInput)).toBe(false);
    expect(getTicketConfirmationToastDescription(copyInput)).not.toMatch(/qr/i);
    expect(getByNameTicketInstruction()).not.toMatch(/qr/i);
  });

  it("only mentions QR when QR generation is enabled and a code exists", () => {
    expect(ticketCopyShouldMentionQr({ generateQR: true, redemptionCode: null })).toBe(false);
    expect(ticketCopyShouldMentionQr({ generateQR: true, redemptionCode: "ABC123" })).toBe(true);
    expect(
      getTicketConfirmationToastDescription({ generateQR: true, redemptionCode: "ABC123" }),
    ).toMatch(/qr/i);
  });
});
