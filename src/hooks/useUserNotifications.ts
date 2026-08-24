import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  metadata: Record<string, unknown> | null;
}

export const NOTIF_TYPE_LABELS: Record<string, string> = {
  booking_created: "إضافة حجز",
  booking_updated: "تعديل حجز",
  booking_confirmed: "تأكيد حجز",
  booking_cancelled: "إلغاء حجز",
  booking_rescheduled: "تغيير موعد الرحلة",
  bus_changed: "تغيير الحافلة",
  seat_changed: "تغيير المقعد",
  customer_updated: "تحديث البيانات",
  booking_note_added: "ملاحظة جديدة",
  system: "النظام",
};

/** Notifications addressed to the currently signed-in user (customer / representative). */
export function useUserNotifications() {
  const [uid, setUid] = useState<string | null>(null);
  const [items, setItems] = useState<UserNotif[]>([]);
  const [loading, setLoading] = useState(true);
  const booted = useRef(false);

  const load = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from("notifications" as never)
      .select("*")
      .eq("recipient_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    setItems(((data as unknown as UserNotif[]) ?? []));
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const id = data.user?.id ?? null;
      setUid(id);
      if (id) load(id);
      else { setItems([]); setLoading(false); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const id = session?.user?.id ?? null;
      setUid(id);
      if (id) load(id);
      else setItems([]);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel(`user-notifs-${uid}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as unknown as UserNotif;
          setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
          if (booted.current) toast(n.title, { description: n.body ?? undefined });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
        (payload) => {
          const n = payload.new as unknown as UserNotif;
          setItems((prev) => prev.map((p) => (p.id === n.id ? { ...p, ...n } : p)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `recipient_user_id=eq.${uid}` },
        (payload) => {
          const old = payload.old as { id?: string };
          setItems((prev) => prev.filter((p) => p.id !== old.id));
        },
      )
      .subscribe();
    booted.current = true;
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  const unread = items.filter((n) => !n.read).length;

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)));
    await supabase
      .from("notifications" as never)
      .update({ read: true, read_at: new Date().toISOString() } as never)
      .eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    if (!uid) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from("notifications" as never)
      .update({ read: true, read_at: new Date().toISOString() } as never)
      .eq("recipient_user_id", uid)
      .eq("read", false);
  }, [uid]);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications" as never).delete().eq("id", id);
  }, []);

  return { uid, items, unread, loading, markRead, markAllRead, remove, reload: () => uid && load(uid) };
}

/** Turn a stored notification link ("/my-bookings?code=ZT-1") into router navigate args. */
export function notifTarget(n: UserNotif): { to: string; search: Record<string, string> } | null {
  const raw = n.action_url || n.link;
  if (!raw) return null;
  const [path, qs] = raw.split("?");
  const search: Record<string, string> = {};
  if (qs) new URLSearchParams(qs).forEach((v, k) => { if (v) search[k] = v; });
  return { to: path, search };
}
