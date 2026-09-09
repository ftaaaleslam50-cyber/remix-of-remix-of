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
}

/** التاريخ بصيغة عربية مختصرة (ميلادي) */
export function busDateLabel(iso?: string | null) {
  if (!iso) return "بدون تاريخ";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function busOptionLabel(b: BusOption) {
  return `${b.name || `حافلة ${b.bus_number}`} — ${busDateLabel(b.assigned_date)}`;
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-10 w-full rounded-md border px-3 text-sm bg-white flex items-center justify-between gap-2 text-right"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </button>
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
          {buses.map((b) => (
            <label key={b.id} className="flex items-center gap-2 rounded-md p-1.5 hover:bg-muted cursor-pointer">
              <Checkbox checked={value.includes(b.id)} onCheckedChange={(v) => toggle(b.id, !!v)} />
              <span className="text-xs">
                <span className="font-bold">{b.name || `حافلة ${b.bus_number}`}</span>
                <span className="text-muted-foreground"> — {busDateLabel(b.assigned_date)}</span>
                {b.capacity ? <span className="text-muted-foreground"> — سعة {b.capacity}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
