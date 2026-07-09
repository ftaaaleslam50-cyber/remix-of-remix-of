// Bus seat map — two layouts:
//   Layout A (49): A..K rows (4 each = 44) + M1..M5 back row = 49. A2 = supervisor.
//   Layout B (51): Layout A + F1..F4 positioned in the middle service block,
//                  opposite the WC / middle door (right side of aisle). Total = 53?
//                  Spec: 51 seats — F1..F4 replace no normal seats; supervisor still A2.
//                  Layout A base = 49; +4 F seats = 53 nominal. To match the "51" spec
//                  we count seatable = 49 + 4 - 2 blocked (A2 supervisor stays blocked
//                  in both). The rendered grid has 53 buttons in Layout B; capacity
//                  math uses allSeats(layout).length.

import { Bus as BusIcon, DoorOpen, Droplets, User } from "lucide-react";

export type SeatStatus = "available" | "selected" | "reserved" | "supervisor" | "blocked";
export type BusLayout = "A" | "B";

const NORMAL_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

export function allSeats(layout: BusLayout = "A"): string[] {
  const seats: string[] = [];
  for (const r of NORMAL_ROWS) seats.push(`${r}1`, `${r}2`, `${r}3`, `${r}4`);
  seats.push("M1", "M2", "M3", "M4", "M5");
  if (layout === "B") seats.push("F1", "F2", "F3", "F4");
  return seats;
}

interface Props {
  selected: string[];
  reserved: string[];
  maxSelectable: number;
  onChange: (seats: string[]) => void;
  blocked?: string[];
  layout?: BusLayout;
}

