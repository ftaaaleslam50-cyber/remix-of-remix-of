import { supabase } from '@/integrations/supabase/client';

const SW_PATH = '/push-sw.js';
let vapidKeyPromise: Promise<string> | null = null;

async function getPublicKey(): Promise<string> {
  if (!vapidKeyPromise) {
    vapidKeyPromise = fetch('/api/public/push/vapid-key', { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Push key unavailable');
        const result = await response.json() as { publicKey?: string };
        if (!result.publicKey) throw new Error('Push key unavailable');
        return result.publicKey;
      })
      .catch((error) => { vapidKeyPromise = null; throw error; });
  }
  return vapidKeyPromise;
}

function base64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export type PushPermissionState = NotificationPermission | 'unsupported' | 'signed-out';

export function getPushPermission(): PushPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  return Notification.permission;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  // Pull the newest worker so deployed fixes actually reach returning users.
  await registration.update().catch(() => undefined);
  await navigator.serviceWorker.ready;
  return registration;
}

type SubscriptionJSON = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

async function saveSubscription(json: SubscriptionJSON): Promise<{ ok: boolean; reason?: string }> {
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { ok: false, reason: 'invalid-subscription' };

  // Server-side upsert: keeps one row per device endpoint and re-activates it,
  // even when the endpoint previously belonged to another account on this device.
  const { error } = await supabase.rpc('sync_push_subscription', {
    _endpoint: endpoint,
    _p256dh: p256dh,
    _auth: auth,
    _user_agent: navigator.userAgent,
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function registerPushSubscription(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!userId) return { ok: false, reason: 'signed-out' };
  if (getPushPermission() === 'unsupported') return { ok: false, reason: 'unsupported' };

  try {
    const publicKey = await getPublicKey();
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: permission };

    const registration = await ensureRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(publicKey) as unknown as BufferSource });

    return await saveSubscription(subscription.toJSON());
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' };
  }
}

/**
 * Called on every app load for a signed-in user: refreshes the worker and
 * re-syncs an existing subscription so a rotated or previously disabled
 * endpoint starts receiving notifications again. Never prompts for permission
 * and never touches this user's other devices.
 */
export async function syncPushSubscriptionOnLoad(userId: string): Promise<void> {
  if (!userId) return;
  if (getPushPermission() !== 'granted') return;
  try {
    const registration = await ensureRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await saveSubscription(subscription.toJSON());
  } catch {
    // Non-fatal: in-site notifications still work.
  }
}

export function listenForSubscriptionChanges(userId: string): () => void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !userId) return () => undefined;
  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: string; subscription?: SubscriptionJSON } | undefined;
    if (data?.type === 'push-subscription-changed' && data.subscription) void saveSubscription(data.subscription);
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

export async function removeCurrentPushSubscription(userId: string | null): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await supabase.rpc('deactivate_push_subscription', { _endpoint: subscription.endpoint });
    await subscription.unsubscribe().catch(() => false);
  }
  void userId;
}

export async function hasCurrentPushSubscription(userId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const { data } = await supabase.from('push_subscriptions').select('id').eq('user_id', userId).eq('endpoint', subscription.endpoint).eq('is_active', true).maybeSingle();
  return Boolean(data);
}
