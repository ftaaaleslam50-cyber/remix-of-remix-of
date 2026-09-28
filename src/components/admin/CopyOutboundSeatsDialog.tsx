// نسخ مقاعد الذهاب إلى العودة مع معاينة التعارضات قبل الاعتماد.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { planCopy, type PlanBooking } from "@/lib/return-seat-plan";

interface Bk {
  id: string; booking_code: string; customer_name: string | null; created_at: string;
  bus_id?: string | null; seat_numbers?: string[] | null;
  return_bus_id: string | null; return_seat_numbers: string[] | null;
}
interface BusLite { id: string; name: string | null; bus_number: number; capacity: number }

export function CopyOutboundSeatsDialog({ open, onOpenChange, bookings, tripBuses, allBuses, templateId, onDone }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookings: Bk[];
  tripBuses: BusLite[];   // حافلات العودة المضافة لهذا التاريخ
  allBuses: BusLite[];    // للأسماء (تشمل حافلات الذهاب)
  templateId: string;
  onDone: () => void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const label = (b?: BusLite | null) => (b ? b.name || `حافلة ${b.bus_number}` : "بدون حافلة");

  const pending = useMemo(
    () => bookings.filter((b) => !b.return_bus_id || (b.return_seat_numbers?.length ?? 0) === 0),
    [bookings],
  );
  const outboundIds = useMemo(() => Array.from(new Set(pending.map((b) => b.bus_id).filter(Boolean) as string[])), [pending]);

  useEffect(() => {
    if (!open) return;
    // لو فيه حافلة عودة واحدة فقط تُختار تلقائيًا
    setMapping(Object.fromEntries(outboundIds.map((id) => [id, tripBuses.length === 1 ? tripBuses[0]!.id : ""])));
  }, [open, outboundIds, tripBuses]);

  const plan = useMemo(() => {
    const pb: PlanBooking[] = bookings.map((b) => ({
      id: b.id, name: b.customer_name || b.booking_code, created_at: b.created_at,
      bus_id: b.bus_id ?? null, seats: b.seat_numbers ?? [],
      return_bus_id: b.return_bus_id, return_seats: b.return_seat_numbers ?? [],
    }));
    return planCopy(pb, tripBuses, mapping);
  }, [bookings, tripBuses, mapping]);

  const same = plan.filter((p) => p.status === "same").length;
  const moved = plan.filter((p) => p.status === "moved");
  const review = plan.filter((p) => p.status === "review");

  async function apply() {
    const items = plan.filter((p) => p.status !== "review" && p.targetBusId);
    if (items.length === 0) return toast.error("لا يوجد ما يمكن اعتماده");
    setSaving(true);
    const results = await Promise.all(items.map((p) =>
      supabase.from("bookings").update({
        return_trip_id: templateId, return_bus_id: p.targetBusId, return_seat_numbers: p.to,
      } as never).eq("id", p.bookingId),
    ));
    setSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) return toast.error(failed.error.message);
    toast.success(`تم توزيع ${items.length} حجز`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>نسخ مقاعد الذهاب إلى العودة</DialogTitle>
          <DialogDescription>
            كل حجز يحتفظ بمقاعده إن كانت فاضية. عند التعارض يحتفظ الأقدم حجزًا بمقعده، وينتقل الآخر كمجموعة لأقرب مقاعد فاضية.
          </DialogDescription>
        </DialogHeader>

        {tripBuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">أضف حافلة عودة لهذا التاريخ أولًا.</p>
        ) : (
          <>
            <div className="space-y-2">
              <div className="text-sm font-bold">حافلة الذهاب ← حافلة العودة</div>
              {outboundIds.length === 0 && <p className="text-xs text-muted-foreground">لا توجد حجوزات غير موزعة لها حافلة ذهاب.</p>}
              {outboundIds.map((oid) => (
                <div key={oid} className="flex items-center gap-2">
                  <span className="text-sm w-40">{label(allBuses.find((b) => b.id === oid))}</span>
                  <span>←</span>
                  <Select value={mapping[oid] || "__none"} onValueChange={(v) => setMapping({ ...mapping, [oid]: v === "__none" ? "" : v })}>
                    <SelectTrigger className="h-9 w-48"><SelectValue placeholder="اختر" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— اختر —</SelectItem>
                      {tripBuses.map((b) => <SelectItem key={b.id} value={b.id}>{label(b)} ({b.capacity})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <Badge className="bg-success text-white">نفس المقاعد: {same}</Badge>
              <Badge className="bg-warning text-white">منقولة: {moved.length}</Badge>
              <Badge variant="destructive">تحتاج مراجعة: {review.length}</Badge>
            </div>

            {moved.length > 0 && (
              <div className="rounded-xl border p-3 space-y-1">
                <div className="text-sm font-bold">مقاعد تغيّرت (راجعها قبل الاعتماد)</div>
                {moved.map((p) => (
                  <div key={p.bookingId} className="text-xs">{p.name}: {p.from.join("، ")} ← <b>{p.to.join("، ")}</b></div>
                ))}
                <p className="text-[11px] text-muted-foreground">
                  النقل يتم بالأرقام فقط ولا يراعي تجاور الرجال والنساء (يعتمد على مخطط الحافلة) — راجع مخطط التوزيع بعد الاعتماد.
                </p>
              </div>
            )}
            {review.length > 0 && (
              <div className="rounded-xl border border-destructive/40 p-3 space-y-1">
                <div className="text-sm font-bold">لن تُوزَّع (توزّعها يدويًا)</div>
                {review.map((p) => <div key={p.bookingId} className="text-xs">{p.name} — {p.reason}</div>)}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button className="rounded-full" disabled={saving || same + moved.length === 0} onClick={apply}>
            {saving ? "جارٍ الحفظ..." : `اعتماد (${same + moved.length})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