export function BusSeatMap({ selected, reserved, maxSelectable, onChange, blocked = ["A2"], layout = "A" }: Props) {
  const isReserved = (id: string) => reserved.includes(id);
  const isBlocked = (id: string) => blocked.includes(id) && id !== "A2";
  const isSupervisor = (id: string) => id === "A2";
  const isSelected = (id: string) => selected.includes(id);

  function toggle(id: string) {
    if (isReserved(id) || isBlocked(id) || isSupervisor(id)) return;
    if (isSelected(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      if (selected.length >= maxSelectable) return;
      onChange([...selected, id]);
    }
  }

  function seatStatus(id: string): SeatStatus {
    if (isSupervisor(id)) return "supervisor";
    if (isBlocked(id)) return "blocked";
    if (isReserved(id)) return "reserved";
    if (isSelected(id)) return "selected";
    return "available";
  }

  function Seat({ id }: { id: string }) {
    const status = seatStatus(id);
    const cls = {
      available: "bg-white border-border hover:border-primary hover:shadow-md",
      selected: "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-red)] scale-105",
      reserved: "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-70",
      supervisor: "bg-[color:var(--color-navy)] text-white border-[color:var(--color-navy)] cursor-not-allowed",
      blocked: "bg-neutral-200 text-neutral-400 border-neutral-300 cursor-not-allowed",
    }[status];

    return (
      <button
        type="button"
        onClick={() => toggle(id)}
        title={status === "supervisor" ? "مقعد المشرف" : id}
        className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-xl border-2 text-[11px] font-bold transition-all flex items-center justify-center ${cls}`}
      >
        {id}
      </button>
    );
  }

  function Row({ row }: { row: string }) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <Seat id={`${row}1`} />
        <Seat id={`${row}2`} />
        <div className="w-6 sm:w-8" />
        <Seat id={`${row}3`} />
        <Seat id={`${row}4`} />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-muted to-white rounded-3xl border-2 border-border p-3 sm:p-5">
      <div className="flex items-stretch justify-between gap-2 pb-3 border-b-2 border-dashed border-border mb-3">
        <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-amber-100 text-amber-700 border-2 border-amber-300 flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold">
          <DoorOpen className="h-4 w-4" />
          <span>باب أمامي</span>
        </div>
        <div className="flex-1 text-center text-[10px] text-muted-foreground flex flex-col items-center justify-center">
          <BusIcon className="h-4 w-4 text-[color:var(--color-navy)]" />
          <span>أمام الحافلة — Layout {layout}</span>
        </div>
        <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl bg-[color:var(--color-navy)] text-white flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold">
          <User className="h-4 w-4" />
          <span>السائق</span>
        </div>
      </div>

      <div className="space-y-2">
        <Row row="A" />
        <Row row="B" />
        <Row row="C" />
        <Row row="D" />
        <Row row="E" />

        {/* MIDDLE service block: WC + middle door on the LEFT.
            Layout B adds F1..F4 on the RIGHT (opposite the WC). */}
        <div className="py-2 my-1 border-y-2 border-dashed border-border">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex flex-col gap-1">
              <div className="h-10 sm:h-11 w-[104px] sm:w-[116px] rounded-lg bg-sky-100 text-sky-700 border-2 border-sky-300 flex items-center justify-center gap-1 text-[10px] font-bold">
                <Droplets className="h-3.5 w-3.5" /> دورة مياه
              </div>
              <div className="h-10 sm:h-11 w-[104px] sm:w-[116px] rounded-lg bg-amber-100 text-amber-700 border-2 border-amber-300 flex items-center justify-center gap-1 text-[10px] font-bold">
                <DoorOpen className="h-3.5 w-3.5" /> باب أوسط
              </div>
            </div>
            {layout === "B" ? (
              <div className="grid grid-cols-2 gap-1.5">
                <Seat id="F1" />
                <Seat id="F2" />
                <Seat id="F3" />
                <Seat id="F4" />
              </div>
            ) : (
              <div className="flex-1" />
            )}
          </div>
        </div>

        <Row row="F" />
        <Row row="G" />
        <Row row="H" />
        <Row row="I" />
        <Row row="J" />
        <Row row="K" />

        <div className="flex items-center justify-center gap-1.5 pt-3 mt-2 border-t-2 border-dashed border-border">
          <Seat id="M1" />
          <Seat id="M2" />
          <Seat id="M3" />
          <Seat id="M4" />
          <Seat id="M5" />
        </div>
        <p className="text-center text-[10px] text-muted-foreground mt-1">خلف الحافلة</p>
      </div>

      <Legend />
    </div>
  );
}

function Legend() {
  const items: { color: string; label: string }[] = [
    { color: "bg-white border-2 border-border", label: "متاح" },
    { color: "bg-primary", label: "مختار" },
    { color: "bg-muted border-2 border-border", label: "محجوز" },
    { color: "bg-[color:var(--color-navy)]", label: "المشرف" },
  ];
  return (
    <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className={`h-4 w-4 rounded-md ${it.color}`} />
          <span className="text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Auto-pick seats: adjacent → nearest. Skips reserved/blocked/supervisor. */
export function pickRandomSeats(
  count: number,
  reserved: string[],
  blocked: string[] = ["A2"],
  layout: BusLayout = "A"
): string[] {
  const all = allSeats(layout);
  const isFree = (s: string) => !reserved.includes(s) && !blocked.includes(s) && s !== "A2";
  const free = all.filter(isFree);
  if (count <= 0 || free.length < count) return [];
  if (count === 1) return [free[Math.floor(Math.random() * free.length)]];

  for (const row of NORMAL_ROWS) {
    const pairs: string[][] = [
      [`${row}1`, `${row}2`],
      [`${row}3`, `${row}4`],
    ];
    for (const pair of pairs) {
      if (pair.every(isFree)) {
        if (count === 2) return pair;
        const rest = [`${row}1`, `${row}2`, `${row}3`, `${row}4`].filter((s) => !pair.includes(s) && isFree(s));
        if (pair.length + rest.length >= count) return [...pair, ...rest.slice(0, count - 2)];
      }
    }
  }
  return free.slice(0, count);
}
