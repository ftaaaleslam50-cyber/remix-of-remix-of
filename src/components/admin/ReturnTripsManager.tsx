// إدارة رحلات العودة — نظام مستقل تمامًا عن رحلات الذهاب.
// القوالب أسبوعية، لكن التشغيل والإدارة يتمّان بالتاريخ الفعلي.
// الحجوزات ترتبط بالرحلة عبر «تاريخ العودة الفعلي» المحسوب مسبقًا في قاعدة البيانات
// (تاريخ العودة + ليالي التمديد)، ولا علاقة للسعة بظهور الحجوزات.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Save,
  Bus as BusIcon,
  AlertTriangle,
  Users,
  Copy,
  Filter,
  X,
  Hotel,
  ClipboardList,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ManualBookingRow } from "@/components/admin/ManualBookingRow";
import { formatTripDate, formatTripTime, addDays } from "@/lib/trip-dates";
import { ReturnSeatBoard } from "@/components/admin/ReturnSeatBoard";
import { CopyOutboundSeatsDialog } from "@/components/admin/CopyOutboundSeatsDialog";

import { ReturnSloganDialog } from "@/components/admin/ReturnSloganDialog";

export interface ReturnTripRow {
  id: string;
  name: string;
  from_city: string;
  to_city: string;
  weekday: number;
  return_date: string | null;
  return_time: string | null;
  active: boolean;
  display_order: number;
  auto_advance: boolean;
  clone_buses_on_advance: boolean;
}

interface ReturnBusRow {
  id: string;
  return_trip_id: string;
  trip_date: string;
  bus_id: string;
}
interface BusRow {
  id: string;
  name: string | null;
  bus_number: number;
  capacity: number;
  direction: string | null;
  status: string;
  layout_id?: string | null;
}

export interface ReturnBookingRow {
  id: string;
  booking_code: string;
  customer_name: string | null;
  passenger_count: number;
  trip_mode: string | null;
  extension_nights: number | null;
  actual_return_date: string | null;
  return_trip_id: string | null;
  return_bus_id: string | null;
  return_seat_numbers: string[] | null;
  contact_phone: string | null;
  status: string;
  trip_id?: string | null;
  booking_source?: string | null;
  rep_name?: string | null;
  bus_id: string | null;
  seat_numbers: string[] | null;
  created_at: string;
  booking_type?: string | null;
  package_id?: string | null;
  no_hotel?: boolean | null;
  male_count?: number | null;
  female_count?: number | null;
  notes?: string | null;
}

