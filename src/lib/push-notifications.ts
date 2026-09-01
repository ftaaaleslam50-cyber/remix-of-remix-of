import { supabase } from '@/integrations/supabase/client';

const SW_PATH = '/push-sw.js';

function getPublicKey(): string {
  return import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
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

export async function registerPushSubscription(userId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!userId) return { ok: false, reason: 'signed-out' };
  if (getPushPermission() === 'unsupported') return { ok: false, reason: 'unsupported' };
  const publicKey = getPublicKey();
  if (!publicKey) return { ok: false, reason: 'missing-key' };

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: permission };

  const registration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  await navigator.serviceWorker.ready;
  const manager = registration.pushManager;
  let subscription = await manager.getSubscription();
  if (!subscription) subscription = await manager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(publicKey) });

  const json = subscription.toJSON();
  const endpoint = json.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { ok: false, reason: 'invalid-subscription' };

  const { error } = await supabase.from('push_subscriptions' as never).upsert({
    user_id: userId,
    endpoint,
    p256dh,
    auth,
    user_agent: navigator.userAgent,
    is_active: true,
    last_error: null,
    updated_at: new Date().toISOString(),
  } as never, { onConflict: 'endpoint' });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

export async function removeCurrentPushSubscription(userId: string | null): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions' as never).delete().eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe().catch(() => false);
  }
  if (userId) await supabase.from('push_subscriptions' as never).delete().eq('user_id', userId).eq('is_active', false);
}

export async function hasCurrentPushSubscription(userId: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const { data } = await supabase.from('push_subscriptions' as never).select('id').eq('user_id', userId).eq('endpoint', subscription.endpoint).eq('is_active', true).maybeSingle();
  return Boolean(data);
}
