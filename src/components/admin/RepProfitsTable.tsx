// جدول أرباح مصادر الحجز (المناديب) داخل «الحسابات والتصفية»
// مع فلتر حافلات مستقل، عمود ديون يدوي، وتصدير Excel/PDF.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BusMultiSelect, type BusOption } from "@/components/admin/BusMultiSelect";
import { buildSettlementWorkbook, printSettlementSheet, downloadBlob } from "@/lib/export/settlement-sheet";

export interface RepProfitRow {
  b: { bus_id: string | null; rep_profile_id?: string | null; booking_source?: string | null };
  count: number;
  grandTotal: number;
  grossProfit: number;
  repShare: number;
  companyShare: number;
}

type Debt = { rep_key: string; amount: number };
const r2 = (v: number) => Math.round(v);
const norm = (v: string) => v.replace(/\s+/g, " ").trim();

export function RepProfitsTable({
  rows,
  buses,
  repProfiles,
}: {
  rows: RepProfitRow[];
  buses: BusOption[];
  repProfiles: Array<{ id: string; full_name: string | null }>;
}) {
  const qc = useQueryClient();
  const [busIds, setBusIds] = useState<string[]>([]);
  const { data: debts = [] } = useQuery({
    queryKey: ["rep-debts"],
    queryFn: async () => ((await supabase.from("rep_debts").select("rep_key,amount")).data ?? []) as Debt[],
  });
  const [draft, setDraft] = useState<Record<string, string>>({});
  useEffect(() => {
    const m: Record<string, string> = {};
    debts.forEach((d) => (m[d.rep_key] = String(Number(d.amount) || 0)));
    setDraft(m);
  }, [debts]);

  const usedBuses = useMemo(() => {
    const ids = new Set(rows.map((r) => r.b.bus_id).filter(Boolean));
    return buses.filter((b) => ids.has(b.id));
  }, [rows, buses]);

  const groups = useMemo(() => {
    const byName = new Map(repProfiles.map((p) => [norm(p.full_name || ""), p]));
    const map = new Map<
      string,
      { key: string; name: string; profileId: string | null; bookings: number; pax: number; sales: number; gross: number; rep: number; company: number }
    >();
    for (const r of rows) {
      if (busIds.length && (!r.b.bus_id || !busIds.includes(r.b.bus_id))) continue;
      const src = r.b.booking_source || "الموقع";
      const prof = r.b.rep_profile_id
        ? repProfiles.find((p) => p.id === r.b.rep_profile_id)
        : byName.get(norm(src));
      const key = prof ? `p:${prof.id}` : `s:${norm(src)}`;
      const g = map.get(key) ?? {
        key,
        name: prof?.full_name || src,
        profileId: prof?.id ?? null,
        bookings: 0, pax: 0, sales: 0, gross: 0, rep: 0, company: 0,
      };
      g.bookings++;
      g.pax += r.count;
      g.sales += r.grandTotal;
      g.gross += r.grossProfit;
      g.rep += r.repShare;
      g.company += r.companyShare;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.rep - a.rep);
  }, [rows, busIds, repProfiles]);

  const debtOf = (k: string) => Number(debts.find((d) => d.rep_key === k)?.amount) || 0;
  const tot = groups.reduce(
    (s, g) => ({
      bookings: s.bookings + g.bookings, pax: s.pax + g.pax, sales: s.sales + g.sales, gross: s.gross + g.gross,
      rep: s.rep + g.rep, company: s.company + g.company, debt: s.debt + debtOf(g.key),
    }),
    { bookings: 0, pax: 0, sales: 0, gross: 0, rep: 0, company: 0, debt: 0 },
  );

  async function saveDebt(g: (typeof groups)[number]) {
    const amount = Number(draft[g.key]) || 0;
    const { error } = await supabase.from("rep_debts").upsert(
      { rep_key: g.key, rep_profile_id: g.profileId, source_name: g.name, amount },
      { onConflict: "rep_key" },
    );
    if (error) return toast.error(error.message);
    toast.success(`تم حفظ ديون ${g.name}`);
    qc.invalidateQueries({ queryKey: ["rep-debts"] });
  }

  const columns = ["المندوب / المصدر", "الحجوزات", "الأفراد", "المبيعات", "مجمل الربح", "حصة المندوب", "حصة المؤسسة", "الديون", "الربح النهائي للمندوب"];
  function exportData() {
    const selected = usedBuses.filter((b) => busIds.includes(b.id)).map((b) => b.name || `حافلة ${b.bus_number}`);
    return {
      title: `أرباح مصادر الحجز${selected.length ? ` — ${selected.join("، ")}` : ""}`,
      columns,
      rows: groups.map((g) => {
        const d = debtOf(g.key);
        return [g.name, g.bookings, g.pax, r2(g.sales), r2(g.gross), r2(g.rep), r2(g.company), r2(d), r2(g.rep - d)];
      }),
      totals: ["الإجمالي", tot.bookings, tot.pax, r2(tot.sales), r2(tot.gross), r2(tot.rep), r2(tot.company), r2(tot.debt), r2(tot.rep - tot.debt)],
      highlightColumn: "الربح النهائي للمندوب",
    };
  }
  async function exportExcel() {
    downloadBlob(await buildSettlementWorkbook(exportData()), `rep-profits-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function exportPdf() {
    if (!printSettlementSheet(exportData())) toast.error("الرجاء السماح بالنوافذ المنبثقة لإنشاء PDF");
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-extrabold">أرباح مصادر الحجز (المناديب)</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="rounded-full" onClick={exportExcel}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="rounded-full" onClick={exportPdf}>
            <Download className="h-4 w-4 ml-1" /> PDF
          </Button>
        </div>
      </div>
      <div className="max-w-md">
        <p className="text-xs mb-1 text-muted-foreground">الحافلات (اتركها فارغة لكل الحافلات)</p>
        <BusMultiSelect buses={usedBuses} value={busIds} onChange={setBusIds} />
      </div>
      <p className="text-xs text-muted-foreground">
        الديون مبلغ تكتبه يدويًا لكل مندوب (ديون قديمة عليه) ويُخصم من ربحه، ويظهر له في «حجوزاتي وأرباحي».
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted">
              {columns.map((c) => (
                <th key={c} className="border px-2 py-1 whitespace-nowrap">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const d = debtOf(g.key);
              return (
                <tr key={g.key}>
                  <td className="border px-2 py-1 font-bold whitespace-nowrap">{g.name}</td>
                  <td className="border px-2 py-1 text-center">{g.bookings}</td>
                  <td className="border px-2 py-1 text-center">{g.pax}</td>
                  <td className="border px-2 py-1 text-center">{r2(g.sales)}</td>
                  <td className="border px-2 py-1 text-center">{r2(g.gross)}</td>
                  <td className="border px-2 py-1 text-center">{r2(g.rep)}</td>
                  <td className="border px-2 py-1 text-center">{r2(g.company)}</td>
                  <td className="border px-1 py-1">
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        dir="ltr"
                        className="h-7 w-24 text-xs"
                        value={draft[g.key] ?? "0"}
                        onChange={(e) => setDraft({ ...draft, [g.key]: e.target.value })}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => saveDebt(g)}>
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                  <td className="border px-2 py-1 text-center font-extrabold text-primary">{r2(g.rep - d)}</td>
                </tr>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="border py-4 text-center text-muted-foreground">لا توجد بيانات</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="bg-muted font-bold">
              <td className="border px-2 py-1">الإجمالي</td>
              <td className="border px-2 py-1 text-center">{tot.bookings}</td>
              <td className="border px-2 py-1 text-center">{tot.pax}</td>
              <td className="border px-2 py-1 text-center">{r2(tot.sales)}</td>
              <td className="border px-2 py-1 text-center">{r2(tot.gross)}</td>
              <td className="border px-2 py-1 text-center">{r2(tot.rep)}</td>
              <td className="border px-2 py-1 text-center">{r2(tot.company)}</td>
              <td className="border px-2 py-1 text-center">{r2(tot.debt)}</td>
              <td className="border px-2 py-1 text-center">{r2(tot.rep - tot.debt)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
