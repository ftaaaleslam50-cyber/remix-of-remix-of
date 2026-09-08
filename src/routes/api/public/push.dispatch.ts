import { createFileRoute } from '@tanstack/react-router';
import { generatePushHTTPRequest, ApplicationServerKeys } from 'webpush-webcrypto';

const iconPath = '/brand-logo.png';
const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = [1, 5, 15];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

type Classification = 'sent' | 'gone' | 'transient' | 'permanent';

function classify(status: number): Classification {
  if (status >= 200 && status < 300) return 'sent';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'transient';
  return 'permanent';
}

type DeliveryRow = {
  id: string;
  attempt_count: number;
  notification_id: string;
  subscription_id: string;
  push_subscriptions: { endpoint: string; p256dh: string; auth: string } | null;
  notifications: {
    id: string;
    title: string;
    body: string | null;
    action_url: string | null;
    link: string | null;
    booking_id: string | null;
    type: string | null;
    category: string | null;
  } | null;
};

export const Route = createFileRoute('/api/public/push/dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: config } = await supabaseAdmin.from('push_hook_config').select('token, enabled').eq('id', 1).maybeSingle();
        if (!config?.enabled || request.headers.get('x-push-token') !== config.token) return json({ error: 'Unauthorized' }, 401);

        let payload: { notification_id?: string; retry?: boolean };
        try { payload = await request.json() as { notification_id?: string; retry?: boolean }; } catch { return json({ error: 'Invalid JSON' }, 400); }

        const vapidPublic = process.env['VAPID_PUBLIC_KEY'];
        const vapidPrivate = process.env['VAPID_PRIVATE_KEY'];
        const subject = process.env['VAPID_SUBJECT'];
        if (!vapidPublic || !vapidPrivate || !subject) return json({ error: 'Push service is not configured' }, 500);

        // 1) Queue deliveries for a freshly created notification (idempotent).
        if (payload.notification_id) {
          if (!/^[0-9a-f-]{36}$/i.test(payload.notification_id)) return json({ error: 'Invalid notification id' }, 400);
          const queued = await queueDeliveries(supabaseAdmin, payload.notification_id);
          if (queued.skipped) return json({ ok: true, sent: 0, skipped: queued.skipped });
        } else if (!payload.retry) {
          return json({ error: 'Nothing to do' }, 400);
        }

        // 2) Expire stale work, then process everything that is due.
        const nowIso = new Date().toISOString();
        await supabaseAdmin.from('push_deliveries')
          .update({ status: 'expired', error_code: 'expired', error_message: 'انتهت صلاحية الإرسال بعد 24 ساعة', updated_at: nowIso })
          .in('status', ['pending', 'failed', 'sending'])
          .lt('queued_at', new Date(Date.now() - 86400_000).toISOString());

        const { data: due } = await supabaseAdmin
          .from('push_deliveries')
          .select('id, attempt_count, notification_id, subscription_id, push_subscriptions(endpoint, p256dh, auth), notifications(id, title, body, action_url, link, booking_id, type, category)')
          .in('status', ['pending', 'failed'])
          .lt('attempt_count', MAX_ATTEMPTS)
          .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
          .gte('queued_at', new Date(Date.now() - 86400_000).toISOString())
          .limit(200);

        const rows = (due ?? []) as unknown as DeliveryRow[];
        if (!rows.length) return json({ ok: true, sent: 0 });

        await supabaseAdmin.from('push_deliveries').update({ status: 'sending', updated_at: nowIso }).in('id', rows.map((r) => r.id));

        const keys = await ApplicationServerKeys.fromJSON({ publicKey: vapidPublic, privateKey: vapidPrivate });

        // 3) Send in parallel — one device failing never blocks the others.
        const results = await Promise.allSettled(rows.map(async (row) => {
          const subscription = row.push_subscriptions;
          const notification = row.notifications;
          const attempt = row.attempt_count + 1;
          if (!subscription || !notification) {
            await markPermanent(supabaseAdmin, row.id, attempt, 'missing', 'الاشتراك أو الإشعار غير موجود');
            return 'permanent' as Classification;
          }

          const body = JSON.stringify({
            title: notification.title,
            body: notification.body || '',
            icon: iconPath,
            badge: iconPath,
            url: notification.action_url || notification.link || '/',
            notification_id: notification.id,
            booking_id: notification.booking_id,
            type: notification.type || notification.category,
          });

          try {
            const requestData = await generatePushHTTPRequest({
              applicationServerKeys: keys,
              payload: body,
              target: { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
              adminContact: subject,
              ttl: 86400,
              urgency: 'normal',
            });
            const response = await fetch(requestData.endpoint, { method: 'POST', headers: requestData.headers, body: requestData.body });
            const kind = classify(response.status);
            const stamp = new Date().toISOString();

            if (kind === 'sent') {
              await supabaseAdmin.from('push_deliveries').update({ status: 'sent', attempt_count: attempt, sent_at: stamp, next_retry_at: null, error_code: null, error_message: null, updated_at: stamp }).eq('id', row.id);
              await supabaseAdmin.from('push_subscriptions').update({ last_error: null, updated_at: stamp }).eq('id', row.subscription_id);
              return 'sent' as Classification;
            }

            if (kind === 'gone') {
              await supabaseAdmin.from('push_deliveries').update({ status: 'failed', attempt_count: MAX_ATTEMPTS, failed_at: stamp, next_retry_at: null, error_code: String(response.status), error_message: 'اشتراك غير صالح - تم تعطيله', updated_at: stamp }).eq('id', row.id);
              await supabaseAdmin.from('push_subscriptions').update({ is_active: false, last_error: `Push service ${response.status}`, updated_at: stamp }).eq('id', row.subscription_id);
              return 'gone' as Classification;
            }

            if (kind === 'transient' && attempt < MAX_ATTEMPTS) {
              const delay = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)] ?? 15;
              await supabaseAdmin.from('push_deliveries').update({ status: 'failed', attempt_count: attempt, failed_at: stamp, next_retry_at: new Date(Date.now() + delay * 60_000).toISOString(), error_code: String(response.status), error_message: 'خطأ مؤقت - ستتم إعادة المحاولة', updated_at: stamp }).eq('id', row.id);
              await supabaseAdmin.from('push_subscriptions').update({ last_error: `Push service ${response.status}`, updated_at: stamp }).eq('id', row.subscription_id);
              return 'transient' as Classification;
            }

            await markPermanent(supabaseAdmin, row.id, attempt, String(response.status), kind === 'transient' ? 'فشل بعد استنفاد المحاولات' : 'خطأ دائم في الإرسال');
            await supabaseAdmin.from('push_subscriptions').update({ last_error: `Push service ${response.status}`, updated_at: stamp }).eq('id', row.subscription_id);
            return 'permanent' as Classification;
          } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
            const stamp = new Date().toISOString();
            if (attempt < MAX_ATTEMPTS) {
              const delay = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)] ?? 15;
              await supabaseAdmin.from('push_deliveries').update({ status: 'failed', attempt_count: attempt, failed_at: stamp, next_retry_at: new Date(Date.now() + delay * 60_000).toISOString(), error_code: 'network', error_message: message, updated_at: stamp }).eq('id', row.id);
              return 'transient' as Classification;
            }
            await markPermanent(supabaseAdmin, row.id, attempt, 'network', message);
            return 'permanent' as Classification;
          }
        }));

        const outcomes = results.map((r) => (r.status === 'fulfilled' ? r.value : 'permanent'));
        const sent = outcomes.filter((o) => o === 'sent').length;
        const retrying = outcomes.filter((o) => o === 'transient').length;

        // Wake the light-weight retry job only while retryable work exists.
        if (retrying > 0) await supabaseAdmin.rpc('arm_push_retry');

        return json({ ok: true, processed: rows.length, sent, retrying, failed: outcomes.length - sent - retrying });
      },
    },
  },
});

