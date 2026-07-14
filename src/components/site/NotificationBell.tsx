import { useEffect, useMemo, useState } from "react";
import { Bell, Check, Archive, Search, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/format";

interface Notif { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; archived: boolean; created_at: string; }

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([]);
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");
  const [search, setSearch] = useState("");
  const unread = items.filter((n) => !n.read && !n.archived).length;

  async function load() {
    const { data } = await supabase.from("notifications" as never)
      .select("*").order("created_at", { ascending: false }).limit(100);
    setItems((data as unknown as Notif[]) ?? []);
  }

  useEffect(() => {
    load();
    const ch = supabase.channel("notif-bell")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => { load(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  async function markAllRead() {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("read", false);
    toast.success("تم تحديد الكل كمقروء");
    load();
  }
  async function markRead(id: string) {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("id", id);
    load();
  }
  async function archive(id: string) {
    await supabase.from("notifications" as never).update({ archived: true, read: true } as never).eq("id", id);
    load();
  }
  async function unarchive(id: string) {
    await supabase.from("notifications" as never).update({ archived: false } as never).eq("id", id);
    load();
  }
  async function remove(id: string) {
    if (!confirm("حذف نهائي؟")) return;
    await supabase.from("notifications" as never).delete().eq("id", id);
    load();
  }

  const filtered = useMemo(() => {
    const inTab = items.filter((n) => (tab === "archive" ? n.archived : !n.archived));
    const q = search.trim().toLowerCase();
    if (!q) return inTab;
    return inTab.filter((n) => n.title.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q));
  }, [items, tab, search]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="relative rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
          <Bell className="h-4 w-4" />
          {unread > 0 && <span className="absolute -top-1 -left-1 h-5 min-w-5 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">مركز الإشعارات</span>
            {tab === "inbox" && unread > 0 && (
              <Button size="sm" variant="ghost" onClick={markAllRead}><Check className="h-3 w-3 ml-1" /> قراءة الكل</Button>
            )}
          </div>
          <div className="inline-flex bg-muted rounded-full p-0.5 w-full">
            <button className={`flex-1 px-3 py-1 rounded-full text-xs font-bold ${tab === "inbox" ? "bg-white shadow" : "text-muted-foreground"}`} onClick={() => setTab("inbox")}>الوارد ({items.filter((n) => !n.archived).length})</button>
            <button className={`flex-1 px-3 py-1 rounded-full text-xs font-bold ${tab === "archive" ? "bg-white shadow" : "text-muted-foreground"}`} onClick={() => setTab("archive")}>المؤرشفة ({items.filter((n) => n.archived).length})</button>
          </div>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث..." className="h-8 pr-7 text-xs" />
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {filtered.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">لا توجد إشعارات</p>}
          {filtered.map((n) => (
            <div key={n.id} className={`px-3 py-2 border-b last:border-b-0 ${!n.read && !n.archived ? "bg-primary/5" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  {!n.read && !n.archived && <button onClick={() => markRead(n.id)} title="تحديد كمقروء" className="p-1 hover:bg-muted rounded"><Check className="h-3 w-3" /></button>}
                  {!n.archived
                    ? <button onClick={() => archive(n.id)} title="أرشفة" className="p-1 hover:bg-muted rounded"><Archive className="h-3 w-3" /></button>
                    : <button onClick={() => unarchive(n.id)} title="استرجاع" className="p-1 hover:bg-muted rounded"><RotateCcw className="h-3 w-3" /></button>}
                  <button onClick={() => remove(n.id)} title="حذف" className="p-1 hover:bg-muted rounded text-destructive"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
