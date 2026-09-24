import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, Trash2, Inbox, Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteLayout } from "@/components/site/SiteLayout";
import { BRAND } from "@/lib/brand";
import { formatDateTime } from "@/lib/format";
import { NOTIF_CATEGORIES, NOTIF_TYPE_LABELS, notifTarget, useUserNotifications, type UserNotif } from "@/hooks/useUserNotifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: `الإشعارات | ${BRAND.name}` },
      { name: "description", content: "مركز إشعارات حسابك: تحديثات الحجوزات والرحلات والحافلات والمقاعد." },
      { property: "og:title", content: `الإشعارات | ${BRAND.name}` },
      { property: "og:description", content: "تابع كل التحديثات المتعلقة بحجوزاتك في مكان واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

const FILTERS = [{ key: "all", label: "الكل" }, { key: "unread", label: "غير المقروء" }, ...NOTIF_CATEGORIES];

const PRIORITY_STYLE: Record<string, string> = { urgent: "border-destructive/60", high: "border-amber-500/60" };

function NotificationsPage() {
  const navigate = useNavigate();
  const { items, unread, loading, hasMore, markRead, markAllRead, remove, loadMore } = useUserNotifications();
  const [filter, setFilter] = useState("all");
  const [moreBusy, setMoreBusy] = useState(false);

  const shown = useMemo(() => items.filter((n) =>
    filter === "all" ? true : filter === "unread" ? !n.read : n.category === filter), [items, filter]);

  async function openNotif(n: UserNotif) {
    if (!n.read) await markRead(n.id);
    const target = notifTarget(n);
    if (target) navigate({ to: target.to, search: target.search as never });
  }

  return (
    <SiteLayout>
      <div className="container-luxe py-8 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
            <Bell className="h-6 w-6" /> الإشعارات
            {unread > 0 && <Badge className="bg-red-600 hover:bg-red-600">{unread} غير مقروء</Badge>}
          </h1>
          <div className="flex gap-2">
            {unread > 0 && (
              <Button onClick={markAllRead} variant="outline" className="rounded-full">
                <CheckCheck className="h-4 w-4 ml-1" /> تحديد الكل كمقروء
              </Button>
            )}
            <Link to="/profile"><Button variant="ghost" className="rounded-full"><Settings className="h-4 w-4 ml-1" /> الإعدادات</Button></Link>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold border transition ${filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : shown.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-semibold">لا توجد إشعارات هنا</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((n) => (
              <div key={n.id}
                className={`rounded-2xl border p-4 flex items-start gap-3 transition ${n.read ? "bg-card" : "bg-primary/5 border-primary/30"} ${PRIORITY_STYLE[n.priority ?? ""] ?? ""}`}>
                <button onClick={() => openNotif(n)} className="min-w-0 flex-1 text-right">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.read && <span className="h-2.5 w-2.5 rounded-full bg-red-600" />}
                    <span className={`${n.read ? "font-semibold" : "font-extrabold"} break-words`}>{n.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{NOTIF_TYPE_LABELS[n.type] ?? n.type}</Badge>
                    {n.priority === "urgent" && <Badge variant="destructive" className="text-[10px]">عاجل</Badge>}
                    {n.read && <span className="text-[10px] text-muted-foreground">مقروء</span>}
                  </div>
                  {n.body && <p className="text-sm text-muted-foreground mt-1 break-words">{n.body}</p>}
                  <p className="text-xs text-muted-foreground mt-2">{formatDateTime(n.created_at)}</p>
                </button>
                <div className="flex flex-col gap-2 shrink-0">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="تحديد كمقروء" className="p-2 rounded-lg hover:bg-muted"><Check className="h-4 w-4" /></button>
                  )}
                  <button onClick={() => remove(n.id)} title="حذف" className="p-2 rounded-lg hover:bg-muted text-red-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="text-center pt-2">
                <Button variant="outline" className="rounded-full" disabled={moreBusy}
                  onClick={async () => { setMoreBusy(true); await loadMore(); setMoreBusy(false); }}>
                  {moreBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "عرض المزيد"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}
