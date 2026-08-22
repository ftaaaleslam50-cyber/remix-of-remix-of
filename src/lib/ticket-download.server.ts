import { buildTicketPdf, fetchTicket } from "./ticket-pdf.server";

/** Shared handler: returns the ticket as a downloadable application/pdf response. */
export async function ticketPdfResponse(code: string): Promise<Response> {
  const clean = String(code || "").trim();
  if (!clean || clean.length > 64) return new Response("Bad request", { status: 400 });

  const booking = await fetchTicket(clean);
  if (!booking) return new Response("Ticket not found", { status: 404 });

  const bytes = await buildTicketPdf(booking);
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="ticket-${booking.booking_code}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