// ---------- فلاتر وأدوات تبويب العودة ----------
export interface ReturnFilters {
  search: string;
  hotel: string;
  trip: string;
  outBus: string;
  retBus: string;
  type: string;
  source: string;
  mode: string;
  ext: string;
}
const EMPTY_FILTERS: ReturnFilters = {
  search: "",
  hotel: "",
  trip: "",
  outBus: "",
  retBus: "",
  type: "",
  source: "",
  mode: "",
  ext: "",
};
const MODE_NAMES: Record<string, string> = {
  round: "ذهاب وعودة",
  round_open: "عودة مفتوحة",
  return: "عودة فقط",
  outbound: "ذهاب فقط",
};
function hotelKeyOf(b: ReturnBookingRow): string {
  if (b.no_hotel || !b.package_id) return "__none";
  return b.package_id;
}
function sourceOf(b: ReturnBookingRow): string {
  return (b.rep_name || b.booking_source || "الموقع").trim() || "الموقع";
}
export interface ReturnLookups {
  hotelName: (b: ReturnBookingRow) => string;
  tripName: (id: string) => string;
  busLabel: (id: string) => string;
}
function useReturnLookups(rows: ReturnBookingRow[]): ReturnLookups {
  const pkgs = useQuery({
    queryKey: ["return-lookup-packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("id,name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const tripIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.trip_id).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const busIds = useMemo(
    () => Array.from(new Set(rows.map((r) => r.bus_id).filter(Boolean) as string[])).sort(),
    [rows],
  );
  const trips = useQuery({
    queryKey: ["return-lookup-trips", tripIds],
    enabled: tripIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("id,name").in("id", tripIds);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const bs = useQuery({
    queryKey: ["return-lookup-buses", busIds],
    enabled: busIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buses")
        .select("id,name,bus_number,assigned_date")
        .in("id", busIds);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string | null; bus_number: number; assigned_date: string | null }[];
    },
  });
  return useMemo(() => {
    const pm = new Map((pkgs.data ?? []).map((p) => [p.id, p.name]));
    const tm = new Map((trips.data ?? []).map((t) => [t.id, t.name]));
    const bm = new Map((bs.data ?? []).map((b) => [b.id, b]));
    return {
      hotelName: (b) => (hotelKeyOf(b) === "__none" ? "بدون فندق" : (pm.get(b.package_id!) ?? "فندق غير معروف")),
      tripName: (id) => tm.get(id) ?? "—",
      busLabel: (id) => {
        const b = bm.get(id);
        if (!b) return "—";
        return `${b.name || `حافلة ${b.bus_number}`}${b.assigned_date ? ` (${formatTripDate(b.assigned_date)})` : ""}`;
      },
    };
  }, [pkgs.data, trips.data, bs.data]);
}
function applyReturnFilters(rows: ReturnBookingRow[], f: ReturnFilters, lk: ReturnLookups): ReturnBookingRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((b) => {
    if (f.hotel && hotelKeyOf(b) !== f.hotel) return false;
    if (f.trip && (b.trip_id ?? "__none") !== f.trip) return false;
    if (f.outBus && (b.bus_id ?? "__none") !== f.outBus) return false;
    if (f.retBus) {
      const assigned = b.return_bus_id && (b.return_seat_numbers?.length ?? 0) > 0;
      if (f.retBus === "__none" ? assigned : b.return_bus_id !== f.retBus) return false;
    }
    if (f.type && (b.booking_type === "family" ? "family" : "individual") !== f.type) return false;
    if (f.source && sourceOf(b) !== f.source) return false;
    if (f.mode && (b.trip_mode ?? "round") !== f.mode) return false;
    if (f.ext === "yes" && !((b.extension_nights ?? 0) > 0)) return false;
    if (f.ext === "no" && (b.extension_nights ?? 0) > 0) return false;
    if (q) {
      const hay = `${b.customer_name ?? ""} ${b.booking_code} ${lk.hotelName(b)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
      <SelectTrigger className={`h-9 ${value ? "border-primary" : ""}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{label}: الكل</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** كشف استلام الركاب من الفنادق لكل حافلة عودة — نسخ نصي للسائق. */
function PickupSheetButton({
  bookings,
  buses,
  lookups,
  date,
}: {
  bookings: ReturnBookingRow[];
  buses: BusRow[];
  lookups: ReturnLookups;
  date: string;
}) {
  async function copy() {
    const lines: string[] = [`كشف استلام العودة — ${formatTripDate(date)}`];
    for (const bus of buses) {
      const riders = bookings.filter((b) => b.return_bus_id === bus.id && (b.return_seat_numbers?.length ?? 0) > 0);
      if (riders.length === 0) continue;
      const total = riders.reduce((s, b) => s + (b.passenger_count || 1), 0);
      lines.push("", `🚌 ${bus.name || `حافلة ${bus.bus_number}`} — ${total} راكب`);
      const byHotel = new Map<string, ReturnBookingRow[]>();
      for (const r of riders) {
        const h = lookups.hotelName(r);
        byHotel.set(h, [...(byHotel.get(h) ?? []), r]);
      }
      let stop = 1;
      for (const [h, rs] of Array.from(byHotel.entries()).sort((a, b) => a[0].localeCompare(b[0], "ar"))) {
        const n = rs.reduce((s, b) => s + (b.passenger_count || 1), 0);
        lines.push(`المحطة ${stop++}: ${h} (${n})`);
        for (const r of rs)
          lines.push(`  - ${r.customer_name || r.booking_code} \\ ${r.passenger_count} \\ مقاعد ${(r.return_seat_numbers ?? []).join("، ")}`);
      }
    }
    if (lines.length === 1) return toast.error("لا يوجد ركاب موزعون على حافلات العودة بعد");
    await navigator.clipboard.writeText(lines.join("\n"));
    toast.success("تم نسخ كشف الاستلام");
  }
  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={copy}>
      <ClipboardList className="h-4 w-4 ml-1" /> كشف استلام الفنادق
    </Button>
  );
}

export function todayIso(): string {
  const now = new Date(Date.now() + 3 * 3600_000); // Riyadh
  return now.toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

const modeLabel = (m?: string | null, ext?: number | null) =>
  (ext ?? 0) > 0 ? "تمديد" : m === "return" ? "عودة فقط" : m === "outbound" ? "ذهاب فقط" : "ذهاب وعودة";

/** شريط اختيار التاريخ — التاريخ الفعلي هو أساس التنقل، لا الأسابيع. */
export function ReturnDateBar({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  return (
    <div className="surface-card p-4 flex flex-wrap items-center justify-center gap-3">
      <Button variant="outline" size="sm" className="rounded-full" onClick={() => onChange(addDays(date, -1))}>
        <ChevronRight className="h-4 w-4 ml-1" /> السابق
      </Button>
      <div className="text-center">
        <div className="text-base font-extrabold text-[color:var(--color-navy)]">{formatTripDate(date)}</div>
        <Input
          type="date"
          className="h-9 w-44 mt-1"
          value={date}
          onChange={(e) => e.target.value && onChange(e.target.value)}
        />
      </div>
      <Button variant="outline" size="sm" className="rounded-full" onClick={() => onChange(addDays(date, 1))}>
        التالي <ChevronLeft className="h-4 w-4 mr-1" />
      </Button>
      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => onChange(todayIso())}>
        اليوم
      </Button>
    </div>
  );
}

export function useReturnData(date: string) {
  const templates = useQuery({
    queryKey: ["return-trips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_trips" as never)
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data as unknown as ReturnTripRow[]) ?? [];
    },
  });

  const buses = useQuery({
    queryKey: ["return-fleet"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buses")
        .select("id,name,bus_number,capacity,direction,status,layout_id")
        .order("bus_number");
      if (error) throw error;
      return (data as unknown as BusRow[]) ?? [];
    },
  });

  const assignedBuses = useQuery({
    queryKey: ["return-trip-buses", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("return_trip_buses" as never)
        .select("*")
        .eq("trip_date", date);
      if (error) throw error;
      return (data as unknown as ReturnBusRow[]) ?? [];
    },
  });

  const bookings = useQuery({
    queryKey: ["return-bookings", date],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id,booking_code,customer_name,passenger_count,trip_mode,extension_nights,actual_return_date,return_trip_id,return_bus_id,return_seat_numbers,contact_phone,status,trip_id,booking_source,rep_name,bus_id,seat_numbers,created_at,booking_type,package_id,no_hotel,male_count,female_count,notes",
        )
        .eq("actual_return_date", date)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .order("created_at");
      if (error) throw error;
      return (data as unknown as ReturnBookingRow[]) ?? [];
    },
  });

  return { templates, buses, assignedBuses, bookings };
}

/** إدارة رحلات العودة — قائمة رحلات مثل الذهاب: لكل رحلة تاريخ فعلي وحافلات عودة تُختار منها. */
export function ReturnTripsManager({ ownerId: _ownerId }: { ownerId?: string }) {
  const qc = useQueryClient();

  const templates = useQuery({
    queryKey: ["return-trips"],
    refetchInterval: 60_000,
    queryFn: async () => {
      // تدوير رحلات العودة المنتهية إلى الأسبوع التالي (مثل رحلات الذهاب تمامًا)
      await supabase.rpc("advance_due_return_trips" as never);
      const { data, error } = await supabase
        .from("return_trips" as never)
        .select("*")
        .order("display_order");
      if (error) throw error;
      return (data as unknown as ReturnTripRow[]) ?? [];
    },
  });

  const buses = useQuery({
    queryKey: ["return-fleet-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("buses")
        .select("id,name,bus_number,capacity,direction,status,layout_id")
        .order("bus_number");
      if (error) throw error;
      return ((data as unknown as BusRow[]) ?? []).filter((b) => (b.direction ?? "outbound") === "return");
    },
  });

  const links = useQuery({
    queryKey: ["return-trip-buses-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("return_trip_buses" as never).select("*");
      if (error) throw error;
      return (data as unknown as ReturnBusRow[]) ?? [];
    },
  });

  const occupancy = useQuery({
    queryKey: ["return-occupancy"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("return_bus_id,return_seat_numbers")
        .not("return_bus_id", "is", null)
        .is("deleted_at", null)
        .neq("status", "cancelled");
      const map: Record<string, number> = {};
      for (const b of (data ?? []) as { return_bus_id: string; return_seat_numbers: string[] | null }[]) {
        map[b.return_bus_id] = (map[b.return_bus_id] ?? 0) + (b.return_seat_numbers?.length ?? 0);
      }
      return map;
    },
  });

  async function addReturnTrip() {
    const name = prompt("اسم رحلة العودة:");
    if (!name) return;
    const { error } = await supabase.from("return_trips" as never).insert({
      name,
      from_city: "مكة",
      to_city: "",
      weekday: new Date().getDay(),
      return_date: todayIso(),
      active: true,
      display_order: (templates.data ?? []).length,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة رحلة العودة");
    qc.invalidateQueries({ queryKey: ["return-trips"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="rounded-full" onClick={addReturnTrip}>
          <Plus className="h-4 w-4 ml-1" /> إضافة رحلة عودة
        </Button>
      </div>

      {(templates.data ?? []).length === 0 && (
        <div className="surface-card p-10 text-center text-muted-foreground space-y-2">
          <CalendarDays className="h-10 w-10 mx-auto opacity-40" />
          <div>لا توجد رحلات عودة بعد.</div>
        </div>
      )}

      {(templates.data ?? []).map((t) => (
        <ReturnTripEditor
          key={t.id}
          trip={t}
          buses={buses.data ?? []}
          assigned={
            new Set(
              (links.data ?? [])
                .filter((l) => l.return_trip_id === t.id && l.trip_date === (t.return_date ?? ""))
                .map((l) => l.bus_id),
            )
          }
          occupancy={occupancy.data ?? {}}
        />
      ))}
    </div>
  );
}

/** بطاقة تحرير رحلة عودة واحدة — مطابقة في الأسلوب لبطاقة رحلة الذهاب. */
function ReturnTripEditor({
  trip,
  buses,
  assigned,
  occupancy,
}: {
  trip: ReturnTripRow;
  buses: BusRow[];
  assigned: Set<string>;
  occupancy: Record<string, number>;
}) {
  const qc = useQueryClient();
  const [local, setLocal] = useState(trip);
  useEffect(() => setLocal(trip), [trip]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["return-trips"] });
    qc.invalidateQueries({ queryKey: ["return-trip-buses-all"] });
  }

  async function save() {
    const date = local.return_date || null;
    const { error } = await supabase
      .from("return_trips" as never)
      .update({
        name: local.name,
        from_city: local.from_city,
        to_city: local.to_city,
        return_date: date,
        weekday: date ? weekdayOf(date) : local.weekday,
        return_time: local.return_time || null,
        active: local.active,
        display_order: local.display_order,
        auto_advance: !!local.auto_advance,
        clone_buses_on_advance: !!local.clone_buses_on_advance,
      } as never)
      .eq("id", trip.id);
    if (error) return toast.error(error.message);
    // نقل ارتباطات الحافلات إلى التاريخ الجديد عند تغييره
    if (date && trip.return_date && date !== trip.return_date) {
      await supabase
        .from("return_trip_buses" as never)
        .update({ trip_date: date } as never)
        .eq("return_trip_id", trip.id)
        .eq("trip_date", trip.return_date);
    }
    toast.success("تم الحفظ");
    refresh();
  }

  async function del() {
    if (!confirm("حذف رحلة العودة؟ (لن يتم حذف أي حجز)")) return;
    const { error } = await supabase
      .from("return_trips" as never)
      .delete()
      .eq("id", trip.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function toggleBus(busId: string, add: boolean) {
    const date = trip.return_date;
    if (!date) return toast.error("حدّد تاريخ رحلة العودة أولًا ثم احفظ.");
    if (add) {
      const { error } = await supabase
        .from("return_trip_buses" as never)
        .insert({ return_trip_id: trip.id, trip_date: date, bus_id: busId } as never);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("return_trip_buses" as never)
        .delete()
        .eq("return_trip_id", trip.id)
        .eq("trip_date", date)
        .eq("bus_id", busId);
      if (error) return toast.error(error.message);
    }
    refresh();
  }

  return (
    <div className="surface-card p-5 space-y-4">
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="text-base font-extrabold">{trip.name}</div>
        {trip.return_date ? (
          <>
            <div className="text-sm font-bold text-[color:var(--color-navy)]">
              {formatTripDate(trip.return_date)}
              {trip.return_time ? ` — ${formatTripTime(trip.return_time)}` : ""}
            </div>
            <div className="text-xs text-muted-foreground">
              {trip.from_city} ← {trip.to_city}
            </div>
          </>
        ) : (
          <div className="text-xs text-destructive">لم يتم تحديد تاريخ فعلي لرحلة العودة بعد.</div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2">
          <Label className="text-xs">اسم رحلة العودة</Label>
          <Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">تاريخ العودة الفعلي</Label>
          <Input
            type="date"
            value={local.return_date ?? ""}
            onChange={(e) => setLocal({ ...local, return_date: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">وقت العودة</Label>
          <Input
            type="time"
            value={local.return_time ?? ""}
            onChange={(e) => setLocal({ ...local, return_time: e.target.value })}
          />
        </div>
        <div>
          <Label className="text-xs">من</Label>
          <Input value={local.from_city} onChange={(e) => setLocal({ ...local, from_city: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">إلى</Label>
          <Input value={local.to_city} onChange={(e) => setLocal({ ...local, to_city: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">الترتيب</Label>
          <Input
            type="number"
            value={local.display_order}
            onChange={(e) => setLocal({ ...local, display_order: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={!!local.auto_advance} onCheckedChange={(v) => setLocal({ ...local, auto_advance: v })} />
            <span className="text-xs">تقدّم تلقائي أسبوعي</span>
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold text-[color:var(--color-navy)]">
              {local.return_time ? `عند ${formatTripTime(local.return_time)}` : "بدون وقت عودة"}
            </span>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!local.clone_buses_on_advance}
              onCheckedChange={(v) => setLocal({ ...local, clone_buses_on_advance: v })}
            />
            <span className="text-xs">إنشاء حافلة جديدة مع الرحلة الجديدة</span>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2">
            <Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} />
            <span className="text-xs">مفعّلة</span>
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-bold flex items-center gap-2 mb-2">
          <BusIcon className="h-4 w-4" /> حافلات العودة المتاحة والإشغال
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {buses.length === 0 && (
            <div className="text-xs text-muted-foreground">
              لا توجد حافلات عودة في الأسطول — أضف حافلة باتجاه «عودة».
            </div>
          )}
          {buses.map((b) => {
            const used = occupancy[b.id] ?? 0;
            const pct = b.capacity > 0 ? Math.round((used / b.capacity) * 100) : 0;
            const on = assigned.has(b.id);
            return (
              <div
                key={b.id}
                className={`flex items-center justify-between border rounded-xl p-3 ${on ? "border-primary bg-primary/5" : ""}`}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={on} onCheckedChange={(v) => toggleBus(b.id, !!v)} />
                  <div>
                    <div className="text-sm font-bold">{b.name || `حافلة ${b.bus_number}`}</div>
                    <div className="text-[11px] text-muted-foreground">{b.status}</div>
                  </div>
                </label>
                <div className="text-left">
                  <div className={`text-sm font-bold ${used >= b.capacity ? "text-destructive" : ""}`}>
                    {used}/{b.capacity}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{pct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={del} className="rounded-full">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button size="sm" onClick={save} className="rounded-full">
          <Save className="h-4 w-4 ml-1" /> حفظ
        </Button>
      </div>
    </div>
  );
}

export function ReturnTripCard({
  template,
  date,
  buses,
  assigned,
  bookings,
  allBookings,
  lookups,
  ownerId,
}: {
  template: ReturnTripRow;
  date: string;
  buses: BusRow[];
  assigned: ReturnBusRow[];
  bookings: ReturnBookingRow[];
  allBookings?: ReturnBookingRow[];
  lookups?: ReturnLookups;
  ownerId?: string;
}) {
  const qc = useQueryClient();
  const [addingBus, setAddingBus] = useState(false);
  const [newBooking, setNewBooking] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [groupByHotel, setGroupByHotel] = useState(true);
  const [bulkOut, setBulkOut] = useState("");
  const all = allBookings ?? bookings;

  const assignedBusIds = assigned.map((a) => a.bus_id);
  const tripBuses = buses.filter((b) => assignedBusIds.includes(b.id));
  const returnFleet = buses.filter((b) => (b.direction ?? "outbound") === "return" && !assignedBusIds.includes(b.id));

  const distributed = bookings.filter((b) => b.return_bus_id && (b.return_seat_numbers?.length ?? 0) > 0);
  const undistributed = bookings.filter((b) => !b.return_bus_id || (b.return_seat_numbers?.length ?? 0) === 0);
  const pax = (b: ReturnBookingRow) => b.passenger_count || 1;
  const totalPax = bookings.reduce((s, b) => s + pax(b), 0);
  const donePax = distributed.reduce((s, b) => s + (b.return_seat_numbers?.length ?? 0), 0);

  // المقاعد المحجوزة تُحسب دائمًا من كل حجوزات التاريخ (لا من نتيجة الفلتر)
  const seatsOnBus = (busId: string) =>
    all.filter((b) => b.return_bus_id === busId).flatMap((b) => b.return_seat_numbers ?? []);

  const outBusIds = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.bus_id).filter(Boolean) as string[])),
    [bookings],
  );

  const groups = useMemo(() => {
    const isPending = (b: ReturnBookingRow) => !b.return_bus_id || (b.return_seat_numbers?.length ?? 0) === 0;
    if (!groupByHotel) {
      return [
        {
          key: "__all",
          name: "",
          items: bookings,
          pax: totalPax,
          pending: bookings.filter(isPending).reduce((s, b) => s + pax(b), 0),
        },
      ];
    }
    const m = new Map<string, { key: string; name: string; items: ReturnBookingRow[]; pax: number; pending: number }>();
    for (const b of bookings) {
      const key = hotelKeyOf(b);
      const g = m.get(key) ?? { key, name: lookups?.hotelName(b) ?? key, items: [], pax: 0, pending: 0 };
      g.items.push(b);
      g.pax += pax(b);
      if (isPending(b)) g.pending += pax(b);
      m.set(key, g);
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, "ar"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, groupByHotel, lookups, totalPax]);

  /** تسكين مجموعة حجوزات غير موزعة في حافلة واحدة بأول المقاعد المتاحة. */
  async function bulkAssign(items: ReturnBookingRow[], busId: string) {
    const bus = tripBuses.find((b) => b.id === busId);
    if (!bus) return;
    const pending = items.filter((b) => !b.return_bus_id || (b.return_seat_numbers?.length ?? 0) === 0);
    if (pending.length === 0) return toast.info("لا يوجد ركاب غير موزعين في هذه المجموعة");
    const taken = new Set(seatsOnBus(busId));
    const free = Array.from({ length: bus.capacity }, (_, i) => String(i + 1)).filter((s) => !taken.has(s));
    const need = pending.reduce((s, b) => s + pax(b), 0);
    if (need > free.length) {
      if (!confirm(`المقاعد المتاحة ${free.length} والمطلوب ${need}. سيتم تسكين من تتسع لهم الحافلة فقط. متابعة؟`))
        return;
    }
    let done = 0;
    for (const b of pending) {
      const n = pax(b);
      if (free.length < n) break;
      const seats = free.splice(0, n);
      const { error } = await supabase
        .from("bookings")
        .update({ return_trip_id: template.id, return_bus_id: busId, return_seat_numbers: seats } as never)
        .eq("id", b.id);
      if (error) {
        toast.error(error.message);
        break;
      }
      done += n;
    }
    toast.success(`تم تسكين ${done} راكب في ${bus.name || `حافلة ${bus.bus_number}`}`);
    refresh();
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["return-bookings", date] });
    qc.invalidateQueries({ queryKey: ["return-trip-buses", date] });
  }

  async function addBus(busId: string) {
    const { error } = await supabase.from("return_trip_buses" as never).insert({
      return_trip_id: template.id,
      trip_date: date,
      bus_id: busId,
    } as never);
    if (error) return toast.error(error.message);
    setAddingBus(false);
    refresh();
  }

  async function removeBus(busId: string) {
    const riders = bookings.filter((b) => b.return_bus_id === busId);
    const count = riders.reduce((s, b) => s + (b.return_seat_numbers?.length ?? 0), 0);
    const bus = buses.find((b) => b.id === busId);
    const label = bus?.name || `حافلة ${bus?.bus_number}`;
    if (
      count > 0 &&
      !confirm(
        `⚠️ تنبيه\n\n${label} مرتبطة برحلة عودة بتاريخ ${formatTripDate(date)} وبها ${count} راكبًا.\n\nسيتم إلغاء تخصيص هؤلاء الركاب (يبقون ضمن الحجوزات المرتبطة كـ«غير موزعين») ولن يُحذف أي حجز.\n\nهل تريد المتابعة؟`,
      )
    )
      return;
    if (count === 0 && !confirm(`إزالة ${label} من رحلة العودة بتاريخ ${formatTripDate(date)}؟`)) return;

    if (count > 0) {
      const { error } = await supabase
        .from("bookings")
        .update({ return_bus_id: null, return_seat_numbers: [] } as never)
        .in(
          "id",
          riders.map((r) => r.id),
        );
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase
      .from("return_trip_buses" as never)
      .delete()
      .eq("return_trip_id", template.id)
      .eq("trip_date", date)
      .eq("bus_id", busId);
    if (error) return toast.error(error.message);
    toast.success("تمت إزالة الحافلة من الرحلة");
    refresh();
  }

  async function assign(b: ReturnBookingRow, busId: string | null, seats: string[]) {
    const { error } = await supabase
      .from("bookings")
      .update({
        return_trip_id: busId ? template.id : null,
        return_bus_id: busId,
        return_seat_numbers: seats,
      } as never)
      .eq("id", b.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  }

  return (
    <div className="surface-card p-5 space-y-5">
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="text-base font-extrabold">عودة {formatTripDate(date)}</div>
        <div className="text-sm font-bold text-[color:var(--color-navy)]">
          {template.from_city} ← {template.to_city}
        </div>
        {template.return_time && (
          <div className="text-xs text-muted-foreground">{formatTripTime(template.return_time)}</div>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">
            الحجوزات المرتبطة: {bookings.length} ({totalPax} راكب)
          </Badge>
          <Badge className="bg-success text-white">تم توزيعهم: {donePax}</Badge>
          <Badge className="bg-warning text-white">غير موزعين: {Math.max(totalPax - donePax, 0)}</Badge>
        </div>
      </div>

      {/* الحافلات المخصصة يدويًا لهذا التاريخ */}
      <div>
        <div className="text-sm font-bold flex items-center gap-2 mb-2">
          <BusIcon className="h-4 w-4" /> حافلات العودة
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {tripBuses.length === 0 && (
            <div className="text-xs text-muted-foreground">
              لا توجد حافلات مضافة لهذه العودة بعد — الحجوزات تظهر كاملة رغم ذلك.
            </div>
          )}
          {tripBuses.map((b) => {
            const used = seatsOnBus(b.id).length;
            return (
              <div key={b.id} className="flex items-center justify-between border rounded-xl p-3">
                <div>
                  <div className="text-sm font-bold">{b.name || `حافلة ${b.bus_number}`}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {used} / {b.capacity}
                  </div>
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => removeBus(b.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <Button size="sm" variant="outline" className="rounded-full mt-3" onClick={() => setAddingBus(true)}>
          <Plus className="h-4 w-4 ml-1" /> إضافة حافلة
        </Button>
      </div>

      {/* الحجوزات المرتبطة */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4" /> الحجوزات المرتبطة بالعودة
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCopyOpen(true)}>
              <Copy className="h-4 w-4 ml-1" /> نسخ مقاعد الذهاب
            </Button>
            <Button size="sm" className="rounded-full" onClick={() => setNewBooking(true)}>
              <Plus className="h-4 w-4 ml-1" /> إضافة حجز عودة
            </Button>
          </div>
        </div>

        {newBooking && (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full">
              <tbody>
                <ManualBookingRow
                  colSpan={1}
                  ownerId={ownerId}
                  initial={{ trip_mode: "return" }}
                  extraPayload={{
                    return_date: date,
                    return_trip_id: template.id,
                  }}
                  onClose={() => setNewBooking(false)}
                  onSaved={() => {
                    setNewBooking(false);
                    refresh();
                  }}
                />
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 mb-2 text-xs">
          <Switch checked={groupByHotel} onCheckedChange={setGroupByHotel} id={`gh-${template.id}`} />
          <Label htmlFor={`gh-${template.id}`} className="text-xs">
            تجميع حسب الفندق مع التسكين الجماعي
          </Label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="p-2 text-right">الراكب</th>
                <th className="p-2 text-right">الفندق</th>
                <th className="p-2 text-right">النوع والتركيب</th>
                <th className="p-2 text-right">حافلة ومقاعد الذهاب</th>
                <th className="p-2 text-right">رحلة الذهاب والمصدر</th>
                <th className="p-2 text-right">نوع الرحلة والعودة الفعلية</th>
                <th className="p-2 text-right">ملاحظات</th>
                <th className="p-2 text-right">حافلة العودة</th>
                <th className="p-2 text-right">المقاعد</th>
                <th className="p-2 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    لا توجد حجوزات مطابقة.
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <Fragment key={g.key}>
                  {groupByHotel && (
                    <tr className="bg-muted/60">
                      <td colSpan={10} className="p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-sm">
                            🏨 {g.name} ({g.pax} راكب
                            {g.pending > 0 ? ` • ${g.pending} غير موزع` : " • تم التوزيع"})
                          </span>
                          {g.pending > 0 && tripBuses.length > 0 && (
                            <Select onValueChange={(v) => bulkAssign(g.items, v)}>
                              <SelectTrigger className="h-8 w-48 ms-auto">
                                <SelectValue placeholder="تسكين الكل في حافلة…" />
                              </SelectTrigger>
                              <SelectContent>
                                {tripBuses.map((b) => (
                                  <SelectItem key={b.id} value={b.id}>
                                    {b.name || `حافلة ${b.bus_number}`} ({b.capacity - seatsOnBus(b.id).length} متاح)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {g.items.map((b) => (
                    <BookingAssignRow
                      key={b.id}
                      booking={b}
                      buses={tripBuses}
                      lookups={lookups}
                      takenSeats={(busId) =>
                        seatsOnBus(busId).filter((s) => !(b.return_seat_numbers ?? []).includes(s))
                      }
                      onAssign={(busId, seats) => assign(b, busId, seats)}
                    />
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {tripBuses.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold">تسكين جماعي حسب حافلة الذهاب:</span>
            <Select value={bulkOut} onValueChange={setBulkOut}>
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="حافلة الذهاب" />
              </SelectTrigger>
              <SelectContent>
                {outBusIds.map((id) => (
                  <SelectItem key={id} value={id}>
                    {lookups?.busLabel(id) ?? id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>←</span>
            <Select
              value=""
              onValueChange={(v) => {
                if (!bulkOut) return toast.error("اختر حافلة الذهاب أولًا");
                bulkAssign(
                  bookings.filter((b) => b.bus_id === bulkOut),
                  v,
                );
              }}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="حافلة العودة" />
              </SelectTrigger>
              <SelectContent>
                {tripBuses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name || `حافلة ${b.bus_number}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* لوحة التوزيع بالسحب والإفلات على مخطط حافلات العودة */}
      <div className={`rounded-xl border p-4 ${undistributed.length > 0 ? "border-warning/50 bg-warning/5" : ""}`}>
        <div className="text-sm font-bold flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4" /> توزيع الركاب على حافلات العودة
          {undistributed.length > 0 && (
            <Badge className="bg-warning text-white">غير موزعين: {undistributed.reduce((s, b) => s + pax(b), 0)}</Badge>
          )}
        </div>
        <ReturnSeatBoard buses={tripBuses} bookings={all} onAssign={assign} />
      </div>

      <Dialog open={addingBus} onOpenChange={setAddingBus}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة حافلة عودة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {returnFleet.length === 0 && (
              <p className="text-sm text-muted-foreground">
                لا توجد حافلات مصنّفة «عودة» متاحة. صنّف الحافلة كـ«عودة» من صفحة الأسطول أولًا.
              </p>
            )}
            {returnFleet.map((b) => (
              <Button
                key={b.id}
                variant="outline"
                className="w-full justify-between rounded-xl"
                onClick={() => addBus(b.id)}
              >
                <span>{b.name || `حافلة ${b.bus_number}`}</span>
                <span className="text-xs text-muted-foreground">{b.capacity} مقعد</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <CopyOutboundSeatsDialog
        open={copyOpen}
        onOpenChange={setCopyOpen}
        bookings={bookings}
        tripBuses={tripBuses}
        allBuses={buses}
        templateId={template.id}
        onDone={refresh}
      />
    </div>
  );
}

function BookingAssignRow({
  booking,
  buses,
  takenSeats,
  onAssign,
  lookups,
}: {
  booking: ReturnBookingRow;
  buses: BusRow[];
  takenSeats: (busId: string) => string[];
  onAssign: (busId: string | null, seats: string[]) => void;
  lookups?: ReturnLookups;
}) {
  const busId = booking.return_bus_id ?? "";
  const seats = booking.return_seat_numbers ?? [];
  const bus = buses.find((b) => b.id === busId);
  const distributed = !!busId && seats.length > 0;

  const freeSeats = useMemo(() => {
    if (!bus) return [] as string[];
    const taken = new Set(takenSeats(bus.id));
    return Array.from({ length: bus.capacity }, (_, i) => String(i + 1)).filter((s) => !taken.has(s));
  }, [bus, takenSeats]);

  function toggleSeat(s: string) {
    const next = seats.includes(s) ? seats.filter((x) => x !== s) : [...seats, s];
    onAssign(busId || null, next);
  }

  const isFamily = booking.booking_type === "family";
  const m = booking.male_count ?? 0;
  const fe = booking.female_count ?? 0;

  return (
    <tr className="border-b align-top">
      <td className="p-2 font-bold">
        {booking.customer_name || booking.booking_code}
        <div className="text-[11px] font-normal text-muted-foreground">
          {booking.booking_code} • {booking.passenger_count} راكب
        </div>
      </td>
      <td className="p-2 text-xs font-bold whitespace-nowrap">{lookups?.hotelName(booking) ?? "—"}</td>
      <td className="p-2 text-xs whitespace-nowrap">
        <Badge variant={isFamily ? "default" : "secondary"}>{isFamily ? "عائلة" : "أفراد"}</Badge>
        {(m > 0 || fe > 0) && (
          <div className="text-[11px] text-muted-foreground mt-1">
            {m > 0 ? `ذكور ${m}` : ""}
            {m > 0 && fe > 0 ? " • " : ""}
            {fe > 0 ? `إناث ${fe}` : ""}
          </div>
        )}
      </td>
      <td className="p-2 text-xs whitespace-nowrap">
        {booking.bus_id ? lookups?.busLabel(booking.bus_id) : "—"}
        {(booking.seat_numbers?.length ?? 0) > 0 && (
          <div className="text-[11px] text-muted-foreground">مقاعد {booking.seat_numbers!.join("، ")}</div>
        )}
      </td>
      <td className="p-2 text-xs whitespace-nowrap">
        {booking.trip_id ? lookups?.tripName(booking.trip_id) : "—"}
        <div className="text-[11px] text-muted-foreground">{sourceOf(booking)}</div>
      </td>
      <td className="p-2 text-xs whitespace-nowrap">
        {modeLabel(booking.trip_mode, booking.extension_nights)}
        <div className="text-[11px] text-muted-foreground">
          {formatTripDate(booking.actual_return_date)}
          {(booking.extension_nights ?? 0) > 0 ? ` • تمديد ${booking.extension_nights}` : ""}
        </div>
      </td>
      <td className="p-2 text-[11px] max-w-[160px] text-muted-foreground">{booking.notes || "—"}</td>
      <td className="p-2">
        <Select
          value={busId || "__none"}
          onValueChange={(v) => onAssign(v === "__none" ? null : v, v === busId ? seats : [])}
        >
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— بدون —</SelectItem>
            {buses.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name || `حافلة ${b.bus_number}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        {!bus ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-wrap gap-1 max-w-[280px]">
            {freeSeats.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSeat(s)}
                className={`h-7 min-w-7 px-1 rounded-md border text-[11px] font-bold ${seats.includes(s) ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </td>
      <td className="p-2">
        {distributed ? (
          <Badge className="bg-success text-white">موزع</Badge>
        ) : (
          <Badge className="bg-warning text-white">غير موزع</Badge>
        )}
      </td>
    </tr>
  );
}

/** كل تواريخ العودة الموجودة فعليًا في الحجوزات مع عدد الركاب. */
function useReturnDateIndex() {
  return useQuery({
    queryKey: ["return-date-index"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("actual_return_date,passenger_count,return_bus_id,return_seat_numbers")
        .is("deleted_at", null)
        .neq("status", "cancelled");
      if (error) throw error;
      const map: Record<string, { pax: number; done: number; count: number }> = {};
      let unscheduled = 0;
      for (const b of (data ?? []) as {
        actual_return_date: string | null;
        passenger_count: number;
        return_bus_id: string | null;
        return_seat_numbers: string[] | null;
      }[]) {
        if (!b.actual_return_date) {
          unscheduled += b.passenger_count || 1;
          continue;
        }
        const e = (map[b.actual_return_date] ??= { pax: 0, done: 0, count: 0 });
        e.pax += b.passenger_count || 1;
        e.count += 1;
        if (b.return_bus_id) e.done += b.return_seat_numbers?.length ?? 0;
      }
      return { map, unscheduled };
    },
  });
}

/** تبويب «العودة» داخل إدارة الحجوزات — اختيار تاريخ العودة وعرض ركابها وتوزيعهم. */
export function ReturnBookingsTab({ ownerId }: { ownerId?: string }) {
  const [date, setDate] = useState(todayIso());
  const [autoPicked, setAutoPicked] = useState(false);
  const { templates, buses, assignedBuses, bookings } = useReturnData(date);
  const index = useReturnDateIndex();

  const allTrips = useMemo(
    () =>
      (templates.data ?? [])
        .filter((t) => t.active)
        .slice()
        .sort((a, b) => (a.return_date ?? "").localeCompare(b.return_date ?? "")),
    [templates.data],
  );

  // تواريخ العودة المستخرجة من الحجوزات فعليًا (حتى لو لم تُنشأ لها رحلة عودة)
  const dateList = useMemo(() => {
    const today = todayIso();
    const keys = new Set<string>(Object.keys(index.data?.map ?? {}));
    for (const t of allTrips) if (t.return_date) keys.add(t.return_date);
    return Array.from(keys)
      .sort()
      .filter((d) => d >= addDays(today, -30));
  }, [index.data, allTrips]);

  // أول تاريخ عودة قادم يُختار تلقائيًا بدل «اليوم» الفارغ
  useEffect(() => {
    if (autoPicked || dateList.length === 0) return;
    const today = todayIso();
    const next = dateList.find((d) => d >= today) ?? dateList[dateList.length - 1];
    if (next) setDate(next);
    setAutoPicked(true);
  }, [dateList, autoPicked]);

  const dayTrips = useMemo(
    () => allTrips.filter((t) => (t.return_date ? t.return_date === date : t.weekday === weekdayOf(date))),
    [allTrips, date],
  );

  const allRows = bookings.data ?? [];
  const lookups = useReturnLookups(allRows);
  const [f, setF] = useState<ReturnFilters>(EMPTY_FILTERS);
  const rows = useMemo(() => applyReturnFilters(allRows, f, lookups), [allRows, f, lookups]);
  const filterActive = Object.values(f).some(Boolean);

  // ملخص الفنادق (على كل حجوزات التاريخ)
  const hotelSummary = useMemo(() => {
    const m = new Map<string, { key: string; name: string; pax: number; done: number }>();
    for (const b of allRows) {
      const key = hotelKeyOf(b);
      const e = m.get(key) ?? { key, name: lookups.hotelName(b), pax: 0, done: 0 };
      e.pax += b.passenger_count || 1;
      if (b.return_bus_id) e.done += b.return_seat_numbers?.length ?? 0;
      m.set(key, e);
    }
    return Array.from(m.values()).sort((a, b) => b.pax - a.pax);
  }, [allRows, lookups]);

  // حافلات رحلات العودة المرتبطة بهذا التاريخ (مصدر قائمة الحافلات في شعار الرحلة)
  const dateBuses = useMemo(() => {
    const ids = new Set((assignedBuses.data ?? []).map((a) => a.bus_id));
    return (buses.data ?? []).filter((b) => ids.has(b.id));
  }, [assignedBuses.data, buses.data]);
  const totalPax = rows.reduce((s, b) => s + (b.passenger_count || 1), 0);
  const donePax = rows.reduce((s, b) => s + (b.return_bus_id ? (b.return_seat_numbers?.length ?? 0) : 0), 0);
  const tripFor = (d: string) => allTrips.find((t) => t.return_date === d);

  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
  const hotelOpts = hotelSummary.map((h) => ({ v: h.key, l: h.name }));
  const tripOpts = uniq(allRows.map((b) => b.trip_id ?? "__none")).map((v) => ({
    v,
    l: v === "__none" ? "بدون رحلة ذهاب" : lookups.tripName(v),
  }));
  const outBusOpts = uniq(allRows.map((b) => b.bus_id ?? "__none")).map((v) => ({
    v,
    l: v === "__none" ? "بدون حافلة ذهاب" : lookups.busLabel(v),
  }));
  const retBusOpts = [
    { v: "__none", l: "غير موزع على حافلة" },
    ...dateBuses.map((b) => ({ v: b.id, l: b.name || `حافلة ${b.bus_number}` })),
  ];
  const sourceOpts = uniq(allRows.map((b) => sourceOf(b))).map((v) => ({ v, l: v }));
  const modeOpts = uniq(allRows.map((b) => b.trip_mode ?? "round")).map((v) => ({ v, l: MODE_NAMES[v] ?? v }));

  return (
    <div className="space-y-4">
      {/* شريط تواريخ العودة الحقيقية مع عدّاداتها */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm font-bold flex items-center gap-2">
            <CalendarDays className="h-4 w-4" /> تواريخ العودة
          </div>
          <div className="flex gap-2 text-xs">
            <Badge variant="secondary">إجمالي التواريخ: {dateList.length}</Badge>
            {(index.data?.unscheduled ?? 0) > 0 && (
              <Badge className="bg-warning text-white">بلا تاريخ عودة: {index.data?.unscheduled}</Badge>
            )}
          </div>
        </div>

        {index.isLoading ? (
          <div className="text-xs text-muted-foreground">جارٍ التحميل…</div>
        ) : dateList.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            لا توجد تواريخ عودة — أضف تاريخ عودة للرحلات أو أنشئ رحلة عودة.
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dateList.map((d) => {
              const s = index.data?.map[d];
              const on = d === date;
              const t = tripFor(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDate(d)}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-right transition ${on ? "border-primary bg-primary/10" : "hover:bg-muted"}`}
                >
                  <div className="text-xs font-extrabold text-[color:var(--color-navy)]">{formatTripDate(d)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {t ? t.name : "بدون رحلة عودة"} • {s?.pax ?? 0} راكب
                    {s && s.pax > s.done ? ` • ${s.pax - s.done} غير موزع` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ReturnDateBar date={date} onChange={setDate} />

      {/* ملخص الفنادق — النقر يفلتر */}
      {hotelSummary.length > 0 && (
        <div className="surface-card p-4 space-y-2">
          <div className="text-sm font-bold flex items-center gap-2">
            <Hotel className="h-4 w-4" /> ركاب الفنادق في هذا التاريخ
          </div>
          <div className="flex flex-wrap gap-2">
            {hotelSummary.map((h) => {
              const on = f.hotel === h.key;
              return (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => setF({ ...f, hotel: on ? "" : h.key })}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {h.name}: {h.pax} راكب
                  {h.pax > h.done ? ` • ${h.pax - h.done} غير موزع` : " ✓"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* شريط الفلاتر */}
      <div className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold flex items-center gap-2">
            <Filter className="h-4 w-4" /> الفلاتر
          </div>
          {filterActive && (
            <Button size="sm" variant="ghost" className="rounded-full h-7" onClick={() => setF(EMPTY_FILTERS)}>
              <X className="h-4 w-4 ml-1" /> مسح الفلاتر
            </Button>
          )}
        </div>
        <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
          <Input
            className="h-9 col-span-2 md:col-span-4"
            placeholder="بحث بالاسم أو رقم الحجز…"
            value={f.search}
            onChange={(e) => setF({ ...f, search: e.target.value })}
          />
          <FilterSelect label="الفندق" value={f.hotel} onChange={(v) => setF({ ...f, hotel: v })} options={hotelOpts} />
          <FilterSelect label="رحلة الذهاب" value={f.trip} onChange={(v) => setF({ ...f, trip: v })} options={tripOpts} />
          <FilterSelect label="حافلة الذهاب" value={f.outBus} onChange={(v) => setF({ ...f, outBus: v })} options={outBusOpts} />
          <FilterSelect label="حافلة العودة" value={f.retBus} onChange={(v) => setF({ ...f, retBus: v })} options={retBusOpts} />
          <FilterSelect
            label="نوع الحجز"
            value={f.type}
            onChange={(v) => setF({ ...f, type: v })}
            options={[
              { v: "family", l: "عائلة" },
              { v: "individual", l: "أفراد" },
            ]}
          />
          <FilterSelect label="مصدر الحجز" value={f.source} onChange={(v) => setF({ ...f, source: v })} options={sourceOpts} />
          <FilterSelect label="نوع الرحلة" value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={modeOpts} />
          <FilterSelect
            label="التمديد"
            value={f.ext}
            onChange={(v) => setF({ ...f, ext: v })}
            options={[
              { v: "yes", l: "عليه تمديد" },
              { v: "no", l: "بدون تمديد" },
            ]}
          />
        </div>
      </div>

      <div className="surface-card p-4 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">
          {filterActive ? "نتيجة الفلتر" : "حجوزات هذا التاريخ"}: {rows.length} ({totalPax} راكب)
        </Badge>
        <Badge className="bg-success text-white">موزعون: {donePax}</Badge>
        <Badge className="bg-warning text-white">غير موزعين: {Math.max(totalPax - donePax, 0)}</Badge>
        <div className="ms-auto flex flex-wrap gap-2">
          <PickupSheetButton bookings={allRows} buses={dateBuses} lookups={lookups} date={date} />
          <ReturnNamesCopyButton bookings={rows} returnTripName={dayTrips.map((t) => t.name).join("، ")} />
          <ReturnSloganDialog date={date} tripName={dayTrips[0]?.name} buses={dateBuses} />
        </div>
      </div>

      {bookings.isError && (
        <div className="surface-card p-4 text-sm text-destructive">
          تعذّر جلب حجوزات العودة: {(bookings.error as Error)?.message}
        </div>
      )}

      {dayTrips.length === 0 ? (
        <div className="surface-card p-6 space-y-3">
          <div className="text-sm font-bold">
            الحجوزات المرتبطة بعودة {formatTripDate(date)}: {rows.length}
          </div>
          <p className="text-xs text-muted-foreground">
            لا توجد رحلة عودة بهذا التاريخ — أنشئها من «إدارة الرحلات ← إدارة رحلات العودة» لتتمكن من التوزيع.
          </p>
          <div className="flex flex-wrap gap-2">
            {rows.map((b) => (
              <Badge key={b.id} variant="outline">
                {b.customer_name || b.booking_code} — غير موزع
              </Badge>
            ))}
          </div>
        </div>
      ) : (
        dayTrips.map((t) => (
          <ReturnTripCard
            key={t.id}
            template={t}
            date={date}
            buses={buses.data ?? []}
            assigned={(assignedBuses.data ?? []).filter((x) => x.return_trip_id === t.id)}
            bookings={rows}
            allBookings={allRows}
            lookups={lookups}
            ownerId={ownerId}
          />
        ))
      )}
    </div>
  );
}

/** زر نسخ أسماء العودات مجمّعة حسب رحلة الذهاب. */
export function ReturnNamesCopyButton({
  bookings,
  returnTripName,
}: {
  bookings: ReturnBookingRow[];
  returnTripName?: string;
}) {
  const tripIds = useMemo(
    () => Array.from(new Set(bookings.map((b) => b.trip_id).filter(Boolean) as string[])),
    [bookings],
  );

  const trips = useQuery({
    queryKey: ["return-copy-trips", tripIds.join(",")],
    enabled: tripIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("id,name").in("id", tripIds);
      if (error) throw error;
      return (data as { id: string; name: string }[]) ?? [];
    },
  });

  function buildText(): string {
    const nameOf = (id?: string | null) => (id ? trips.data?.find((t) => t.id === id)?.name : "") || "بدون رحلة";
    const pax = (b: ReturnBookingRow) => b.passenger_count || 1;
    const groups = new Map<string, ReturnBookingRow[]>();
    for (const b of bookings) {
      const key = nameOf(b.trip_id);
      const list = groups.get(key) ?? [];
      list.push(b);
      groups.set(key, list);
    }
    const total = bookings.reduce((s, b) => s + pax(b), 0);
    const parts: string[] = [`أسماء العودات في رحلة العودة ( ${returnTripName || "—"} ) = ${total}`, ""];
    for (const [tripName, list] of groups) {
      const sub = list.reduce((s, b) => s + pax(b), 0);
      parts.push(`من رحلة ( ${tripName} ) = ${sub}`, "");
      for (const b of list) {
        const name = (b.customer_name || b.booking_code || "").trim();
        const source = (b.booking_source || b.rep_name || "").trim();
        parts.push(`${name} / ${pax(b)} / ${source || "—"}`);
      }
      parts.push("");
    }
    return parts.join("\n").trim();
  }

  async function copy() {
    if (bookings.length === 0) return toast.error("لا توجد عودات في هذا التاريخ");
    try {
      await navigator.clipboard.writeText(buildText());
      toast.success("تم نسخ أسماء العودات");
    } catch {
      toast.error("تعذّر النسخ من هذا المتصفح");
    }
  }

  return (
    <Button size="sm" variant="outline" className="rounded-full" onClick={() => void copy()}>
      <Copy className="h-4 w-4 ml-1" /> نسخ العودات
    </Button>
  );
}
