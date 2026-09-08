// إجراءات كل رحلة عودة (داخل بطاقة الرحلة نفسها) بخيارين فقط — مثل رحلات الذهاب:
// 1) إنشاء حافلة جديدة مع الرحلة الجديدة.
// 2) تقدّم تلقائي أسبوعي: نسخ هذه الرحلة بعد 7 أيام بنفس إعداداتها وحافلاتها.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarPlus, Bus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addDays, formatTripDate } from "@/lib/trip-dates";

export interface ReturnTripLite {
  id: string; name: string; from_city: string; to_city: string;
  return_date: string | null; return_time: string | null; active: boolean; display_order: number;
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function nextWeekIso(trip: ReturnTripLite, fallback: string): string {
  return trip.return_date ? addDays(trip.return_date, 7) : fallback;
}

export function ReturnTripActions({ trip, tripsCount, todayIso }: {
  trip: ReturnTripLite;
  tripsCount: number;
  todayIso: string;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"new_bus" | "weekly" | null>(null);
  const [busy, setBusy] = useState(false);

  // الخيار الأول: إنشاء حافلة جديدة مع الرحلة الجديدة (يُملأ مسبقًا من هذه الرحلة)
  const [name, setName] = useState(trip.name);
  const [date, setDate] = useState(() => nextWeekIso(trip, todayIso));
  const [time, setTime] = useState(trip.return_time ?? "");
  const [from, setFrom] = useState(trip.from_city);
  const [to, setTo] = useState(trip.to_city);
  const [busName, setBusName] = useState("");
  const [busNumber, setBusNumber] = useState("0");
  const [capacity, setCapacity] = useState("49");
  const [plate, setPlate] = useState("");

  const weeklyDate = nextWeekIso(trip, todayIso);

  function open(m: "new_bus" | "weekly") {
    setName(trip.name);
    setDate(nextWeekIso(trip, todayIso));
    setTime(trip.return_time ?? "");
    setFrom(trip.from_city);
    setTo(trip.to_city);
    setMode(m);
  }

  function done() {
    qc.invalidateQueries({ queryKey: ["return-trips"] });
    qc.invalidateQueries({ queryKey: ["return-trip-buses-all"] });
    qc.invalidateQueries({ queryKey: ["return-fleet-all"] });
    setMode(null);
    setBusy(false);
  }

  async function createWithBus() {
    if (!name.trim()) return toast.error("اكتب اسم رحلة العودة");
    setBusy(true);
    const { data: newTrip, error } = await supabase.from("return_trips" as never).insert({
      name: name.trim(), from_city: from.trim(), to_city: to.trim(),
      return_date: date, weekday: weekdayOf(date), return_time: time || null,
      display_order: tripsCount,
    } as never).select("id").maybeSingle();
    if (error || !newTrip) { setBusy(false); return toast.error(error?.message ?? "تعذّر إنشاء الرحلة"); }

    const { data: bus, error: busErr } = await supabase.from("buses").insert({
      bus_number: Number(busNumber) || 0,
      name: busName.trim() || null,
      capacity: Number(capacity) || 49,
      plate: plate.trim() || null,
      direction: "return",
      status: "active",
      active: true,
    } as never).select("id").maybeSingle();
    if (busErr || !bus) { setBusy(false); return toast.error(busErr?.message ?? "تعذّر إنشاء الحافلة"); }

    const { error: linkErr } = await supabase.from("return_trip_buses" as never).insert({
      return_trip_id: (newTrip as { id: string }).id, trip_date: date, bus_id: (bus as { id: string }).id,
    } as never);
    if (linkErr) { setBusy(false); return toast.error(linkErr.message); }

    toast.success("تم إنشاء رحلة العودة والحافلة الجديدة");
    done();
  }

  async function createWeekly() {
    if (!trip.return_date) return toast.error("هذه الرحلة بلا تاريخ فعلي — حدّد التاريخ واحفظ أولًا.");
    setBusy(true);
    const { data: newTrip, error } = await supabase.from("return_trips" as never).insert({
      name: trip.name, from_city: trip.from_city, to_city: trip.to_city,
      return_date: weeklyDate, weekday: weekdayOf(weeklyDate), return_time: trip.return_time,
      active: trip.active, display_order: tripsCount,
    } as never).select("id").maybeSingle();
    if (error || !newTrip) { setBusy(false); return toast.error(error?.message ?? "تعذّر إنشاء الرحلة"); }

    // نفس منطق الحافلات الحالي: تُنقل ارتباطات حافلات هذه الرحلة إلى التاريخ الجديد
    const { data: links } = await supabase.from("return_trip_buses" as never)
      .select("bus_id").eq("return_trip_id", trip.id).eq("trip_date", trip.return_date);
    const rows = ((links as unknown as { bus_id: string }[]) ?? []).map((l) => ({
      return_trip_id: (newTrip as { id: string }).id, trip_date: weeklyDate, bus_id: l.bus_id,
    }));
    if (rows.length) await supabase.from("return_trip_buses" as never).insert(rows as never);

    toast.success(`تم إنشاء رحلة العودة التالية بتاريخ ${formatTripDate(weeklyDate)}`);
    done();
  }

  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => open("weekly")}>
        <CalendarPlus className="h-4 w-4 ml-1" /> التقدم الأسبوعي (+7 أيام)
      </Button>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => open("new_bus")}>
        <Bus className="h-4 w-4 ml-1" /> إنشاء حافلة جديدة مع رحلة جديدة
      </Button>

      {/* التقدم التلقائي الأسبوعي */}
      <Dialog open={mode === "weekly"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader><DialogTitle>التقدم التلقائي الأسبوعي — {trip.name}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">
            {trip.return_date
              ? `ستُنشأ رحلة عودة جديدة بعد 7 أيام بتاريخ ${formatTripDate(weeklyDate)} بنفس الإعدادات ونفس الحافلات.`
              : "هذه الرحلة بلا تاريخ فعلي — حدّد التاريخ واحفظ أولًا."}
          </p>
          <Button className="w-full rounded-xl font-bold" disabled={busy || !trip.return_date} onClick={createWeekly}>
            {busy ? "جارٍ الإنشاء…" : "إنشاء الرحلة التالية (+7 أيام)"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* إنشاء حافلة جديدة مع الرحلة الجديدة */}
      <Dialog open={mode === "new_bus"} onOpenChange={(o) => !o && setMode(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء حافلة جديدة مع رحلة عودة جديدة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label className="text-xs">اسم رحلة العودة</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><Label className="text-xs">تاريخ العودة</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label className="text-xs">وقت العودة</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
              <div><Label className="text-xs">من</Label><Input value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label className="text-xs">إلى</Label><Input value={to} onChange={(e) => setTo(e.target.value)} /></div>
            </div>
            <div className="rounded-xl border p-3 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 text-sm font-bold">الحافلة الجديدة</div>
              <div><Label className="text-xs">اسم الحافلة</Label><Input value={busName} onChange={(e) => setBusName(e.target.value)} placeholder="مزايا" /></div>
              <div><Label className="text-xs">رقم الحافلة</Label><Input type="number" value={busNumber} onChange={(e) => setBusNumber(e.target.value)} /></div>
              <div><Label className="text-xs">السعة</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></div>
              <div><Label className="text-xs">رقم اللوحة</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
            </div>
            <Button className="w-full rounded-xl font-bold" disabled={busy} onClick={createWithBus}>
              {busy ? "جارٍ الإنشاء…" : "إنشاء الرحلة والحافلة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
