// Renders seat map from a bus_layouts.layout_json template.
import { toast } from "sonner";
import { Mars, Venus } from "lucide-react";

export type SeatGender = "male" | "female";

export type LayoutCellKind = "seat" | "empty" | "driver" | "door" | "restroom";
export interface LayoutCell { row: number; col: number; kind: LayoutCellKind; label?: string; disabled?: boolean }
export interface LayoutJson { rows: number; cols: number; cells: LayoutCell[] }

const KIND_META: Record<LayoutCellKind, { bg: string; icon: string; label: string }> = {
  empty:    { bg: "bg-transparent border-transparent",             icon: "",   label: "" },
  driver:   { bg: "bg-amber-100 text-amber-800 border-amber-400",  icon: "🚍", label: "السائق" },
  door:     { bg: "bg-blue-100 text-blue-700 border-blue-400",     icon: "🚪", label: "باب" },
  restroom: { bg: "bg-emerald-100 text-emerald-700 border-emerald-400", icon: "🚻", label: "دورة مياه" },
  seat:     { bg: "", icon: "", label: "" },
};

function seatLabel(c: LayoutCell): string {
  return c.label && c.label.trim().length > 0 ? c.label : `${c.row}-${c.col}`;
}

export function allLayoutSeats(layout: LayoutJson): string[] {
  return layout.cells.filter((c) => c.kind === "seat" && !c.disabled).map(seatLabel);
}

/** Mirror a layout horizontally (right↔left) without changing seat labels. */
export function mirrorLayout(layout: LayoutJson): LayoutJson {
  const cols = Math.max(1, layout.cols || 1);
  return {
    rows: layout.rows,
    cols,
    cells: layout.cells.map((c) => ({ ...c, col: cols + 1 - c.col })),
  };
}

export function pickRandomLayoutSeats(count: number, layout: LayoutJson, reserved: string[]): string[] {
  const free = allLayoutSeats(layout).filter((s) => !reserved.includes(s));
  if (count <= 0 || free.length < count) return free.slice(0, count);
  const shuffled = [...free].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

interface Props {
  layout: LayoutJson;
  selected: string[];
  reserved: string[];
  maxSelectable: number;
  onChange: (seats: string[]) => void;
  /** Optional gender per selected seat — drives colour + icon. */
  genders?: Record<string, SeatGender>;
  /** Optional passenger name per seat — rendered in bold inside the seat. */
  names?: Record<string, string>;
  /** Enlarge cells (used by the admin live map). */
  large?: boolean;
}

export function LayoutSeatMap({ layout, selected, reserved, maxSelectable, onChange, genders = {}, names = {}, large = false }: Props) {
  const rows = Math.max(1, layout.rows || 1);
  const cols = Math.max(1, layout.cols || 1);
  const map = new Map<string, LayoutCell>();
  for (const c of layout.cells) map.set(`${c.row}:${c.col}`, c);

  function toggle(cell: LayoutCell) {
    if (cell.kind !== "seat" || cell.disabled) return;
    const id = seatLabel(cell);
    if (reserved.includes(id)) return;
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
      return;
    }
    if (selected.length >= maxSelectable) {
      toast.warning(
        "لقد قمت باختيار مقعدك أو مقاعدك بالفعل. للتغيير، اضغط على المقعد الذي قمت باختياره لإلغاء اختياره، ثم اختر المقعد الجديد."
      );
      return;
    }
    onChange([...selected, id]);
  }

  return (
    <div className="bg-gradient-to-b from-muted to-white rounded-3xl border-2 border-border p-3 sm:p-5">
      <div
        className="grid gap-1.5 mx-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, maxWidth: cols * (large ? 130 : 60) }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => {
          const r = Math.floor(i / cols) + 1;
          const c = (i % cols) + 1;
          const cell = map.get(`${r}:${c}`);
          if (!cell || cell.kind === "empty") {
            return <div key={i} className="aspect-square" />;
          }
          if (cell.kind !== "seat") {
            const m = KIND_META[cell.kind];
            return (
              <div key={i} className={`aspect-square rounded-lg border-2 text-[10px] font-bold flex items-center justify-center ${m.bg}`} title={m.label}>
                <span>{cell.label || m.icon}</span>
              </div>
            );
          }
          const id = seatLabel(cell);
          const isReserved = reserved.includes(id);
          const isSelected = selected.includes(id);
          const isDisabled = cell.disabled;
          const g = isSelected ? genders[id] : undefined;
          const cls = g === "male"
            ? "bg-sky-600 text-white border-sky-700 shadow scale-105"
            : g === "female"
            ? "bg-pink-500 text-white border-pink-600 shadow scale-105"
            : isDisabled
            ? "bg-neutral-200 text-neutral-400 border-neutral-300 cursor-not-allowed"
            : isReserved
            ? "bg-muted text-muted-foreground border-border cursor-not-allowed opacity-70"
            : isSelected
            ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-red)] scale-105"
            : "bg-white border-border hover:border-primary hover:shadow-md";
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(cell)}
              className={`aspect-square rounded-lg border-2 ${large ? "text-sm" : "text-[11px]"} font-bold flex flex-col items-center justify-center gap-0.5 leading-tight transition-all ${cls}`}
              title={names[id] ? `${id} — ${names[id]}` : id}
            >
              {g === "male" && <Mars className={large ? "h-4 w-4" : "h-3 w-3 mb-0.5"} />}
              {g === "female" && <Venus className={large ? "h-4 w-4" : "h-3 w-3 mb-0.5"} />}
              <span className="font-extrabold">{id}</span>
              {names[id] && (
                <span
                  className={`w-full px-0.5 text-center font-extrabold leading-tight ${large ? "text-[11px]" : "text-[8px]"}`}
                  style={{ overflowWrap: "anywhere" }}
                >
                  {names[id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-md bg-white border-2 border-border" /><span className="text-muted-foreground">متاح</span></div>
        <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-md bg-primary" /><span className="text-muted-foreground">مختار</span></div>
        <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-md bg-muted border-2 border-border" /><span className="text-muted-foreground">محجوز</span></div>
        <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-md bg-neutral-200 border-2 border-neutral-300" /><span className="text-muted-foreground">معطّل</span></div>
        <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-md bg-sky-600" /><span className="text-muted-foreground">ذكر</span></div>
        <div className="flex items-center gap-2"><span className="h-4 w-4 rounded-md bg-pink-500" /><span className="text-muted-foreground">أنثى</span></div>
      </div>
    </div>
  );
}
