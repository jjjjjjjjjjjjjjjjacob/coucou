export interface TicketCopyInput {
  generateQR?: boolean;
  redemptionCode?: string | null;
}

export function ticketCopyShouldMentionQr({
  generateQR,
  redemptionCode,
}: TicketCopyInput): boolean {
  return generateQR !== false && Boolean(redemptionCode);
}

export function getTicketConfirmationToastDescription(input: TicketCopyInput): string {
  if (ticketCopyShouldMentionQr(input)) {
    return "Your QR code is now visible below.";
  }
  return "You are on the list. Show this ticket at the door.";
}

export function getByNameTicketInstruction(): string {
  return "This list verifies guests by name at the door.";
}
