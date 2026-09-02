import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, Trash2, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteLayout } from "@/components/site/SiteLayout";
import { BRAND } from "@/lib/brand";
import { formatDateTime } from "@/lib/format";
import { NOTIF_TYPE_LABELS, notifTarget, useUserNotifications, type UserNotif } from "@/hooks/useUserNotifications";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: `الإشعارات | ${BRAND.name}` },
      { name: "description", content: "مركز إشعارات حسابك: تحديثات الحجوزات والرحلات والحافلات والمقاعد." },
      { property: "og:title", content: `الإشعارات | ${BRAND.name}` },
      { property: "og:description", content: "تابع كل التحديثات المتعلقة بحجوزاتك في مكان واحد." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const navigate = useNavigate();
  const { items, unread, loading, markRead, markAllRead, remove } = useUserNotifications();

  async function openNotif(n: UserNotif) {
    if (!n.read) await markRead(n.id);
    const target = notifTarget(n);
    if (target) navigate({ to: target.to, search: target.search as never });
  }

  return (
    <SiteLayout>
      <div className="container-luxe py-8 md:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
            <Bell className="h-6 w-6" /> الإشعارات
            {unread > 0 && <Badge className="bg-red-600 hover:bg-red-600">{unread} غير مقروء</Badge>}
          </h1>
          {unread > 0 && (
            <Button onClick={markAllRead} variant="outline" className="rounded-full">
              <CheckCheck className="h-4 w-4 ml-1" /> تحديد الكل كمقروء
            </Button>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            <Inbox className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="font-semibold">لا توجد إشعارات حتى الآن</p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((n) => (
              <div
                key={n.id}
                className={`rounded-2xl border p-4 flex items-start gap-3 transition ${
                  n.read ? "bg-card" : "bg-primary/5 border-primary/30"
                }`}
              >
                <button onClick={() => openNotif(n)} className="min-w-0 flex-1 text-right">
                  <div className="flex flex-wrap items-center gap-2">
                    {!n.read && <span className="h-2.5 w-2.5 rounded-full bg-red-600" />}
                    <span className={`${n.read ? "font-semibold" : "font-extrabold"} break-words`}>{n.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {NOTIF_TYPE_LABELS[n.type] ?? n.type}
                    </Badge>
                    {n.read && <span className="text-[10px] text-muted-foreground">مقروء</span>}
                  </div>
                  {n.body && <p className="text-sm text-muted-foreground mt-1 break-words">{n.body}</p>}
                  <p className="text-xs text-muted-foreground mt-2">{formatDateTime(n.created_at)}</p>
                </button>
                <div className="flex flex-col gap-2 shrink-0">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="تحديد كمقروء" className="p-2 rounded-lg hover:bg-muted">
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => remove(n.id)} title="حذف" className="p-2 rounded-lg hover:bg-muted text-red-600">
                    <Trash4 />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SiteLayout>
  );
}

function Trash4() {
  return <Trash2 className="h-4 w-4" />;
}
