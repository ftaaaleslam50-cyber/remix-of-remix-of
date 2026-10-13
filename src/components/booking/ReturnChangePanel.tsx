// اختيار مقعد عودة جديد عند تغيير التمديد/تاريخ العودة.
// لا يحفظ شيئًا: المقعد القديم يبقى محجوزًا حتى يُستدعى change_booking_return عند التأكيد.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { freeSeatsOf, returnStepMode, roomOf, type ReturnBusOcc } from "@/lib/return-need";
import { RETURN_SEAT_ADMIN_MSG } from "@/lib/return-display";

export interface ReturnChoice { busId: string | null; seats: string[]; allowUnassigned: boolean }

export function ReturnChangePanel({
  bookingCode, newDate, oldDate, count, oldBusId, oldSeats, value, onChange, staff = false,
}: {
  bookingCode: string;
  newDate: string | null;
  oldDate: string | null;
  count: number;
  oldBusId: string | null;
  oldSeats: string[];
  value: ReturnChoice;
  onChange: (v: ReturnChoice) => void;
  staff?: boolean;
}) {
  const [buses, setBuses] = useState<ReturnBusOcc[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!newDate) { setBuses([]); return; }
    let live = true;
    setBuses(null); setErr(null);
    supabase.rpc("get_return_occupancy", { _date: newDate, _exclude_code: bookingCode }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setErr(error.message); setBuses([]); return; }
      setBuses((data ?? []) as unknown as ReturnBusOcc[]);
    });
    return () => { live = false; };
  }, [newDate, bookingCode]);

  const mode = buses ? returnStepMode(buses, count) : null;
  const fit = useMemo(() => (buses ?? []).filter((b) => roomOf(b) >= count), [buses, count]);
  const bus = fit.find((b) => b.bus_id === value.busId) ?? null;
  const busLabel = (b: ReturnBusOcc) => `${b.return_trip_name} — ${b.bus_name || `حافلة ${b.bus_number}`}`;

  const toggle = (s: string) => {
    const has = value.seats.includes(s);
    const seats = has ? value.seats.filter((x) => x !== s) : value.seats.length < count ? [...value.seats, s] : value.seats;
    onChange({ ...value, seats });
  };

  return (
    <div className="rounded-xl border bg-muted/30 p-3 space-y-3 text-sm" data-testid="return-change-panel">
      <div className="font-bold">مقعد العودة في التاريخ الجديد</div>
      <div className="text-xs text-muted-foreground">
        مقعدك الحالي{oldSeats.length ? ` (${oldSeats.join("، ")})` : ""}{oldDate ? ` بتاريخ ${oldDate}` : ""} يبقى محجوزًا لك حتى تأكيد التغيير.
      </div>
      {!newDate && <div>حدد تاريخ العودة أولًا.</div>}
      {newDate && buses === null && <div>جارٍ تحميل المقاعد المتاحة…</div>}
      {err && <div className="text-destructive">تعذر تحميل المقاعد: {err}</div>}
      {newDate && buses && mode === "single" && (
        <>
          <select
            className="h-9 w-full rounded-md border bg-background px-2"
            value={value.busId ?? ""}
            onChange={(e) => onChange({ busId: e.target.value || null, seats: [], allowUnassigned: false })}
          >
            <option value="">اختر حافلة العودة</option>
            {fit.map((b) => (
              <option key={b.bus_id} value={b.bus_id}>{busLabel(b)} — متاح {roomOf(b)}</option>
            ))}
          </select>
          {bus && (
            <div className="flex flex-wrap gap-1.5">
              {freeSeatsOf(bus).map((s) => {
                const on = value.seats.includes(s);
                const same = bus.bus_id === oldBusId && oldSeats.includes(s);
                return (
                  <button
                    type="button"
                    key={s}
                    onClick={() => toggle(s)}
                    className={`h-8 min-w-8 rounded-md border px-2 text-xs ${on ? "bg-primary text-primary-foreground" : "bg-background"} ${same ? "ring-1 ring-primary" : ""}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      {newDate && buses && mode !== "single" && (
        <div className="space-y-2">
          <div>{RETURN_SEAT_ADMIN_MSG}</div>
          {staff && (
            <div className="text-xs text-muted-foreground">
              {buses.length === 0
                ? "لا توجد حافلة عودة مربوطة بهذا التاريخ."
                : `لا توجد حافلة واحدة تتسع لـ ${count} ركاب (المتاح: ${buses.map((b) => `${b.bus_name || b.bus_number}: ${roomOf(b)}`).join("، ")}).`}
            </div>
          )}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={value.allowUnassigned}
              onChange={(e) => onChange({ busId: null, seats: [], allowUnassigned: e.target.checked })}
            />
            <span>أوافق على حفظ التاريخ الجديد دون مقعد عودة مؤكد.</span>
          </label>
        </div>
      )}
      {newDate && (
        <div className="rounded-md bg-background p-2 text-xs">
          <b>الملخص:</b> تاريخ العودة الجديد {newDate} —{" "}
          {bus && value.seats.length === count
            ? `${busLabel(bus)}، مقاعد ${value.seats.join("، ")}`
            : value.allowUnassigned
              ? RETURN_SEAT_ADMIN_MSG
              : `اختر ${count} مقعد`}
        </div>
      )}
    </div>
  );
}

export const returnChoiceReady = (v: ReturnChoice, count: number) =>
  (v.busId !== null && v.seats.length === count) || v.allowUnassigned;
