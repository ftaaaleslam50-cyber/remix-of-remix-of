import { useState } from "react";
import { Bell, Check, CheckCheck, Trash2, Inbox } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";
import { NOTIF_TYPE_LABELS, notifTarget, useUserNotifications, type UserNotif } from "@/hooks/useUserNotifications";

export function UserNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { items, unread, markRead, markAllRead, remove } = useUserNotifications();

  async function openNotif(n: UserNotif) {
    if (!n.read) await markRead(n.id);
    const target = notifTarget(n);
    setOpen(false);
    if (target) navigate({ to: target.to, search: target.search as never });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="الإشعارات"
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted hover:bg-muted/70 transition"
        >
          <Bell className={`h-5 w-5 ${unread > 0 ? "animate-bounce" : ""}`} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -left-0.5 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,92vw)] p-0" dir="rtl">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-bold text-sm">مركز الإشعارات</span>
          {unread > 0 && (
            <Button size="sm" variant="ghost" onClick={markAllRead} className="h-7 text-xs">
              <CheckCheck className="h-3.5 w-3.5 ml-1" /> قراءة الكل
            </Button>
          )}
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              <Inbox className="h-6 w-6 mx-auto mb-2 opacity-50" />
              لا توجد إشعارات
            </div>
          )}
          {items.slice(0, 20).map((n) => (
            <div key={n.id} className={`px-3 py-2 border-b last:border-b-0 ${n.read ? "" : "bg-primary/5"}`}>
              <div className="flex items-start gap-2">
                <button onClick={() => openNotif(n)} className="min-w-0 flex-1 text-right">
                  <div className="flex items-center gap-1.5">
                    {!n.read && <span className="h-2 w-2 rounded-full bg-red-600 shrink-0" />}
                    <p className={`text-sm ${n.read ? "font-medium text-foreground/80" : "font-bold"} break-words`}>
                      {n.title}
                    </p>
                  </div>
                  {n.body && <p className="text-xs text-muted-foreground line-clamp-2 break-words">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {NOTIF_TYPE_LABELS[n.type] ?? n.type} • {formatDate(n.created_at)}
                  </p>
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="تحديد كمقروء" className="p-1 hover:bg-muted rounded">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => remove(n.id)} title="حذف" className="p-1 hover:bg-muted rounded text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-2">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center text-xs font-bold py-2 rounded-lg hover:bg-muted"
          >
            عرض جميع الإشعارات
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
