// لوحة توزيع ركاب العودة على حافلات العودة بالسحب والإفلات (أو باللمس: اختر الراكب ثم اضغط المقعد).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, Wand2, X, Bus as BusIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { mirrorLayout, type LayoutCell, type LayoutJson } from "@/components/booking/LayoutSeatMap";
import { ReturnLiveBusBoard } from "@/components/admin/ReturnLiveBusBoard";
import { EXT_TYPE } from "@/components/admin/LiveSeatBoard";
import type { ReturnBookingRow } from "@/components/admin/ReturnTripsManager";

export interface BoardBus {
  id: string;
  name: string | null;
  bus_number: number;
  capacity: number;
  layout_id?: string | null;
}

const busTitle = (b: BoardBus) => b.name || (b.bus_number ? `حافلة ${b.bus_number}` : "حافلة");

/** مخطط افتراضي (صفوف 2+2) عند عدم وجود قالب مخطط للحافلة. */
function fallbackLayout(capacity: number): LayoutJson {
  const cells: LayoutCell[] = [];
  const rows = Math.ceil(capacity / 4);
  let n = 1;
  for (let r = 1; r <= rows; r++) {
    for (const c of [1, 2, 4, 5]) {
      if (n > capacity) break;
      cells.push({ row: r, col: c, kind: "seat", label: String(n++) });
    }
  }
  return { rows, cols: 5, cells };
}

const cellLabel = (c: LayoutCell) => (c.label && c.label.trim() ? c.label : `${c.row}-${c.col}`);

