import TicketServerPage from "../page-server";

export default function TicketPassPage({ params }: { params: Promise<{ eventId: string }> }) {
  return <TicketServerPage params={params} view="ticket" />;
}
