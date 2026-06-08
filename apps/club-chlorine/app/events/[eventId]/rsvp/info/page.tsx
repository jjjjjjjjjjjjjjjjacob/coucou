"use client";

import { RsvpPageClient } from "../rsvp-page-client";

export default function InfoRsvpPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <RsvpPageClient params={params} />;
}
