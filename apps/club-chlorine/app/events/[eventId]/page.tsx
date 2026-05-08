import EventPageClient from "./page-client";

type Props = {
  params: Promise<{ eventId: string }>;
};

export default function EventPage({ params }: Props) {
  return <EventPageClient params={params} />;
}
