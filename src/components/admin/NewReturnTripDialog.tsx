// إنشاء رحلة عودة جديدة بخيارين فقط:
// 1) إنشاء حافلة جديدة مع الرحلة الجديدة.
// 2) تقدّم تلقائي أسبوعي: نسخ رحلة عودة قائمة بعد 7 أيام بنفس إعداداتها وحافلاتها.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, formatTripDate } from "@/lib/trip-dates";

interface TripLite {
  id: string; name: string; from_city: string; to_city: string;
  return_date: string | null; return_time: string | null; active: boolean; display_order: number;
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function NewReturnTripDialog({ trips, todayIso }: { trips: TripLite[]; todayIso: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new_bus" | "weekly">("new_bus");
  const [busy, setBusy] = useState(false);

  // الخيار الأول
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso);
  const [time, setTime] = useState("");
  const [from, setFrom] = useState("مكة");
  const [to, setTo] = useState("الرياض");
  const [busName, setBusName] = useState("");
  const [busNumber, setBusNumber] = useState("0");
  const [capacity, setCapacity] = useState("49");
  const [plate, setPlate] = useState("");

  // الخيار الثاني
  const [sourceId, setSourceId] = useState(trips[0]?.id ?? "");
  const source = trips.find((t) => t.id === sourceId);
  const nextDate = source?.return_date ? addDays(source.return_date, 7) : null;

  function done() {
    qc.invalidateQueries({ queryKey: ["return-trips"] });
    qc.invalidateQueries({ queryKey: ["return-trip-buses-all"] });
    qc.invalidateQueries({ queryKey: ["return-fleet-all"] });
    setOpen(false);
    setBusy(false);
  }

  async function createWithBus() {
    if (!name.trim()) return toast.error("اكتب اسم رحلة العودة");
    setBusy(true);
    const { data: trip, error } = await supabase.from("return_trips" as never).insert({
      name: name.trim(), from_city: from.trim(), to_city: to.trim(),
      return_date: date, weekday: weekdayOf(date), return_time: time || null,
      display_order: trips.length,
    } as never).select("id").maybeSingle();
    if (error || !trip) { setBusy(false); return toast.error(error?.message ?? "تعذّر إنشاء الرحلة"); }

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
      return_trip_id: (trip as { id: string }).id, trip_date: date, bus_id: (bus as { id: string }).id,
    } as never);
    if (linkErr) { setBusy(false); return toast.error(linkErr.message); }

    toast.success("تم إنشاء رحلة العودة والحافلة");
    done();
  }

  async function createWeekly() {
    if (!source || !nextDate) return toast.error("اختر رحلة عودة لها تاريخ فعلي");
    setBusy(true);
    const { data: trip, error } = await supabase.from("return_trips" as never).insert({
      name: source.name, from_city: source.from_city, to_city: source.to_city,
      return_date: nextDate, weekday: weekdayOf(nextDate), return_time: source.return_time,
      active: source.active, display_order: trips.length,
    } as never).select("id").maybeSingle();
    if (error || !trip) { setBusy(false); return toast.error(error?.message ?? "تعذّر إنشاء الرحلة"); }

    // نفس منطق الحافلات الحالي: تُنقل ارتباطات حافلات الرحلة المصدر إلى التاريخ الجديد
    const { data: links } = await supabase.from("return_trip_buses" as never)
      .select("bus_id").eq("return_trip_id", source.id).eq("trip_date", source.return_date ?? "");
    const rows = ((links as unknown as { bus_id: string }[]) ?? []).map((l) => ({
      return_trip_id: (trip as { id: string }).id, trip_date: nextDate, bus_id: l.bus_id,
    }));
    if (rows.length) await supabase.from("return_trip_buses" as never).insert(rows as never);

    toast.success(`تم إنشاء رحلة العودة بتاريخ ${formatTripDate(nextDate)}`);
    done();
  }

  return (
    <>
      <Button size="sm" className="rounded-full" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 ml-1" /> إضافة رحلة عودة
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>إنشاء رحلة عودة جديدة</DialogTitle></DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <Button variant={mode === "new_bus" ? "default" : "outline"} className="rounded-xl h-auto py-3 text-xs font-bold" onClick={() => setMode("new_bus")}>
              إنشاء حافلة جديدة مع الرحلة الجديدة
            </Button>
            <Button variant={mode === "weekly" ? "default" : "outline"} className="rounded-xl h-auto py-3 text-xs font-bold" onClick={() => setMode("weekly")}>
              تقدم تلقائي أسبوعي
            </Button>
          </div>

          {mode === "new_bus" ? (
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label className="text-xs">اسم رحلة العودة</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="عودة السبت" /></div>
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
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">الرحلة المصدر</Label>
                <Select value={sourceId} onValueChange={setSourceId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="اختر رحلة عودة" /></SelectTrigger>
                  <SelectContent>
                    {trips.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}{t.return_date ? ` — ${formatTripDate(t.return_date)}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                {nextDate
                  ? `ستُنشأ رحلة عودة جديدة بعد 7 أيام بتاريخ ${formatTripDate(nextDate)} بنفس الإعدادات ونفس الحافلات.`
                  : "اختر رحلة عودة لها تاريخ فعلي."}
              </p>
              <Button className="w-full rounded-xl font-bold" disabled={busy || !nextDate} onClick={createWeekly}>
                {busy ? "جارٍ الإنشاء…" : "إنشاء الرحلة التالية (+7 أيام)"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