type AdminClient = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

async function markPermanent(supabaseAdmin: AdminClient, id: string, attempt: number, code: string, message: string) {
  const stamp = new Date().toISOString();
  await supabaseAdmin.from('push_deliveries').update({ status: 'failed', attempt_count: attempt, failed_at: stamp, next_retry_at: null, error_code: code, error_message: message, updated_at: stamp }).eq('id', id);
}

async function queueDeliveries(supabaseAdmin: AdminClient, notificationId: string): Promise<{ skipped?: string }> {
  const { data: notification } = await supabaseAdmin.from('notifications').select('id, category, recipient_user_id').eq('id', notificationId).maybeSingle();
  if (!notification) return { skipped: 'notification-missing' };

  let userIds: string[] = [];
  if (notification.recipient_user_id) userIds = [notification.recipient_user_id];
  else {
    const { data: staff } = await supabaseAdmin.from('user_roles').select('user_id').in('role', ['admin', 'manager', 'user_manager']);
    userIds = [...new Set((staff ?? []).map((r) => r.user_id))];
    const { data: prefs } = await supabaseAdmin.from('notification_settings').select('cat_bookings, cat_coupons, cat_buses, cat_hotels, cat_system, cat_users, dnd_enabled, dnd_start, dnd_end').eq('id', 1).maybeSingle();
    if (prefs) {
      const catKey = (`cat_${notification.category}`) as keyof typeof prefs;
      if (catKey in prefs && prefs[catKey] === false) return { skipped: 'category-disabled' };
      if (prefs.dnd_enabled && prefs.dnd_start && prefs.dnd_end) {
        const riyadh = new Date(Date.now() + 3 * 3600 * 1000);
        const now = riyadh.getUTCHours() * 60 + riyadh.getUTCMinutes();
        const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m || 0); };
        const s = toMin(prefs.dnd_start), e = toMin(prefs.dnd_end);
        const inDnd = s <= e ? now >= s && now < e : now >= s || now < e;
        if (inDnd) return { skipped: 'dnd' };
      }
    }
  }
  if (!userIds.length) return { skipped: 'no-recipients' };

  const { data: subscriptions } = await supabaseAdmin.from('push_subscriptions').select('id, user_id').in('user_id', userIds).eq('is_active', true);
  if (!subscriptions?.length) return { skipped: 'no-subscriptions' };

  await supabaseAdmin.from('push_deliveries').upsert(
    subscriptions.map((s) => ({ notification_id: notificationId, subscription_id: s.id, user_id: s.user_id, status: 'pending', queued_at: new Date().toISOString() })),
    { onConflict: 'notification_id,subscription_id', ignoreDuplicates: true },
  );
  return {};
}
