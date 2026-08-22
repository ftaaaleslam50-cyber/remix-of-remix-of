import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ticket/$code/download")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { code: string } }) => {
        try {
          const { ticketPdfResponse } = await import("@/lib/ticket-download.server");
          return await ticketPdfResponse(params.code);
        } catch (err) {
          console.error(err);
          return new Response("تعذّر إنشاء ملف التذكرة، حاول مرة أخرى.", {
            status: 500,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
      },
    },
  },
});
