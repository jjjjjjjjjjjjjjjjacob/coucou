"use client";

import { RsvpPageClient } from "../rsvp-page-client";

export default function FullRsvpPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <RsvpPageClient params={params} />;
}
