import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";

interface Notif { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; created_at: string; }

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const unread = items.filter((n) => !n.read && !("archived" in n && (n as { archived?: boolean }).archived)).length;

  async function load() {
    const { data } = await supabase.from("notifications" as never)
      .select("*").eq("archived", false).order("created_at", { ascending: false }).limit(30);
    setItems((data as unknown as Notif[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("notif-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () => {
        load();
        try { new Audio("data:audio/wav;base64,UklGRhwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play().catch(() => {}); } catch { /* noop */ }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function markAllRead() {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("read", false);
    load();
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="relative rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute -top-1 -left-1 h-5 min-w-5 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="font-bold text-sm">الإشعارات</span>
          {unread > 0 && <Button size="sm" variant="ghost" onClick={markAllRead}><Check className="h-3 w-3 ml-1" /> قراءة الكل</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">لا توجد إشعارات</p>}
          {items.map((n) => (
            <div key={n.id} className={`px-3 py-2 border-b last:border-b-0 ${n.read ? "opacity-70" : "bg-primary/5"}`}>
              <p className="text-sm font-bold">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
