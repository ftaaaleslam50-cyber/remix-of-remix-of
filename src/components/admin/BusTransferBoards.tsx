// مخططات الحافلات الحية + «مود النقل بين الحافلات»: نقل حجز كامل واحد إلى مقاعد يختارها المستخدم يدويًا.
// النقل ذري عبر RPC move_booking_outbound الذي يغيّر حافلة/مقاعد الذهاب فقط ويحفظ بيانات العودة كما هي.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Bus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { SelectedBusSeatBoard } from "@/components/admin/SelectedBusSeatBoard";
import type { LiveSeatBooking } from "@/components/admin/LiveSeatBoard";

type BoardBus = Parameters<typeof SelectedBusSeatBoard>[0]["bus"];
type TBooking = LiveSeatBooking & { bus_id?: string | null };

interface Source { bookingId: string; busId: string; code: string; name: string; seats: string[] }

export function BusTransferBoards({ buses, bookings, onRefresh }: {
  buses: BoardBus[];
  bookings: TBooking[];
  onRefresh: () => Promise<unknown> | void;
}) {
  const [mode, setMode] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [target, setTarget] = useState<{ busId: string; seats: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => { setSource(null); setTarget(null); };
  useEffect(() => { if (!mode) reset(); }, [mode]);

  async function execute(src: Source, busId: string, seats: string[]) {
    setBusy(true);
    const { error } = await supabase.rpc("move_booking_outbound" as never, {
      _booking_id: src.bookingId, _target_bus_id: busId, _seats: seats,
    } as never);
    if (error) {
      setBusy(false);
      toast.error(`فشل النقل: ${error.message}`);
      setTarget({ busId, seats: seats.slice(0, -1) });
      return;
    }
    await onRefresh();
    setBusy(false);
    reset();
    const bus = buses.find((b) => b.id === busId);
    toast.success(`تم نقل الحجز ${src.code} إلى حافلة #${bus?.bus_number ?? ""} — المقاعد ${seats.join("، ")}`);
  }

  function handleClick(busId: string, label: string, occ: { bookingId: string } | null) {
    if (busy) return;
    if (!source) {
      if (!occ) return toast.info("اضغط أولًا على مقعد تابع للحجز المراد نقله");
      const b = bookings.find((x) => x.id === occ.bookingId);
      if (!b) return;
      setSource({ bookingId: b.id, busId, code: b.booking_code ?? "", name: b.customer_name ?? "", seats: b.seat_numbers ?? [] });
      setTarget(null);
      return;
    }
    if (occ) {
      if (occ.bookingId === source.bookingId) return;
      return toast.error(`المقعد ${label} مشغول — اختر مقعدًا فارغًا`);
    }
    const need = source.seats.length;
    const current = target && target.busId === busId ? target.seats : [];
    if (target && target.busId !== busId && target.seats.length) toast.info("تم بدء الاختيار في حافلة أخرى");
    const next = current.includes(label) ? current.filter((s) => s !== label) : [...current, label];
    if (next.length > need) return;
    setTarget({ busId, seats: next });
    if (next.length === need) void execute(source, busId, next);
  }

  const need = source?.seats.length ?? 0;
  const chosen = target?.seats.length ?? 0;

  return (
    <div className="col-span-2 md:col-span-4 lg:col-span-6 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-extrabold flex items-center gap-2">
          <Bus className="size-4 text-primary" /> مخططات الحافلات الحية
        </h2>
        <label className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold cursor-pointer ${mode ? "border-warning bg-warning/15" : ""}`}>
          <ArrowLeftRight className="size-4" /> مود النقل بين الحافلات
          <Switch checked={mode} onCheckedChange={setMode} disabled={busy} />
        </label>
      </div>

      {mode && (
        <div className="sticky top-2 z-20 rounded-lg border-2 border-warning bg-card p-3 text-sm shadow-md flex items-center justify-between gap-2 flex-wrap">
          {!source ? (
            <span>١) اضغط على أي مقعد تابع للحجز المراد نقله في الحافلة المصدر — يُحدَّد الحجز كاملًا.</span>
          ) : (
            <div className="space-y-1">
              <div>الحجز <b dir="ltr">{source.code}</b> — {source.name} — <b>{need}</b> أفراد (المقاعد {source.seats.join("، ")})</div>
              <div className="font-bold">
                {busy ? "جارٍ النقل…" : `٢) اختر ${need} مقاعد فارغة في الحافلة المستهدفة: تم اختيار ${chosen} من ${need} مقاعد`}
              </div>
            </div>
          )}
          {source && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={reset} disabled={busy}>
              <X className="size-4 ml-1" /> إلغاء العملية
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {buses.map((bus, index) => (
          <SelectedBusSeatBoard key={bus.id} bus={bus} index={index}
            bookings={bookings.filter((b) => b.bus_id === bus.id)}
            onSaved={() => { void onRefresh(); }}
            transfer={mode ? {
              sourceSeats: source && source.busId === bus.id ? source.seats : [],
              targetSeats: target && target.busId === bus.id ? target.seats : [],
              busy,
              onSeatClick: (label, occ) => handleClick(bus.id, label, occ),
            } : null} />
        ))}
      </div>
    </div>
  );
}
