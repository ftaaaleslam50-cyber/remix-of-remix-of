// مخطط الحافلة الحي مع سحب وإفلات لتبديل/نقل المقاعد، ثم اعتماد التعديلات دفعة واحدة.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, RotateCcw, Mars, Venus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LayoutCell, LayoutJson, SeatGender } from "@/components/booking/LayoutSeatMap";

export interface LiveSeatBooking {
  id: string;
  customer_name: string | null;
  booking_code: string | null;
  seat_numbers: string[] | null;
  seat_genders?: Record<string, SeatGender> | null;
  male_count?: number | null;
  booking_source?: string | null;
  booking_type?: string | null;
}

interface Occupant {
  bookingId: string;
  name: string;
  gender?: SeatGender;
  rep?: string;
  bookingType?: string | null;
}

const cellLabel = (c: LayoutCell) => (c.label && c.label.trim() ? c.label : `${c.row}-${c.col}`);

export function LiveSeatBoard({
  layout,
  bookings,
  shortName,
  onSaved,
}: {
  layout: LayoutJson;
  bookings: LiveSeatBooking[];
  shortName: (n: string | null | undefined) => string;
  onSaved?: () => void;
}) {
  /** الخريطة الأصلية من قاعدة البيانات */
  const original = useMemo(() => {
    const m: Record<string, Occupant> = {};
    for (const b of bookings) {
      const explicit = (b.seat_genders ?? {}) as Record<string, SeatGender>;
      const rep = b.booking_source && b.booking_source !== "Admin" && b.booking_source !== "الموقع" ? b.booking_source : "";
      const bt = b.booking_type === "family" ? "عوائل" : b.booking_type === "individual" ? "أفراد" : (b.booking_type ?? "");
      (b.seat_numbers ?? []).forEach((seat, idx) => {
        m[seat] = {
          bookingId: b.id,
          name: shortName(b.customer_name),
          gender: explicit[seat] ?? (idx < Number(b.male_count ?? 0) ? "male" : "female"),
          rep,
          bookingType: bt,
        };
      });
    }
    return m;
  }, [bookings, shortName]);

  const [map, setMap] = useState<Record<string, Occupant>>(original);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setMap(original), [original]);

  const dirty = useMemo(() => {
    const a = Object.keys(original).sort();
    const b = Object.keys(map).sort();
    if (a.join("|") !== b.join("|")) return true;
    return a.some((s) => original[s].bookingId !== map[s]?.bookingId);
  }, [original, map]);

  function move(from: string, to: string) {
    if (!from || from === to) return setPicked(null);
    setMap((prev) => {
      const next = { ...prev };
      const src = prev[from];
      if (!src) return prev;
      const dst = prev[to];
      next[to] = src;
      if (dst) next[from] = dst;
      else delete next[from];
      return next;
    });
    setPicked(null);
    setHover(null);
  }

  async function approve() {
    setSaving(true);
    // أعد بناء المقاعد لكل حجز من الخريطة الجديدة
    const seatsByBooking: Record<string, string[]> = {};
    const gendersByBooking: Record<string, Record<string, SeatGender>> = {};
    for (const [seat, occ] of Object.entries(map)) {
      (seatsByBooking[occ.bookingId] ??= []).push(seat);
      if (occ.gender) (gendersByBooking[occ.bookingId] ??= {})[seat] = occ.gender;
    }
    let changed = 0;
    for (const b of bookings) {
      const before = [...(b.seat_numbers ?? [])].sort((x, y) => x.localeCompare(y, "en", { numeric: true }));
      const after = (seatsByBooking[b.id] ?? []).sort((x, y) => x.localeCompare(y, "en", { numeric: true }));
      if (before.join("|") === after.join("|")) continue;
      const { error } = await supabase
        .from("bookings")
        .update({ seat_numbers: after, seat_genders: gendersByBooking[b.id] ?? {} } as never)
        .eq("id", b.id);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
      changed++;
    }
    setSaving(false);
    toast.success(changed ? `تم اعتماد تعديلات ${changed} حجز` : "لا توجد تغييرات");
    onSaved?.();
  }

  const cols = Math.max(1, layout.cols || 1);
  const rows = Math.max(1, layout.rows || 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-muted-foreground">
          اسحب المعتمر إلى مقعد آخر — إذا كان المقعد مشغولًا يتم التبديل بينهما. أو اضغط المقعد ثم اضغط الوجهة (للجوال).
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button size="sm" variant="ghost" className="h-8 rounded-full text-xs" onClick={() => setMap(original)}>
              <RotateCcw className="h-3.5 w-3.5 ml-1" /> تراجع
            </Button>
          )}
          <Button size="sm" className="h-8 rounded-full text-xs" disabled={!dirty || saving} onClick={approve}>
            <Check className="h-3.5 w-3.5 ml-1" /> {saving ? "جارٍ الاعتماد…" : "اعتمد"}
          </Button>
        </div>
      </div>

      {dirty && <Badge variant="secondary" className="text-[11px]">تغييرات غير معتمدة</Badge>}

      <div
        className="grid gap-1.5 mx-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, maxWidth: cols * 110 }}
        dir="ltr"
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const r = Math.floor(i / cols) + 1;
          const c = (i % cols) + 1;
          const cell = layout.cells.find((x) => x.row === r && x.col === c);
          if (!cell || cell.kind === "empty") return <div key={i} className="aspect-square" />;
          if (cell.kind !== "seat") {
            return (
              <div
                key={i}
                className="aspect-square rounded-lg border-2 bg-muted/60 text-[10px] font-bold flex items-center justify-center text-muted-foreground"
              >
                {cell.kind === "driver" ? "🚍" : cell.kind === "door" ? "🚪" : cell.kind === "restroom" ? "🚻" : "👤"}
              </div>
            );
          }
          const label = cellLabel(cell);
          const occ = map[label];
          const isPicked = picked === label;
          const isHover = hover === label;
          const moved = occ && original[label]?.bookingId !== occ.bookingId;
          const cls = occ
            ? occ.gender === "female"
              ? "bg-pink-500 text-white border-pink-600"
              : "bg-sky-600 text-white border-sky-700"
            : "bg-white border-border";
          return (
            <button
              key={i}
              type="button"
              draggable={!!occ}
              onDragStart={(e) => {
                if (!occ) return;
                e.dataTransfer.setData("text/plain", label);
                e.dataTransfer.effectAllowed = "move";
                setPicked(label);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setHover(label);
              }}
              onDragLeave={() => setHover((h) => (h === label ? null : h))}
              onDrop={(e) => {
                e.preventDefault();
                move(e.dataTransfer.getData("text/plain") || picked || "", label);
              }}
              onDragEnd={() => {
                setHover(null);
              }}
              onClick={() => {
                if (picked) return move(picked, label);
                if (occ) setPicked(label);
              }}
              title={occ ? `${label} — ${occ.name}` : label}
              className={`aspect-square rounded-lg border-2 text-[11px] font-bold flex flex-col items-center justify-center gap-0.5 leading-tight px-0.5 overflow-hidden transition ${cls} ${
                isPicked ? "ring-2 ring-primary scale-105" : ""
              } ${isHover ? "ring-2 ring-primary/70" : ""} ${moved ? "outline outline-2 outline-amber-400" : ""} ${
                occ ? "cursor-grab active:cursor-grabbing" : picked ? "cursor-pointer hover:bg-primary/10" : ""
              }`}
            >
              {occ?.gender === "male" && <Mars className="h-3.5 w-3.5" />}
              {occ?.gender === "female" && <Venus className="h-3.5 w-3.5" />}
              <span className="font-extrabold">{label}</span>
              {occ && (
                <span className="w-full text-center text-[9px] font-extrabold leading-tight" style={{ overflowWrap: "anywhere" }} dir="rtl">
                  {occ.name}
                  {(occ.rep || occ.bookingType) && (
                    <span className="block text-[8px] font-bold opacity-90">
                      {occ.rep && <>· {occ.rep}</>}
                      {occ.rep && occ.bookingType && " "}
                      {occ.bookingType}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
