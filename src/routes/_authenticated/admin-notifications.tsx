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
          <h1 className="text-2xl font-extrabold text-[color:var(--color-navy)]">تشخيص الإشعارات</h1>
          <Link to="/dashboard"><Button variant="outline" className="rounded-full">رجوع للوحة التحكم</Button></Link>
        </div>

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
