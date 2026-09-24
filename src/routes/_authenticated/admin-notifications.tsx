import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useStaffRole } from "@/hooks/useStaffRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin-notifications")({
  head: () => ({
    meta: [
      { title: "تشخيص الإشعارات | زهرة طيبة" },
      { name: "description", content: "متابعة حالة إرسال إشعارات الهاتف وإرسال إشعار تجريبي." },
      { property: "og:title", content: "تشخيص الإشعارات | زهرة طيبة" },
      { property: "og:description", content: "متابعة حالة إرسال إشعارات الهاتف وإرسال إشعار تجريبي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminNotifications,
});

interface DeliveryRow {
  id: string;
  status: string;
  attempt_count: number;
  queued_at: string;
  sent_at: string | null;
  failed_at: string | null;
  next_retry_at: string | null;
  error_code: string | null;
  error_message: string | null;
  user_id: string;
  notifications?: { title: string | null; category: string | null } | null;
  push_subscriptions?: { user_agent: string | null; is_active: boolean; endpoint: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  sending: "جارٍ الإرسال",
  sent: "تم الإرسال",
  failed: "فشل",
  expired: "منتهي",
};

function AdminNotifications() {
  const perms = useStaffRole();
  const qc = useQueryClient();
  const [title, setTitle] = useState("إشعار تجريبي");
  const [body, setBody] = useState("هذه رسالة اختبار من لوحة التحكم.");
  const [sending, setSending] = useState(false);

  const { data: deliveries = [], isFetching } = useQuery({
    queryKey: ["push-deliveries"],
    enabled: perms.isAdmin,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("push_deliveries")
        .select("id,status,attempt_count,queued_at,sent_at,failed_at,next_retry_at,error_code,error_message,user_id,notifications(title,category),push_subscriptions(user_agent,is_active,endpoint)")
        .order("queued_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data as unknown as DeliveryRow[]) ?? [];
    },
  });

  const { data: devices = 0 } = useQuery({
    queryKey: ["push-devices-count"],
    enabled: perms.isAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("push_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      return count ?? 0;
    },
  });

  async function sendTest() {
    setSending(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("notifications").insert({
      type: "system",
      category: "system",
      title: title.trim() || "إشعار تجريبي",
      body: body.trim(),
      recipient_user_id: user?.id ?? null,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الإشعار — تابع حالة الإرسال بالأسفل");
    setTimeout(() => qc.invalidateQueries({ queryKey: ["push-deliveries"] }), 2500);
  }

  if (perms.loading) return <div className="p-8 text-center text-muted-foreground">جارٍ التحميل…</div>;
  if (!perms.isAdmin) return <div className="p-8 text-center font-bold">هذه الصفحة للمسؤول فقط.</div>;

  const counts = deliveries.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-muted" dir="rtl">
      <div className="container-luxe py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-extrabold text-[color:var(--color-navy)]">إدارة الإشعارات</h1>
          <Link to="/dashboard"><Button variant="outline" className="rounded-full">رجوع للوحة التحكم</Button></Link>
        </div>

        <Tabs defaultValue="broadcast" dir="rtl">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="broadcast">إرسال جماعي</TabsTrigger>
            <TabsTrigger value="types">الأنواع والقوالب</TabsTrigger>
            <TabsTrigger value="delivery">التشخيص والسجل</TabsTrigger>
          </TabsList>
          <TabsContent value="broadcast"><BroadcastTab /></TabsContent>
          <TabsContent value="types"><TypesTab /></TabsContent>
          <TabsContent value="delivery" className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="أجهزة مفعّلة" value={devices} />
          <StatCard label="تم الإرسال" value={counts.sent ?? 0} />
          <StatCard label="قيد الانتظار" value={(counts.pending ?? 0) + (counts.sending ?? 0)} />
          <StatCard label="فشل" value={counts.failed ?? 0} />
          <StatCard label="منتهي" value={counts.expired ?? 0} />
          <StatCard label="آخر 100 عملية" value={deliveries.length} />
        </div>

        <section className="surface-card p-5 space-y-3">
          <h2 className="font-extrabold">إرسال إشعار تجريبي</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label className="text-xs">العنوان</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div><Label className="text-xs">النص</Label><Input value={body} onChange={(e) => setBody(e.target.value)} /></div>
          </div>
          <Button onClick={sendTest} disabled={sending} className="rounded-xl font-bold">
            {sending ? "جارٍ الإرسال…" : "إرسال إشعار تجريبي"}
          </Button>
          <p className="text-xs text-muted-foreground">يُنشئ إشعارًا حقيقيًا لحسابك ويختبر الإرسال إلى أجهزتك المسجّلة.</p>
        </section>

        <section className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-extrabold">آخر عمليات الإرسال</h2>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => qc.invalidateQueries({ queryKey: ["push-deliveries"] })}>
              {isFetching ? "تحديث…" : "تحديث"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 text-right">الإشعار</th>
                  <th className="p-2 text-right">الجهاز</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">المحاولات</th>
                  <th className="p-2 text-right">الوقت</th>
                  <th className="p-2 text-right">الخطأ</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-2 font-semibold">{d.notifications?.title ?? "—"}</td>
                    <td className="p-2 text-xs text-muted-foreground max-w-[220px] truncate">{d.push_subscriptions?.user_agent ?? "—"}</td>
                    <td className="p-2">
                      <Badge className={d.status === "sent" ? "bg-success" : d.status === "failed" || d.status === "expired" ? "bg-destructive" : ""} variant={d.status === "pending" || d.status === "sending" ? "outline" : "default"}>
                        {STATUS_LABELS[d.status] ?? d.status}
                      </Badge>
                    </td>
                    <td className="p-2">{d.attempt_count}</td>
                    <td className="p-2 text-xs">{formatDateTime(d.sent_at ?? d.failed_at ?? d.queued_at)}</td>
                    <td className="p-2 text-xs text-destructive max-w-[240px] truncate">{d.error_code ? `${d.error_code} — ${d.error_message ?? ""}` : "—"}</td>
                  </tr>
                ))}
                {deliveries.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد عمليات إرسال بعد.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold text-[color:var(--color-navy)]">{value}</div>
    </div>
  );
}

/* ---------------- Types & templates ---------------- */

interface NType { key: string; category: string; name: string; enabled: boolean; is_critical: boolean; priority: string; variables: string[] | null; default_title: Record<string, string> | null; default_body: Record<string, string> | null; display_order: number }
interface NTemplate { type_key: string; lang: string; title: string; body: string }

const CAT_LABEL: Record<string, string> = { bookings: "الحجوزات", trips: "الرحلات", buses: "الحافلات", hotels: "الفنادق", discounts: "الخصومات", reminders: "التذكيرات", system: "النظام", security: "الأمان" };
const PRIORITIES = [{ v: "low", l: "منخفضة" }, { v: "normal", l: "عادية" }, { v: "high", l: "مرتفعة" }, { v: "urgent", l: "عاجلة" }];

const SAMPLE: Record<string, string> = { customer_name: "محمد أحمد", booking_code: "ZT-2026-000123", trip_name: "رحلة الخميس", bus_number: "3", seat_numbers: "12، 13", hotel_name: "فندق الرابح", departure_date: "2026-10-01", departure_time: "04:00 م", driver_name: "خالد", plate: "أ ب ج 1234", app_name: "زهرة طيبة" };
function preview(text: string) { return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => SAMPLE[k] ?? `{{${k}}}`); }

function TypesTab() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<NType | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const { data } = useQuery({
    queryKey: ["notif-types"],
    queryFn: async () => {
      const [t, tpl] = await Promise.all([
        supabase.from("notification_types" as never).select("*").order("category").order("display_order"),
        supabase.from("notification_templates" as never).select("type_key,lang,title,body").eq("lang", "ar"),
      ]);
      return { types: (t.data as unknown as NType[]) ?? [], templates: (tpl.data as unknown as NTemplate[]) ?? [] };
    },
  });
  const types = data?.types ?? [];
  const tplOf = (k: string) => data?.templates.find((t) => t.type_key === k);

  async function patch(key: string, values: Partial<NType>) {
    const { error } = await supabase.from("notification_types" as never).update(values as never).eq("key", key);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["notif-types"] });
  }
  function openEdit(t: NType) {
    const tpl = tplOf(t.key);
    setDraft({ title: tpl?.title ?? t.default_title?.ar ?? t.name, body: tpl?.body ?? t.default_body?.ar ?? "" });
    setEditing(t);
  }
  async function saveTpl() {
    if (!editing) return;
    const { error } = await supabase.from("notification_templates" as never)
      .upsert({ type_key: editing.key, lang: "ar", title: draft.title, body: draft.body } as never, { onConflict: "type_key,lang" });
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ القالب"); setEditing(null); qc.invalidateQueries({ queryKey: ["notif-types"] });
  }

  const groups = [...new Set(types.map((t) => t.category))];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g} className="surface-card p-4">
          <h3 className="font-extrabold mb-2">{CAT_LABEL[g] ?? g}</h3>
          <div className="divide-y">
            {types.filter((t) => t.category === g).map((t) => (
              <div key={t.key} className="flex flex-wrap items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm">{t.name} {t.is_critical && <Badge variant="destructive" className="text-[10px] mr-1">إلزامي</Badge>}</p>
                  <p className="text-xs text-muted-foreground truncate">{tplOf(t.key)?.title ?? t.default_title?.ar ?? ""}</p>
                </div>
                <select value={t.priority} onChange={(e) => patch(t.key, { priority: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {PRIORITIES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => openEdit(t)}>تعديل النص</Button>
                <Switch checked={t.enabled} disabled={t.is_critical} onCheckedChange={(v) => patch(t.key, { enabled: v })} />
              </div>
            ))}
          </div>
        </section>
      ))}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader><DialogTitle>قالب: {editing?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">العنوان</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div><Label className="text-xs">النص</Label><Textarea rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></div>
            {!!editing?.variables?.length && (
              <div className="flex flex-wrap gap-1">
                {editing.variables.map((v) => (
                  <button key={v} type="button" className="text-[11px] rounded-full border px-2 py-0.5 hover:bg-muted" onClick={() => setDraft((d) => ({ ...d, body: `${d.body} {{${v}}}` }))}>{`{{${v}}}`}</button>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-muted p-3 text-sm">
              <p className="text-[11px] text-muted-foreground mb-1">معاينة</p>
              <p className="font-bold">{preview(draft.title)}</p>
              <p className="text-muted-foreground">{preview(draft.body)}</p>
            </div>
            <Button onClick={saveTpl} className="w-full rounded-xl font-bold">حفظ القالب</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Broadcasts ---------------- */

interface Broadcast { id: string; title: string; audience: string; status: string; priority: string; scheduled_at: string | null; sent_at: string | null; recipients_count: number | null; error: string | null; created_at: string }

const AUDIENCES = [
  { v: "all", l: "جميع المستخدمين" }, { v: "customers", l: "العملاء" }, { v: "representatives", l: "المناديب" },
  { v: "supervisors", l: "المشرفون" }, { v: "staff", l: "الموظفون" }, { v: "trip", l: "ركاب رحلة" }, { v: "bus", l: "ركاب حافلة" },
];
const BC_STATUS: Record<string, string> = { scheduled: "مجدول", sending: "جارٍ الإرسال", sent: "تم الإرسال", failed: "فشل", cancelled: "ملغى" };

function BroadcastTab() {
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", body: "", audience: "all", url: "", priority: "normal", when: "", trip: "", bus: "", push: true });
  const [busy, setBusy] = useState(false);

  const { data: trips = [] } = useQuery({ queryKey: ["bc-trips"], queryFn: async () => ((await supabase.from("trips").select("id,name").eq("active", true).order("display_order")).data ?? []) });
  const { data: buses = [] } = useQuery({ queryKey: ["bc-buses"], queryFn: async () => ((await supabase.from("buses").select("id,name,bus_number").eq("active", true).order("bus_number")).data ?? []) });
  const { data: log = [] } = useQuery({
    queryKey: ["bc-log"], refetchInterval: 20_000,
    queryFn: async () => ((await supabase.from("notification_broadcasts" as never).select("*").order("created_at", { ascending: false }).limit(50)).data as unknown as Broadcast[]) ?? [],
  });

  async function send() {
    if (!f.title.trim()) { toast.error("اكتب عنوان الإشعار"); return; }
    if (f.audience === "trip" && !f.trip) { toast.error("اختر الرحلة"); return; }
    if (f.audience === "bus" && !f.bus) { toast.error("اختر الحافلة"); return; }
    if (f.url && (!f.url.startsWith("/") || f.url.startsWith("//"))) { toast.error("الرابط يجب أن يكون صفحة داخل الموقع مثل /my-bookings"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_notification_broadcast" as never, {
      _title: f.title.trim(), _body: f.body.trim(), _audience: f.audience, _url: f.url || null,
      _channels: f.push ? ["in_app", "push", "toast", "sound", "vibrate"] : ["in_app", "toast", "sound"],
      _priority: f.priority, _scheduled_at: f.when ? new Date(f.when).toISOString() : null,
      _target_user: null, _target_trip: f.audience === "trip" ? f.trip : null, _target_booking: null, _target_bus: f.audience === "bus" ? f.bus : null,
    } as never);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(f.when ? "تمت جدولة الإشعار" : "تم إرسال الإشعار");
    setF({ ...f, title: "", body: "", when: "" });
    qc.invalidateQueries({ queryKey: ["bc-log"] });
  }
  async function cancel(id: string) {
    const { error } = await supabase.from("notification_broadcasts" as never).update({ status: "cancelled" } as never).eq("id", id).eq("status", "scheduled");
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["bc-log"] });
  }

  return (
    <div className="space-y-4">
      <section className="surface-card p-5 space-y-3">
        <h2 className="font-extrabold">إرسال إشعار جماعي</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label className="text-xs">العنوان</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div><Label className="text-xs">المستلمون</Label>
            <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              {AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><Label className="text-xs">النص</Label><Textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
          {f.audience === "trip" && (
            <div><Label className="text-xs">الرحلة</Label>
              <select value={f.trip} onChange={(e) => setF({ ...f, trip: e.target.value })} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">اختر…</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {f.audience === "bus" && (
            <div><Label className="text-xs">الحافلة</Label>
              <select value={f.bus} onChange={(e) => setF({ ...f, bus: e.target.value })} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                <option value="">اختر…</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.name ?? "حافلة"} #{b.bus_number}</option>)}
              </select>
            </div>
          )}
          <div><Label className="text-xs">الأولوية</Label>
            <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
              {PRIORITIES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">رابط داخلي (اختياري)</Label><Input dir="ltr" placeholder="/my-bookings" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></div>
          <div><Label className="text-xs">جدولة (اتركه فارغًا للإرسال الآن)</Label><Input type="datetime-local" value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm font-bold"><Switch checked={f.push} onCheckedChange={(v) => setF({ ...f, push: v })} /> إرسال للهاتف أيضًا</label>
        </div>
        <Button onClick={send} disabled={busy} className="rounded-xl font-bold">{busy ? "جارٍ…" : f.when ? "جدولة الإشعار" : "إرسال الآن"}</Button>
      </section>

      <section className="surface-card p-5">
        <h2 className="font-extrabold mb-3">سجل الإشعارات الجماعية</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr>
              <th className="p-2 text-right">العنوان</th><th className="p-2 text-right">المستلمون</th><th className="p-2 text-right">الحالة</th>
              <th className="p-2 text-right">العدد</th><th className="p-2 text-right">الموعد</th><th className="p-2" />
            </tr></thead>
            <tbody>
              {log.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="p-2 font-semibold">{b.title}</td>
                  <td className="p-2 text-xs">{AUDIENCES.find((a) => a.v === b.audience)?.l ?? b.audience}</td>
                  <td className="p-2"><Badge variant={b.status === "failed" ? "destructive" : "outline"} title={b.error ?? undefined}>{BC_STATUS[b.status] ?? b.status}</Badge></td>
                  <td className="p-2">{b.recipients_count ?? "—"}</td>
                  <td className="p-2 text-xs">{formatDateTime(b.sent_at ?? b.scheduled_at ?? b.created_at)}</td>
                  <td className="p-2">{b.status === "scheduled" && <Button size="sm" variant="ghost" onClick={() => cancel(b.id)}>إلغاء</Button>}</td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا يوجد إشعارات جماعية بعد.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
