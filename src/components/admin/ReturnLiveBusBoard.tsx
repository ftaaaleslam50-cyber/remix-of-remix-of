// مخطط حي لحافلة عودة: نفس LiveSeatBoard (سحب/تبديل/اعتماد، أسماء، مصدر الحجز، نوعه) + تصدير PNG.
import { useQuery } from "@tanstack/react-query";
import { Bus, ImageIcon, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LiveSeatBoard, type LiveSeatBooking } from "@/components/admin/LiveSeatBoard";
import { mirrorLayout, type LayoutJson } from "@/components/booking/LayoutSeatMap";
import {
  buildDefaultLayout,
  downloadSeatChartPng,
  renderSeatChartPages,
  twoPartName,
  type SeatOccupant,
} from "@/lib/bus-seat-chart";
import type { ReturnBookingRow } from "@/components/admin/ReturnTripsManager";

interface Props {
  bus: { id: string; name: string | null; bus_number: number; capacity: number; layout_id?: string | null };
  bookings: ReturnBookingRow[];
  index: number;
  tripLabel?: string;
  onSaved: () => void;
  externalPickedId?: string | null;
  onExternalPlace?: (seat: string, bookingId: string) => void;
  onRemoveBus?: () => void;
}

const shortName = (n: string | null | undefined) => twoPartName(n ?? "");

export function ReturnLiveBusBoard({ bus, bookings, index, tripLabel, onSaved, externalPickedId, onExternalPlace, onRemoveBus }: Props) {
  const { data: layout, isPending } = useQuery({
    queryKey: ["ub-bus-layout", bus.layout_id],
    enabled: !!bus.layout_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("bus_layouts").select("layout_json").eq("id", bus.layout_id!).maybeSingle();
      if (error) throw error;
      return data as { layout_json: LayoutJson } | null;
    },
  });
  const onBus = bookings.filter((b) => b.return_bus_id === bus.id && b.status !== "cancelled");
  const live: LiveSeatBooking[] = onBus.map((b) => ({
    id: b.id,
    customer_name: b.customer_name,
    booking_code: b.booking_code,
    seat_numbers: b.return_seat_numbers ?? [],
    seat_genders: null,
    male_count: b.male_count ?? 0,
    booking_source: b.rep_name || b.booking_source,
    booking_type: b.booking_type,
  }));
  const occupied = live.reduce((s, b) => s + (b.seat_numbers?.length ?? 0), 0);
  const raw = layout?.layout_json ?? buildDefaultLayout("A");
  const label = bus.name || `حافلة ${bus.bus_number}`;
  const accents = ["border-t-primary", "border-t-secondary", "border-t-chart-5"];

  function exportPng() {
    const occ: SeatOccupant[] = [];
    for (const b of onBus) {
      (b.return_seat_numbers ?? []).forEach((seat, i) =>
        occ.push({
          seat,
          name: b.customer_name ?? "",
          gender: i < Number(b.male_count ?? 0) ? "male" : "female",
          bookingCode: b.booking_code,
          phone: b.contact_phone,
          bookingType: b.booking_type ?? "family",
        }),
      );
    }
    occ.sort((a, z) => a.seat.localeCompare(z.seat, "en", { numeric: true }));
    const pages = renderSeatChartPages(raw, occ, { busLabel: `عودة — ${label}`, tripLabel, capacity: bus.capacity });
    downloadSeatChartPng(pages, `return-seat-chart-${label}-${new Date().toISOString().slice(0, 10)}`);
  }

  return (
    <section className={`min-w-0 rounded-lg border border-t-4 bg-card p-3 ${accents[index % accents.length]}`}>
      <header className="flex items-center justify-between gap-2 border-b pb-2 mb-3">
        <h3 className="flex items-center gap-2 font-extrabold text-sm">
          <Bus className="size-4 text-secondary" /> حافلة عودة #{bus.bus_number}
          {bus.name ? ` — ${bus.name}` : ""}
        </h3>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-muted px-2 py-1 text-xs font-bold tabular-nums">
            {occupied} / {bus.capacity}
          </span>
          <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={exportPng}>
            <ImageIcon className="h-3.5 w-3.5 ml-1" /> PNG
          </Button>
          {onRemoveBus && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full text-destructive" title="إزالة الحافلة من هذه العودة" onClick={onRemoveBus}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </header>
      {bus.layout_id && isPending ? (
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <LiveSeatBoard layout={mirrorLayout(raw)} bookings={live} shortName={shortName} onSaved={onSaved} seatField="return" externalPickedId={externalPickedId} onExternalPlace={onExternalPlace} />
      )}
    </section>
  );
}
