import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, ScrollText, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: `سجل النظام | ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: AuditPage,
});

interface Entry {
  id: string; actor_id: string | null; actor_name: string | null;
  action: string; entity: string | null; entity_id: string | null;
  details: Record<string, unknown> | null; created_at: string;
}

function AuditPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");

  const { data: entries = [] } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log" as never)
        .select("*").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data as unknown as Entry[]) ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("audit-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => {
        qc.invalidateQueries({ queryKey: ["audit-log"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const shown = entries.filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return e.action.toLowerCase().includes(q)
      || (e.entity ?? "").toLowerCase().includes(q)
      || (e.actor_name ?? "").toLowerCase().includes(q)
      || JSON.stringify(e.details ?? {}).toLowerCase().includes(q);
  });

  function exportExcel() {
    const rows = shown.map((e) => ({
      "التاريخ": formatDate(e.created_at),
      "الإجراء": e.action,
      "الكيان": e.entity ?? "",
      "المعرف": e.entity_id ?? "",
      "المستخدم": e.actor_name ?? e.actor_id ?? "",
      "التفاصيل": JSON.stringify(e.details ?? {}),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit");
    XLSX.writeFile(wb, `audit-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><ScrollText className="h-5 w-5" /><h1 className="text-xl font-extrabold">سجل النظام (Audit)</h1></div>
          <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowRight className="h-4 w-4 ml-1" /> رجوع</Button></Link>
        </div>
      </header>

      <main className="container-luxe py-8">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Input placeholder="بحث (إجراء / كيان / مستخدم / تفاصيل)" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-md rounded-full" />
          <Button onClick={exportExcel} variant="outline" className="rounded-full"><Download className="h-4 w-4 ml-1" /> تصدير</Button>
          <span className="text-sm text-muted-foreground ml-auto">{shown.length} من {entries.length}</span>
        </div>

        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-right">
              <tr>
                <th className="p-3">التاريخ</th>
                <th className="p-3">الإجراء</th>
                <th className="p-3">الكيان</th>
                <th className="p-3">المستخدم</th>
                <th className="p-3">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد سجلات.</td></tr>}
              {shown.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="p-3 text-xs whitespace-nowrap text-muted-foreground">{formatDate(e.created_at)}</td>
                  <td className="p-3 font-bold" dir="ltr">{e.action}</td>
                  <td className="p-3 text-xs" dir="ltr">{e.entity ?? "-"}{e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ""}</td>
                  <td className="p-3 text-xs">{e.actor_name ?? (e.actor_id ? e.actor_id.slice(0, 8) : "-")}</td>
                  <td className="p-3 text-xs text-muted-foreground max-w-md">
                    <code className="text-[10px] break-all" dir="ltr">{JSON.stringify(e.details ?? {})}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
