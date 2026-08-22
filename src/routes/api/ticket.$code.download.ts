import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ticket/$code/download")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { code: string } }) => {
        const { ticketPdfResponse } = await import("@/lib/ticket-download.server");
        return ticketPdfResponse(params.code);
      },
    },
  },
});
