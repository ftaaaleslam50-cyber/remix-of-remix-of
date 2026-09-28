import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DeletedBus {
  id: string;
  bus_label: string | null;
  bus_number: number | null;
  plate: string | null;
  driver_name: string | null;
  deleted_at: string;
  deleted_by_name: string | null;
  snapshot: Record<string, unknown> | null;
}

const CONFLICT_LABEL: Record<string, string> = { bus_number: "رقم الحافلة", plate: "رقم اللوحة", id: "المعرّف" };

/** قسم الحافلات المحذوفة مع الاسترجاع الآمن. */
export function DeletedBusesSection() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data: rows = [] } = useQuery({
    queryKey: ["deleted-buses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deleted_buses" as never)
        .select("id,bus_label,bus_number,plate,driver_name,deleted_at,deleted_by_name,snapshot")
        .is("restored_at" as never, null)
        .order("deleted_at" as never, { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DeletedBus[];
    },
  });

  async function restore(r: DeletedBus) {
    setBusy(r.id);
    try {
      const call = (mode: string) =>
        supabase.rpc("restore_deleted_bus" as never, { _snapshot_id: r.id, _mode: mode } as never);
      let { data, error } = await call("restore");
      if (error) return void toast.error(error.message);
      let res = data as unknown as { ok: boolean; conflicts: string[]; notes?: string };
      if (!res.ok) {
        if (res.conflicts.includes("id")) return void toast.error("لا يمكن الاسترجاع: الحافلة موجودة بالفعل.");
        const list = res.conflicts.map((c) => CONFLICT_LABEL[c] ?? c).join("، ");
        if (!confirm(`يوجد تعارض مع حافلة حالية في: ${list}.\n\nلن يتم استبدال الحافلة الحالية. هل تريد الاسترجاع برقم حافلة جديد متاح وإزالة اللوحة المتعارضة؟`)) return;
        ({ data, error } = await call("renumber"));
        if (error) return void toast.error(error.message);
        res = data as unknown as typeof res;
      }
      toast.success(`تم استرجاع الحافلة${res.notes ? ` — ${res.notes}` : ""}`);
      qc.invalidateQueries({ queryKey: ["deleted-buses"] });
      qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
      qc.invalidateQueries({ queryKey: ["admin-buses-booking-counts"] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="surface-card p-4 space-y-3">
      <h2 className="text-lg font-extrabold flex items-center gap-2">
        <Trash2 className="h-5 w-5" /> الحافلات المحذوفة ({rows.length})
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد حافلات محذوفة.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الحافلة</TableHead>
                <TableHead>اللوحة</TableHead>
                <TableHead>السائق</TableHead>
                <TableHead>تاريخ الحذف</TableHead>
                <TableHead>بواسطة</TableHead>
                <TableHead>نسخة الاسترجاع</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-bold whitespace-nowrap">{r.bus_label ?? `حافلة ${r.bus_number ?? ""}`}</TableCell>
                  <TableCell dir="ltr">{r.plate || "—"}</TableCell>
                  <TableCell>{r.driver_name || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.deleted_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}
                  </TableCell>
                  <TableCell>{r.deleted_by_name || "—"}</TableCell>
                  <TableCell>
                    {r.snapshot && (r.snapshot as { bus?: unknown }).bus ? <Badge>سليمة</Badge> : <Badge variant="destructive">غير مكتملة</Badge>}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" className="rounded-full" disabled={busy === r.id} onClick={() => void restore(r)}>
                      {busy === r.id ? "جارٍ..." : "استرجاع الحافلة"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
