import { useQuery } from "@tanstack/react-query";
import { Bus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LiveSeatBoard, type LiveSeatBooking } from "@/components/admin/LiveSeatBoard";
import { busDateLabel } from "@/components/admin/BusMultiSelect";
import { mirrorLayout, type LayoutJson } from "@/components/booking/LayoutSeatMap";
import { buildDefaultLayout, twoPartName } from "@/lib/bus-seat-chart";

interface BoardBus {
  id: string;
  name: string | null;
  bus_number: number;
  capacity: number;
  assigned_date?: string | null;
  layout?: string | null;
  layout_id?: string | null;
  driver_name?: string | null;
  supervisor_name?: string | null;
}

const shortName = (name: string | null | undefined) => twoPartName(name ?? "");

export function SelectedBusSeatBoard({ bus, bookings, index, onSaved }: {
  bus: BoardBus;
  bookings: LiveSeatBooking[];
  index: number;
  onSaved: () => void;
}) {
  const { data: layout, isPending, isError, refetch } = useQuery({
    queryKey: ["ub-bus-layout", bus.layout_id],
    enabled: !!bus.layout_id,
    queryFn: async () => {
      if (!bus.layout_id) return null;
      const { data, error } = await supabase.from("bus_layouts").select("layout_json").eq("id", bus.layout_id).maybeSingle();
      if (error) throw error;
      return data as { layout_json: LayoutJson } | null;
    },
  });
  const occupied = bookings.reduce((count, booking) => count + (booking.seat_numbers?.length ?? 0), 0);
  const accents = ["border-t-primary", "border-t-secondary", "border-t-chart-5"];

  return (
    <section aria-label={`مخطط الحافلة ${bus.bus_number}`} data-bus-board={bus.id}
      className={`min-w-0 rounded-lg border border-t-4 bg-card text-card-foreground p-3 sm:p-4 ${accents[index % accents.length]}`}>
      <header className="space-y-3 border-b pb-3 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 font-extrabold">
              <Bus className="size-5 shrink-0 text-secondary" />
              <span className="break-words">حافلة #{bus.bus_number}{bus.name ? ` — ${bus.name}` : ""}</span>
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{busDateLabel(bus.assigned_date)}</p>
          </div>
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-bold tabular-nums">{occupied} / {bus.capacity}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>السائق: <b className="text-foreground">{bus.driver_name || "—"}</b></span>
          <span>المشرف: <b className="text-foreground">{bus.supervisor_name || "—"}</b></span>
        </div>
        <div className="flex justify-between gap-2 text-xs">
          <span>المشغول: <b>{occupied}</b></span>
          <span className="text-success">المتاح: <b>{Math.max(0, bus.capacity - occupied)}</b></span>
        </div>
      </header>
      {bus.layout_id && isPending ? (
        <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="جارٍ تحميل المخطط" /></div>
      ) : isError ? (
        <div className="py-6 text-center space-y-2">
          <p className="text-sm text-destructive">تعذر تحميل مخطط هذه الحافلة</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>إعادة المحاولة</Button>
        </div>
      ) : (
        <LiveSeatBoard layout={mirrorLayout(layout?.layout_json ?? buildDefaultLayout(bus.layout === "B" ? "B" : "A"))}
          bookings={bookings} shortName={shortName} onSaved={onSaved} />
      )}
    </section>
  );
}