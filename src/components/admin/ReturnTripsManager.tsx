// إدارة رحلات العودة — نظام مستقل تمامًا عن رحلات الذهاب.
// القوالب أسبوعية، لكن التشغيل والإدارة يتمّان بالتاريخ الفعلي.
// الحجوزات ترتبط بالرحلة عبر «تاريخ العودة الفعلي» المحسوب مسبقًا في قاعدة البيانات
// (تاريخ العودة + ليالي التمديد)، ولا علاقة للسعة بظهور الحجوزات.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, Save, Bus as BusIcon,
  AlertTriangle, Users,
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
}

interface ReturnBusRow { id: string; return_trip_id: string; trip_date: string; bus_id: string }
interface BusRow { id: string; name: string | null; bus_number: number; capacity: number; direction: string | null; status: string }

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
}

const WEEKDAYS = [
  { v: 0, l: "الأحد" }, { v: 1, l: "الاثنين" }, { v: 2, l: "الثلاثاء" }, { v: 3, l: "الأربعاء" },
  { v: 4, l: "الخميس" }, { v: 5, l: "الجمعة" }, { v: 6, l: "السبت" },
];

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
        <Input type="date" className="h-9 w-44 mt-1" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </div>
      <Button variant="outline" size="sm" className="rounded-full" onClick={() => onChange(addDays(date, 1))}>
        التالي <ChevronLeft className="h-4 w-4 mr-1" />
      </Button>
      <Button variant="secondary" size="sm" className="rounded-full" onClick={() => onChange(todayIso())}>اليوم</Button>
    </div>
  );
}

