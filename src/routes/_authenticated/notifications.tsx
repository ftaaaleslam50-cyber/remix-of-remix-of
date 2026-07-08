import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Trash2, Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [{ title: `الإشعارات | ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: NotificationsPage,
});

interface Notif { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; archived: boolean; created_at: string; }

function NotificationsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"inbox" | "archive">("inbox");

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", tab],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications" as never)
        .select("*").eq("archived", tab === "archive").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as Notif[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("notifications-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  async function markRead(id: string) {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function markAllRead() {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("read", false);
    toast.success("تم تحديد الكل كمقروء");
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function archive(id: string) {
    await supabase.from("notifications" as never).update({ archived: true, read: true } as never).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function unarchive(id: string) {
    await supabase.from("notifications" as never).update({ archived: false } as never).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function remove(id: string) {
    if (!confirm("حذف الإشعار نهائيًا؟")) return;
    await supabase.from("notifications" as never).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Bell className="h-5 w-5" /><h1 className="text-xl font-extrabold">مركز الإشعارات</h1></div>
          <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowRight className="h-4 w-4 ml-1" /> رجوع</Button></Link>
        </div>
      </header>
      <main className="container-luxe py-8">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="inline-flex bg-white rounded-full p-1">
            <button className={`px-4 py-1.5 rounded-full text-sm font-bold ${tab === "inbox" ? "bg-primary text-white" : ""}`} onClick={() => setTab("inbox")}>الوارد</button>
            <button className={`px-4 py-1.5 rounded-full text-sm font-bold ${tab === "archive" ? "bg-primary text-white" : ""}`} onClick={() => setTab("archive")}>المؤرشفة</button>
          </div>
          {tab === "inbox" && <Button onClick={markAllRead} variant="outline" className="rounded-full"><Check className="h-4 w-4 ml-1" /> تحديد الكل كمقروء</Button>}
        </div>

        <div className="surface-card divide-y">
          {items.length === 0 && <p className="text-center text-muted-foreground py-16 text-sm">لا توجد إشعارات.</p>}
          {items.map((n) => (
            <div key={n.id} className={`p-4 flex items-start gap-3 ${!n.read ? "bg-primary/5" : ""}`}>
              <div className={`h-2 w-2 rounded-full mt-2 ${n.read ? "bg-muted-foreground/30" : "bg-primary"}`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{n.title}</p>
                {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.created_at)} · {n.type}</p>
              </div>
              <div className="flex gap-1">
                {n.link && <Link to={n.link}><Button size="sm" variant="outline">فتح</Button></Link>}
                {!n.read && <Button size="sm" variant="outline" onClick={() => markRead(n.id)} title="تحديد كمقروء"><Check className="h-3 w-3" /></Button>}
                {!n.archived
                  ? <Button size="sm" variant="outline" onClick={() => archive(n.id)}>أرشفة</Button>
                  : <Button size="sm" variant="outline" onClick={() => unarchive(n.id)}>استرجاع</Button>}
                <Button size="sm" variant="outline" onClick={() => remove(n.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
