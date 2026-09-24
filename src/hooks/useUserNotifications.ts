import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureAuthInitialized, subscribeAuthState } from "@/lib/auth-session";
import soundAsset from "@/assets/notification-default.mp3.asset.json";

export interface UserNotif {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string | null;
  link: string | null;
  action_url: string | null;
  booking_id: string | null;
  read: boolean;
  read_at: string | null;
  created_at: string;
  priority?: string | null;
  channels?: string[] | null;
  metadata: Record<string, unknown> | null;
}

export interface NotifPrefs {
  enabled: boolean;
  push_enabled: boolean;
  sound_enabled: boolean;
  vibrate_enabled: boolean;
  toast_enabled: boolean;
  bell_animation: boolean;
  dnd_enabled: boolean;
  dnd_start: string;
  dnd_end: string;
  categories: Record<string, boolean>;
  lang: string;
}

export const DEFAULT_PREFS: NotifPrefs = {
  enabled: true, push_enabled: true, sound_enabled: true, vibrate_enabled: true, toast_enabled: true,
  bell_animation: true, dnd_enabled: false, dnd_start: "23:00", dnd_end: "07:00", categories: {}, lang: "ar",
};

export const NOTIF_CATEGORIES: { key: string; label: string }[] = [
  { key: "bookings", label: "الحجوزات" },
  { key: "trips", label: "الرحلات" },
  { key: "buses", label: "الحافلات" },
  { key: "hotels", label: "الفنادق" },
  { key: "discounts", label: "الخصومات" },
  { key: "reminders", label: "التذكيرات" },
  { key: "system", label: "النظام" },
];

export const NOTIF_TYPE_LABELS: Record<string, string> = {
  booking_created: "إضافة حجز",
  booking_updated: "تعديل حجز",
  booking_confirmed: "تأكيد حجز",
  booking_pending: "قيد المراجعة",
  booking_cancelled: "إلغاء حجز",
  booking_rescheduled: "تغيير موعد الرحلة",
  bus_assigned: "تعيين حافلة",
  bus_changed: "تغيير الحافلة",
  bus_number_changed: "تغيير رقم الحافلة",
  bus_driver_changed: "تغيير السائق",
  bus_plate_changed: "تغيير اللوحة",
  seat_changed: "تغيير المقاعد",
  hotel_assigned: "تعيين فندق",
  hotel_changed: "تغيير الفندق",
  trip_time_changed: "تغيير وقت الرحلة",
  trip_date_changed: "تغيير تاريخ الرحلة",
  trip_reminder_24h: "تذكير قبل يوم",
  trip_reminder_3h: "تذكير قبل 3 ساعات",
  trip_reminder_1h: "تذكير قبل ساعة",
  booking_settled: "اعتماد حسابات الحجز",
  customer_updated: "تحديث البيانات",
  booking_note_added: "ملاحظة جديدة",
  system_announcement: "إعلان",
  system: "النظام",
};

const PAGE = 30;

function minutes(t: string) { const [h, m] = t.split(":").map(Number); return (h ?? 0) * 60 + (m || 0); }
export function inQuietHours(p: NotifPrefs): boolean {
  if (!p.dnd_enabled) return false;
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  const n = now.getUTCHours() * 60 + now.getUTCMinutes();
  const s = minutes(p.dnd_start), e = minutes(p.dnd_end);
  return s <= e ? n >= s && n < e : n >= s || n < e;
}

let audio: HTMLAudioElement | null = null;
function playSound() {
  try {
    audio ??= new Audio(soundAsset.url);
    audio.currentTime = 0;
    // Browsers block autoplay until the user interacts with the page; ignore that.
    void audio.play().catch(() => undefined);
  } catch { /* ignore */ }
}

/** Load (or lazily create defaults for) the signed-in user's preferences. */
export async function loadPrefs(userId: string): Promise<NotifPrefs> {
  const { data } = await supabase.from("user_notification_preferences" as never).select("*").eq("user_id", userId).maybeSingle();
  if (!data) return DEFAULT_PREFS;
  const d = data as unknown as NotifPrefs;
  return { ...DEFAULT_PREFS, ...d, dnd_start: String(d.dnd_start).slice(0, 5), dnd_end: String(d.dnd_end).slice(0, 5), categories: (d.categories ?? {}) as Record<string, boolean> };
}

