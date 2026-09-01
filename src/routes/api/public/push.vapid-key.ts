import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/push/vapid-key')({
  server: {
    handlers: {
      GET: async () => {
        const publicKey = process.env['VAPID_PUBLIC_KEY'];
        if (!publicKey) return new Response(JSON.stringify({ error: 'Push service is not configured' }), { status: 503, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ publicKey }), {
          headers: {
            'cache-control': 'public, max-age=3600',
            'content-type': 'application/json; charset=utf-8',
          },
        });
      },
    },
  },
});
