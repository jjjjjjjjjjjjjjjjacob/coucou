export interface LandingOpenGraphEventEntry {
  event: {
    eventDate: number;
    isFeatured?: boolean;
    lifecycle?: string;
    status?: string;
  };
  flyerUrl: string | null;
}

export function selectLandingOpenGraphImageUrl(
  eventEntries: LandingOpenGraphEventEntry[],
  fallbackImageUrl: string,
): string {
  const publishedEventEntries = eventEntries.filter(
    ({ event }) => (event.lifecycle ?? "published") === "published",
  );
  const featuredEventEntry = publishedEventEntries.find(({ event }) => event.isFeatured);
  const activeEventEntries = publishedEventEntries.filter(
    ({ event }) => (event.status ?? "active") === "active",
  );
  const fallbackEventEntries =
    activeEventEntries.length > 0 ? activeEventEntries : publishedEventEntries;
  const mostRecentEventEntry = fallbackEventEntries.reduce<LandingOpenGraphEventEntry | undefined>(
    (mostRecentEntry, candidateEntry) => {
      if (!mostRecentEntry || candidateEntry.event.eventDate > mostRecentEntry.event.eventDate) {
        return candidateEntry;
      }
      return mostRecentEntry;
    },
    undefined,
  );
  const selectedEventEntry = featuredEventEntry ?? mostRecentEventEntry;

  return selectedEventEntry?.flyerUrl ?? fallbackImageUrl;
}