export async function savePrefs(userId: string, prefs: NotifPrefs) {
  return supabase.from("user_notification_preferences" as never).upsert({ user_id: userId, ...prefs } as never, { onConflict: "user_id" });
}

/** Notifications addressed to the currently signed-in user (customer / representative). */
export function useUserNotifications() {
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<UserNotif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  const countUnread = useCallback(async (userId: string) => {
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("recipient_user_id", userId).eq("read", false);
    setUnread(count ?? 0);
  }, []);

  const load = useCallback(async (userId: string) => {
    const { data } = await supabase.from("notifications").select("*")
      .eq("recipient_user_id", userId).order("created_at", { ascending: false }).limit(PAGE);
    const rows = (data as unknown as UserNotif[]) ?? [];
    setItems(rows);
    setHasMore(rows.length === PAGE);
    setLoading(false);
    void countUnread(userId);
    setPrefs(await loadPrefs(userId));
  }, [countUnread]);

  const loadMore = useCallback(async () => {
    if (!uid) return;
    const last = items[items.length - 1];
    if (!last) return;
    const { data } = await supabase.from("notifications").select("*")
      .eq("recipient_user_id", uid).lt("created_at", last.created_at)
      .order("created_at", { ascending: false }).limit(PAGE);
    const rows = (data as unknown as UserNotif[]) ?? [];
    setItems((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]);
    setHasMore(rows.length === PAGE);
  }, [uid, items]);

  useEffect(() => {
    function apply(snapshot: { session: { user?: { id: string } } | null; loading: boolean }) {
      const id = snapshot.session?.user?.id ?? null;
      setUid(id);
      if (id) void load(id);
      else {
        setItems([]); setUnread(0);
        if (!snapshot.loading) setLoading(false);
      }
    }
    const unsubscribe = subscribeAuthState(apply);
    void ensureAuthInitialized().then(apply);
    return () => { unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`user-notifs-${uid}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` }, (payload) => {
        const n = payload.new as unknown as UserNotif;
        setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
        setUnread((u) => u + 1);
        const p = prefsRef.current;
        const ch = n.channels ?? ["in_app", "toast", "sound", "vibrate"];
        const quiet = inQuietHours(p) && n.priority !== "urgent";
        if (!p.enabled || quiet) return;
        if (p.toast_enabled && ch.includes("toast")) {
          const opts = { description: n.body ?? undefined };
          if (n.priority === "urgent" || n.priority === "high") toast.warning(n.title, opts); else toast(n.title, opts);
        }
        if (p.sound_enabled && ch.includes("sound") && n.priority !== "low") playSound();
        if (p.vibrate_enabled && ch.includes("vibrate") && typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate(n.priority === "urgent" ? [200, 100, 200, 100, 200] : 150); } catch { /* ignore */ }
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` }, (payload) => {
        const n = payload.new as unknown as UserNotif;
        setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, ...n } : p)));
        void countUnread(uid);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` }, (payload) => {
        const old = payload.old as { id?: string };
        setItems((prev) => prev.filter((p) => p.id !== old.id));
        void countUnread(uid);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, countUnread]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await supabase.from("notifications").update({ read: true, read_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await supabase.from("notifications").update({ read: true, read_at: new Date().toISOString() })
      .eq("recipient_user_id", uid).eq("read", false);
  }, [uid]);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
    if (uid) void countUnread(uid);
  }, [uid, countUnread]);

  return { uid, items, unread, loading, hasMore, prefs, markRead, markAllRead, remove, loadMore, reload: () => uid && load(uid) };
}

/** Turn a stored notification link ("/my-bookings?code=ZT-1") into router navigate args (internal paths only). */
export function notifTarget(n: UserNotif): { to: string; search: Record<string, string> } | null {
  const raw = n.action_url || n.link;
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return null;
  const [path, qs] = raw.split("?");
  const search: Record<string, string> = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => { if (v) search[k] = v; });
  return { to: path, search };
}