export function ReturnSeatBoard({
  buses,
  bookings,
  onAssign,
  onSaved,
  onRemoveBus,
  tripLabel,
}: {
  onSaved: () => void;
  onRemoveBus?: (busId: string) => void;
  tripLabel?: string;
  buses: BoardBus[];
  bookings: ReturnBookingRow[];
  onAssign: (b: ReturnBookingRow, busId: string | null, seats: string[]) => Promise<void> | void;
}) {
  const [picked, setPicked] = useState<string | null>(null); // booking id (drag or tap)
  const [hover, setHover] = useState<string | null>(null); // `${busId}:${seat}`

  const layoutIds = buses.map((b) => b.layout_id).filter(Boolean) as string[];
  const layouts = useQuery({
    queryKey: ["return-board-layouts", layoutIds.slice().sort().join(",")],
    enabled: layoutIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("bus_layouts").select("id,layout_json").in("id", layoutIds);
      if (error) throw error;
      const m: Record<string, LayoutJson> = {};
      for (const r of (data ?? []) as unknown as { id: string; layout_json: LayoutJson }[]) m[r.id] = r.layout_json;
      return m;
    },
  });

  // نفس معالجة مخطط الذهاب الحي (LiveSeatBoard): نعكس الأعمدة بـ mirrorLayout حتى
  // يطابق اتجاه العرض الفعلي للحافلة بدل الترتيب الخام المخزّن في layout_json.
  const layoutFor = (b: BoardBus): LayoutJson =>
    mirrorLayout((b.layout_id && layouts.data?.[b.layout_id]) || fallbackLayout(b.capacity));

  const pax = (b: ReturnBookingRow) => Math.max(1, b.passenger_count || 1);
  const undistributed = bookings.filter((b) => !b.return_bus_id || (b.return_seat_numbers?.length ?? 0) === 0);

  // مقعد → الحجز الذي يشغله، لكل حافلة
  const occupancy = useMemo(() => {
    const m: Record<string, Record<string, ReturnBookingRow>> = {};
    for (const b of bookings) {
      if (!b.return_bus_id) continue;
      const bus = (m[b.return_bus_id] ??= {});
      for (const s of b.return_seat_numbers ?? []) bus[s] = b;
    }
    return m;
  }, [bookings]);

  const pickedBooking = picked ? (bookings.find((b) => b.id === picked) ?? null) : null;

  /** المقاعد الحرة بدءًا من مقعد معيّن (أو من البداية) بعدد ركاب الحجز. */
  function seatsFrom(bus: BoardBus, startSeat: string | null, booking: ReturnBookingRow): string[] | null {
    const all = layoutFor(bus)
      .cells.filter((c) => c.kind === "seat" && !c.disabled)
      .map(cellLabel);
    const taken = occupancy[bus.id] ?? {};
    const free = all.filter((s) => !taken[s] || taken[s].id === booking.id);
    const need = pax(booking);
    let start = 0;
    if (startSeat) {
      start = free.indexOf(startSeat);
      if (start < 0) return null;
    }
    const out = free.slice(start, start + need);
    if (out.length < need) {
      // أكمل من أول مقاعد حرة إن لم تكفِ المتتالية
      const rest = free.filter((s) => !out.includes(s)).slice(0, need - out.length);
      out.push(...rest);
    }
    return out.length === need ? out : null;
  }

  async function drop(bus: BoardBus, seat: string | null, bookingId?: string) {
    const id = bookingId ?? picked;
    const b = bookings.find((x) => x.id === id);
    setHover(null);
    if (!b) return;
    const seats = seatsFrom(bus, seat, b);
    if (!seats) {
      const { toast } = await import("sonner");
      toast.error(`لا تتوفر ${pax(b)} مقاعد حرة في ${busTitle(bus)}`);
      return;
    }
    await onAssign(b, bus.id, seats);
    setPicked(null);
  }

  async function autoDistribute() {
    let queue = [...undistributed];
    const local: Record<string, Set<string>> = {};
    for (const bus of buses) {
      const all = layoutFor(bus)
        .cells.filter((c) => c.kind === "seat" && !c.disabled)
        .map(cellLabel);
      const taken = new Set(Object.keys(occupancy[bus.id] ?? {}));
      local[bus.id] = taken;
      const free = () => all.filter((s) => !taken.has(s));
      const next: ReturnBookingRow[] = [];
      for (const b of queue) {
        const f = free();
        if (f.length >= pax(b)) {
          const seats = f.slice(0, pax(b));
          seats.forEach((s) => taken.add(s));
          await onAssign(b, bus.id, seats);
        } else next.push(b);
      }
      queue = next;
      if (queue.length === 0) break;
    }
    const { toast } = await import("sonner");
    if (queue.length) toast.warning(`تعذّر توزيع ${queue.length} حجز — المقاعد غير كافية`);
    else toast.success("تم توزيع جميع الركاب");
  }

  const dragProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(EXT_TYPE, id);
      e.dataTransfer.effectAllowed = "move";
      setPicked(id);
    },
    onDragEnd: () => setHover(null),
  });

  return (
    <div className="space-y-4">
      {/* غير الموزعين */}
      <div
        className="rounded-xl border bg-muted/30 p-3"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(EXT_TYPE)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const b = bookings.find((x) => x.id === e.dataTransfer.getData(EXT_TYPE));
          if (b && b.return_bus_id) void onAssign(b, null, []);
        }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="text-sm font-bold">غير موزعين ({undistributed.length})</div>
          <div className="flex items-center gap-2">
            {pickedBooking && (
              <Button size="sm" variant="ghost" className="rounded-full h-7 text-xs" onClick={() => setPicked(null)}>
                <X className="h-3.5 w-3.5 ml-1" /> إلغاء اختيار «
                {pickedBooking.customer_name || pickedBooking.booking_code}»
              </Button>
            )}
            {undistributed.length > 0 && buses.length > 0 && (
              <Button size="sm" variant="secondary" className="rounded-full h-7 text-xs" onClick={autoDistribute}>
                <Wand2 className="h-3.5 w-3.5 ml-1" /> توزيع تلقائي
              </Button>
            )}
          </div>
        </div>
        {undistributed.length === 0 ? (
          <p className="text-xs text-muted-foreground">جميع الركاب موزعون على الحافلات.</p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground mb-2">
              اسحب الراكب وأفلته على مقعد في الحافلة — أو اضغط عليه ثم اضغط المقعد المطلوب (للجوال). لإلغاء توزيع راكب اسحب مقعده إلى هنا.
            </p>
            <div className="flex flex-wrap gap-2">
              {undistributed.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  {...dragProps(b.id)}
                  onClick={() => setPicked(picked === b.id ? null : b.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold cursor-grab active:cursor-grabbing transition ${
                    picked === b.id
                      ? "bg-primary text-primary-foreground border-primary shadow"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5 opacity-60" />
                  {b.customer_name || b.booking_code}
                  <Badge variant={picked === b.id ? "secondary" : "outline"} className="text-[10px] px-1.5 py-0">
                    {pax(b)}
                  </Badge>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* الحافلات — المخطط الحي (سحب/تبديل/اعتماد) + الإفلات من قائمة غير الموزعين */}
      {buses.length === 0 ? (
        <p className="text-xs text-muted-foreground">أضف حافلة عودة أولًا لتتمكن من التوزيع.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {buses.map((bus, i) => (
            <ReturnLiveBusBoard
              key={bus.id}
              bus={bus}
              bookings={bookings}
              index={i}
              tripLabel={tripLabel}
              onSaved={onSaved}
              externalPickedId={picked}
              onExternalPlace={(seat, id) => void drop(bus, seat, id)}
              onRemoveBus={onRemoveBus ? () => onRemoveBus(bus.id) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
