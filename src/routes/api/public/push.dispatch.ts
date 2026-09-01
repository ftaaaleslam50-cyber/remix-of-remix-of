import { createFileRoute } from '@tanstack/react-router';
import { generatePushHTTPRequest, ApplicationServerKeys } from 'webpush-webcrypto';

const iconPath = '/brand-logo.png';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export const Route = createFileRoute('/api/public/push/dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: config } = await supabaseAdmin.from('push_hook_config').select('token, enabled').eq('id', 1).maybeSingle();
        if (!config?.enabled || request.headers.get('x-push-token') !== config.token) return json({ error: 'Unauthorized' }, 401);

        let payload: { notification_id?: string };
        try { payload = await request.json() as { notification_id?: string }; } catch { return json({ error: 'Invalid JSON' }, 400); }
        if (!payload.notification_id) return json({ error: 'Missing notification id' }, 400);

        const { data: notification, error: notificationError } = await supabaseAdmin.from('notifications').select('id, title, body, action_url, link, booking_id, type, category, recipient_user_id').eq('id', payload.notification_id).maybeSingle();
        if (notificationError || !notification || !notification.recipient_user_id) return json({ ok: true, sent: 0 });
        const { data: subscriptions } = await supabaseAdmin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', notification.recipient_user_id).eq('is_active', true);
        if (!subscriptions?.length) return json({ ok: true, sent: 0 });

        const vapidPublic = process.env['VAPID_PUBLIC_KEY'];
        const vapidPrivate = process.env['VAPID_PRIVATE_KEY'];
        const subject = process.env['VAPID_SUBJECT'];
        if (!vapidPublic || !vapidPrivate || !subject) return json({ error: 'Push service is not configured' }, 500);
        const keys = await ApplicationServerKeys.fromJSON({ publicKey: vapidPublic, privateKey: vapidPrivate });
        const body = JSON.stringify({ title: notification.title, body: notification.body || '', icon: iconPath, badge: iconPath, url: notification.action_url || notification.link || '/', notification_id: notification.id, booking_id: notification.booking_id, type: notification.type || notification.category });
        let sent = 0;
        for (const subscription of subscriptions) {
          try {
            const requestData = await generatePushHTTPRequest({ applicationServerKeys: keys, payload: body, target: { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, adminContact: subject, ttl: 86400, urgency: 'normal' });
            const response = await fetch(requestData.endpoint, { method: 'POST', headers: requestData.headers, body: requestData.body });
            const updatedAt = new Date().toISOString();
            if (response.ok) { sent += 1; await supabaseAdmin.from('push_subscriptions').update({ last_error: null, updated_at: updatedAt }).eq('id', subscription.id); }
            else await supabaseAdmin.from('push_subscriptions').update({ is_active: response.status === 404 || response.status === 410 ? false : true, last_error: `Push service ${response.status}`, updated_at: updatedAt }).eq('id', subscription.id);
          } catch (error) { await supabaseAdmin.from('push_subscriptions').update({ last_error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error', updated_at: new Date().toISOString() }).eq('id', subscription.id); }
        }
        return json({ ok: true, sent });
      },
    },
  },
});
