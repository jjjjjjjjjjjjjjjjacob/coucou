"use client";

import { RsvpPageClient } from "./rsvp-page-client";

export default function RsvpPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <RsvpPageClient params={params} formVariant="stepped" />;
}