export function useReturnData(date: string) {
  const templates = useQuery({
    queryKey: ["return-trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("return_trips" as never).select("*").order("display_order");
      if (error) throw error;
      return (data as unknown as ReturnTripRow[]) ?? [];
    },
  });

  const buses = useQuery({
    queryKey: ["return-fleet"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buses").select("id,name,bus_number,capacity,direction,status").order("bus_number");
      if (error) throw error;
      return (data as unknown as BusRow[]) ?? [];
    },
  });

  const assignedBuses = useQuery({
    queryKey: ["return-trip-buses", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("return_trip_buses" as never).select("*").eq("trip_date", date);
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
        .select("id,booking_code,customer_name,passenger_count,trip_mode,extension_nights,actual_return_date,return_trip_id,return_bus_id,return_seat_numbers,contact_phone,status")
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
    queryFn: async () => {
      const { data, error } = await supabase.from("return_trips" as never).select("*").order("display_order");
      if (error) throw error;
      return (data as unknown as ReturnTripRow[]) ?? [];
    },
  });

  const buses = useQuery({
    queryKey: ["return-fleet-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("buses").select("id,name,bus_number,capacity,direction,status").order("bus_number");
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
      const { data } = await supabase.from("bookings")
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

  async function addTrip() {
    const name = prompt("اسم رحلة العودة (مثال: عودة السبت):");
    if (!name) return;
    const d = todayIso();
    const { error } = await supabase.from("return_trips" as never).insert({
      name, weekday: weekdayOf(d), return_date: d, display_order: (templates.data ?? []).length,
    } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["return-trips"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button size="sm" className="rounded-full" onClick={addTrip}>
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
          assigned={new Set((links.data ?? []).filter((l) => l.return_trip_id === t.id && l.trip_date === (t.return_date ?? "")).map((l) => l.bus_id))}
          occupancy={occupancy.data ?? {}}
        />
      ))}
    </div>
  );
}

/** بطاقة تحرير رحلة عودة واحدة — مطابقة في الأسلوب لبطاقة رحلة الذهاب. */
function ReturnTripEditor({ trip, buses, assigned, occupancy }: {
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
    const { error } = await supabase.from("return_trips" as never).update({
      name: local.name, from_city: local.from_city, to_city: local.to_city,
      return_date: date, weekday: date ? weekdayOf(date) : local.weekday,
      return_time: local.return_time || null, active: local.active, display_order: local.display_order,
    } as never).eq("id", trip.id);
    if (error) return toast.error(error.message);
    // نقل ارتباطات الحافلات إلى التاريخ الجديد عند تغييره
    if (date && trip.return_date && date !== trip.return_date) {
      await supabase.from("return_trip_buses" as never)
        .update({ trip_date: date } as never)
        .eq("return_trip_id", trip.id).eq("trip_date", trip.return_date);
    }
    toast.success("تم الحفظ");
    refresh();
  }

  async function del() {
    if (!confirm("حذف رحلة العودة؟ (لن يتم حذف أي حجز)")) return;
    const { error } = await supabase.from("return_trips" as never).delete().eq("id", trip.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function toggleBus(busId: string, add: boolean) {
    const date = trip.return_date;
    if (!date) return toast.error("حدّد تاريخ رحلة العودة أولًا ثم احفظ.");
    if (add) {
      const { error } = await supabase.from("return_trip_buses" as never)
        .insert({ return_trip_id: trip.id, trip_date: date, bus_id: busId } as never);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("return_trip_buses" as never).delete()
        .eq("return_trip_id", trip.id).eq("trip_date", date).eq("bus_id", busId);
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
            <div className="text-xs text-muted-foreground">{trip.from_city} ← {trip.to_city}</div>
          </>
        ) : (
          <div className="text-xs text-destructive">لم يتم تحديد تاريخ فعلي لرحلة العودة بعد.</div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2"><Label className="text-xs">اسم رحلة العودة</Label><Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></div>
        <div><Label className="text-xs">تاريخ العودة الفعلي</Label><Input type="date" value={local.return_date ?? ""} onChange={(e) => setLocal({ ...local, return_date: e.target.value })} /></div>
        <div><Label className="text-xs">وقت العودة</Label><Input type="time" value={local.return_time ?? ""} onChange={(e) => setLocal({ ...local, return_time: e.target.value })} /></div>
        <div><Label className="text-xs">من</Label><Input value={local.from_city} onChange={(e) => setLocal({ ...local, from_city: e.target.value })} /></div>
        <div><Label className="text-xs">إلى</Label><Input value={local.to_city} onChange={(e) => setLocal({ ...local, to_city: e.target.value })} /></div>
        <div><Label className="text-xs">الترتيب</Label><Input type="number" value={local.display_order} onChange={(e) => setLocal({ ...local, display_order: Number(e.target.value) })} /></div>
        <div className="flex items-end gap-2">
          <div className="flex items-center gap-2"><Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} /><span className="text-xs">مفعّلة</span></div>
        </div>
      </div>

      <div>
        <div className="text-sm font-bold flex items-center gap-2 mb-2"><BusIcon className="h-4 w-4" /> حافلات العودة المتاحة والإشغال</div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {buses.length === 0 && <div className="text-xs text-muted-foreground">لا توجد حافلات عودة في الأسطول — أضف حافلة باتجاه «عودة».</div>}
          {buses.map((b) => {
            const used = occupancy[b.id] ?? 0;
            const pct = b.capacity > 0 ? Math.round((used / b.capacity) * 100) : 0;
            const on = assigned.has(b.id);
            return (
              <div key={b.id} className={`flex items-center justify-between border rounded-xl p-3 ${on ? "border-primary bg-primary/5" : ""}`}>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={on} onCheckedChange={(v) => toggleBus(b.id, !!v)} />
                  <div>
                    <div className="text-sm font-bold">{b.name || `حافلة ${b.bus_number}`}</div>
                    <div className="text-[11px] text-muted-foreground">{b.status}</div>
                  </div>
                </label>
                <div className="text-left">
                  <div className={`text-sm font-bold ${used >= b.capacity ? "text-destructive" : ""}`}>{used}/{b.capacity}</div>
                  <div className="text-[11px] text-muted-foreground">{pct}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={del} className="rounded-full"><Trash2 className="h-4 w-4" /></Button>
        <Button size="sm" onClick={save} className="rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ</Button>
      </div>
    </div>
  );
}


export function ReturnTripCard({ template, date, buses, assigned, bookings, ownerId }: {
  template: ReturnTripRow;
  date: string;
  buses: BusRow[];
  assigned: ReturnBusRow[];
  bookings: ReturnBookingRow[];
  ownerId?: string;
}) {
  const qc = useQueryClient();
  const [addingBus, setAddingBus] = useState(false);
  const [newBooking, setNewBooking] = useState(false);

  const assignedBusIds = assigned.map((a) => a.bus_id);
  const tripBuses = buses.filter((b) => assignedBusIds.includes(b.id));
  const returnFleet = buses.filter((b) => (b.direction ?? "outbound") === "return" && !assignedBusIds.includes(b.id));

  const distributed = bookings.filter((b) => b.return_bus_id && (b.return_seat_numbers?.length ?? 0) > 0);
  const undistributed = bookings.filter((b) => !b.return_bus_id || (b.return_seat_numbers?.length ?? 0) === 0);
  const pax = (b: ReturnBookingRow) => b.passenger_count || 1;
  const totalPax = bookings.reduce((s, b) => s + pax(b), 0);
  const donePax = distributed.reduce((s, b) => s + (b.return_seat_numbers?.length ?? 0), 0);

  const seatsOnBus = (busId: string) =>
    bookings.filter((b) => b.return_bus_id === busId).flatMap((b) => b.return_seat_numbers ?? []);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["return-bookings", date] });
    qc.invalidateQueries({ queryKey: ["return-trip-buses", date] });
  }

  async function addBus(busId: string) {
    const { error } = await supabase.from("return_trip_buses" as never).insert({
      return_trip_id: template.id, trip_date: date, bus_id: busId,
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
    if (count > 0 && !confirm(`⚠️ تنبيه\n\n${label} مرتبطة برحلة عودة بتاريخ ${formatTripDate(date)} وبها ${count} راكبًا.\n\nسيتم إلغاء تخصيص هؤلاء الركاب (يبقون ضمن الحجوزات المرتبطة كـ«غير موزعين») ولن يُحذف أي حجز.\n\nهل تريد المتابعة؟`)) return;
    if (count === 0 && !confirm(`إزالة ${label} من رحلة العودة بتاريخ ${formatTripDate(date)}؟`)) return;

    if (count > 0) {
      const { error } = await supabase.from("bookings")
        .update({ return_bus_id: null, return_seat_numbers: [] } as never)
        .in("id", riders.map((r) => r.id));
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase.from("return_trip_buses" as never).delete()
      .eq("return_trip_id", template.id).eq("trip_date", date).eq("bus_id", busId);
    if (error) return toast.error(error.message);
    toast.success("تمت إزالة الحافلة من الرحلة");
    refresh();
  }

  async function assign(b: ReturnBookingRow, busId: string | null, seats: string[]) {
    const { error } = await supabase.from("bookings").update({
      return_trip_id: busId ? template.id : null,
      return_bus_id: busId,
      return_seat_numbers: seats,
    } as never).eq("id", b.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  return (
    <div className="surface-card p-5 space-y-5">
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="text-base font-extrabold">عودة {formatTripDate(date)}</div>
        <div className="text-sm font-bold text-[color:var(--color-navy)]">{template.from_city} ← {template.to_city}</div>
        {template.return_time && <div className="text-xs text-muted-foreground">{formatTripTime(template.return_time)}</div>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="secondary">الحجوزات المرتبطة: {bookings.length} ({totalPax} راكب)</Badge>
          <Badge className="bg-success text-white">تم توزيعهم: {donePax}</Badge>
          <Badge className="bg-warning text-white">غير موزعين: {Math.max(totalPax - donePax, 0)}</Badge>
        </div>
      </div>

      {/* الحافلات المخصصة يدويًا لهذا التاريخ */}
      <div>
        <div className="text-sm font-bold flex items-center gap-2 mb-2"><BusIcon className="h-4 w-4" /> حافلات العودة</div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {tripBuses.length === 0 && <div className="text-xs text-muted-foreground">لا توجد حافلات مضافة لهذه العودة بعد — الحجوزات تظهر كاملة رغم ذلك.</div>}
          {tripBuses.map((b) => {
            const used = seatsOnBus(b.id).length;
            return (
              <div key={b.id} className="flex items-center justify-between border rounded-xl p-3">
                <div>
                  <div className="text-sm font-bold">{b.name || `حافلة ${b.bus_number}`}</div>
                  <div className="text-[11px] text-muted-foreground">{used} / {b.capacity}</div>
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
          <div className="text-sm font-bold flex items-center gap-2"><Users className="h-4 w-4" /> الحجوزات المرتبطة بالعودة</div>
          <Button size="sm" className="rounded-full" onClick={() => setNewBooking(true)}>
            <Plus className="h-4 w-4 ml-1" /> إضافة حجز عودة
          </Button>
        </div>

        {newBooking && (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full"><tbody>
              <ManualBookingRow
                colSpan={1}
                ownerId={ownerId}
                initial={{ trip_mode: "return" }}
                onClose={() => setNewBooking(false)}
                onSaved={() => { setNewBooking(false); refresh(); }}
              />
            </tbody></table>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="p-2 text-right">الراكب</th>
                <th className="p-2 text-right">نوع الحجز</th>
                <th className="p-2 text-right">العودة الفعلية</th>
                <th className="p-2 text-right">ليالي التمديد</th>
                <th className="p-2 text-right">الحافلة</th>
                <th className="p-2 text-right">المقاعد</th>
                <th className="p-2 text-right">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">لا توجد حجوزات مرتبطة بهذا التاريخ.</td></tr>
              )}
              {bookings.map((b) => (
                <BookingAssignRow
                  key={b.id}
                  booking={b}
                  buses={tripBuses}
                  takenSeats={(busId) => seatsOnBus(busId).filter((s) => !(b.return_seat_numbers ?? []).includes(s))}
                  onAssign={(busId, seats) => assign(b, busId, seats)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {undistributed.length > 0 && (
        <div className="rounded-xl border border-warning/50 bg-warning/10 p-4">
          <div className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> غير موزعين: {undistributed.reduce((s, b) => s + pax(b), 0)}</div>
          <p className="text-xs text-muted-foreground mt-1">هؤلاء الركاب مرتبطون بهذه العودة ولكن لم يتم تخصيص حافلة/مقعد لهم بعد.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {undistributed.map((b) => (
              <Badge key={b.id} variant="outline">{b.customer_name || b.booking_code} — غير موزع</Badge>
            ))}
          </div>
        </div>
      )}

      <Dialog open={addingBus} onOpenChange={setAddingBus}>
        <DialogContent>
          <DialogHeader><DialogTitle>إضافة حافلة عودة</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {returnFleet.length === 0 && (
              <p className="text-sm text-muted-foreground">لا توجد حافلات مصنّفة «عودة» متاحة. صنّف الحافلة كـ«عودة» من صفحة الأسطول أولًا.</p>
            )}
            {returnFleet.map((b) => (
              <Button key={b.id} variant="outline" className="w-full justify-between rounded-xl" onClick={() => addBus(b.id)}>
                <span>{b.name || `حافلة ${b.bus_number}`}</span>
                <span className="text-xs text-muted-foreground">{b.capacity} مقعد</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookingAssignRow({ booking, buses, takenSeats, onAssign }: {
  booking: ReturnBookingRow;
  buses: BusRow[];
  takenSeats: (busId: string) => string[];
  onAssign: (busId: string | null, seats: string[]) => void;
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

  return (
    <tr className="border-b align-top">
      <td className="p-2 font-bold">{booking.customer_name || booking.booking_code}<div className="text-[11px] font-normal text-muted-foreground">{booking.passenger_count} راكب</div></td>
      <td className="p-2">{modeLabel(booking.trip_mode, booking.extension_nights)}</td>
      <td className="p-2">{formatTripDate(booking.actual_return_date)}</td>
      <td className="p-2">{booking.extension_nights ?? 0}</td>
      <td className="p-2">
        <Select value={busId || "__none"} onValueChange={(v) => onAssign(v === "__none" ? null : v, v === busId ? seats : [])}>
          <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— بدون —</SelectItem>
            {buses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name || `حافلة ${b.bus_number}`}</SelectItem>)}
          </SelectContent>
        </Select>
      </td>
      <td className="p-2">
        {!bus ? <span className="text-muted-foreground">—</span> : (
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
        {distributed
          ? <Badge className="bg-success text-white">موزع</Badge>
          : <Badge className="bg-warning text-white">غير موزع</Badge>}
      </td>
    </tr>
  );
}

/** تبويب «العودة» داخل إدارة الحجوزات — اختيار تاريخ العودة وعرض ركابها وتوزيعهم. */
export function ReturnBookingsTab({ ownerId }: { ownerId?: string }) {
  const [date, setDate] = useState(todayIso());
  const { templates, buses, assignedBuses, bookings } = useReturnData(date);
  const dayTemplates = (templates.data ?? []).filter((t) => t.active && t.weekday === weekdayOf(date));

  return (
    <div className="space-y-4">
      <ReturnDateBar date={date} onChange={setDate} />
      {dayTemplates.length === 0 ? (
        <div className="surface-card p-6 space-y-3">
          <div className="text-sm font-bold">
            الحجوزات المرتبطة بعودة {formatTripDate(date)}: {(bookings.data ?? []).length}
          </div>
          <p className="text-xs text-muted-foreground">
            لا يوجد قالب رحلة عودة لهذا اليوم — أضف قالبًا من «إدارة الرحلات ← إدارة رحلات العودة» لتتمكن من التوزيع.
          </p>
          <div className="flex flex-wrap gap-2">
            {(bookings.data ?? []).map((b) => (
              <Badge key={b.id} variant="outline">{b.customer_name || b.booking_code} — غير موزع</Badge>
            ))}
          </div>
        </div>
      ) : (
        dayTemplates.map((t) => (
          <ReturnTripCard
            key={t.id}
            template={t}
            date={date}
            buses={buses.data ?? []}
            assigned={(assignedBuses.data ?? []).filter((x) => x.return_trip_id === t.id)}
            bookings={bookings.data ?? []}
            ownerId={ownerId}
          />
        ))
      )}
    </div>
  );
}
