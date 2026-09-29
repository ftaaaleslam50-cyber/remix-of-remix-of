import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";

export interface BusOption {
  id: string;
  name: string | null;
  bus_number: number;
  capacity?: number;
  assigned_date?: string | null;
  direction?: string | null;
  /** undefined = لا تظهر علامة الارتباط */
  linked?: boolean;
}

/** التاريخ بصيغة عربية مختصرة (ميلادي) */
export function busDateLabel(iso?: string | null) {
  if (!iso) return "بدون تاريخ";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function busOptionLabel(b: BusOption) {
  return `${b.name || `حافلة ${b.bus_number}`} — ${busDateLabel(b.assigned_date)}${b.linked === undefined ? "" : b.linked ? " — مرتبطة" : " — غير مرتبطة"}`;
}

/** فلتر حافلات باختيار متعدد مع عرض تاريخ كل حافلة */
export function BusMultiSelect({
  buses,
  value,
  onChange,
  placeholder = "— كل الحافلات —",
}: {
  buses: BusOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const selected = buses.filter((b) => value.includes(b.id));
  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? busOptionLabel(selected[0]!)
        : `${selected.length} حافلات مختارة`;

  function toggle(id: string, on: boolean) {
    onChange(on ? [...value, id] : value.filter((x) => x !== id));
  }

  const byDate = (a: BusOption, b: BusOption) =>
    (a.assigned_date ?? "9999-12-31").localeCompare(b.assigned_date ?? "9999-12-31") || a.bus_number - b.bus_number;
  const outbound = buses.filter((b) => b.direction !== "return").sort(byDate);
  const returning = buses.filter((b) => b.direction === "return").sort(byDate);
  const renderBus = (b: BusOption) => (
    <label key={b.id} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted cursor-pointer">
      <Checkbox checked={value.includes(b.id)} onCheckedChange={(v) => toggle(b.id, !!v)} />
      <span className="text-xs">
        <span className="font-bold">{b.name || `حافلة ${b.bus_number}`}</span>
        <span className="text-muted-foreground"> — {busDateLabel(b.assigned_date)}</span>
        {b.capacity ? <span className="text-muted-foreground"> — سعة {b.capacity}</span> : null}
        {b.linked !== undefined && (
          <span className={b.linked ? "text-success font-bold" : "text-destructive font-bold"}> — {b.linked ? "مرتبطة" : "غير مرتبطة"}</span>
        )}
      </span>
    </label>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full rounded-md px-3 text-sm bg-background flex items-center justify-between gap-2 text-right font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2 max-h-72 overflow-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold">اختر حافلة أو أكثر</span>
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => onChange([])}>
            مسح
          </Button>
        </div>
        {buses.length === 0 && <div className="text-xs text-muted-foreground p-2">لا توجد حافلات</div>}
        <div className="space-y-1">
          {outbound.length > 0 && <div className="px-1.5 pb-1 text-xs font-bold text-muted-foreground">حافلات الذهاب</div>}
          {outbound.map(renderBus)}
          {outbound.length > 0 && returning.length > 0 && <div role="separator" className="my-2 border-t border-border" />}
          {returning.length > 0 && <div className="px-1.5 pb-1 text-xs font-bold text-muted-foreground">حافلات العودة</div>}
          {returning.map(renderBus)}
        </div>
      </PopoverContent>
    </Popover>
  );
}
