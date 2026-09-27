// اسم العميل في الحجز اليدوي: بحث تلقائي في قاعدة العملاء مع خيار «عميل جديد».
import { useEffect, useRef, useState } from "react";
import { UserPlus, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchCustomers, type TravelCustomer } from "@/lib/customers";

export function CustomerCombobox({ value, onChange, onPick, onNew, className, selected }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (c: TravelCustomer) => void;
  onNew: () => void;
  className?: string;
  selected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<TravelCustomer[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !value.trim()) { setRows([]); return; }
    const t = setTimeout(() => {
      searchCustomers(value, 8).then((r) => setRows(r.rows)).catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [value, open]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={box} className="relative">
      <Input
        className={className}
        value={value}
        placeholder="ابحث عن عميل محفوظ…"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
      />
      {selected && <UserCheck className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-success" aria-label="عميل محفوظ" />}
      {open && value.trim() && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-xl border bg-popover shadow-lg max-h-64 overflow-auto text-xs">
          {rows.map((c) => (
            <button key={c.id} type="button" className="w-full text-right px-3 py-2 hover:bg-muted border-b last:border-0"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(c); setOpen(false); }}>
              <div className="font-bold">{c.full_name}</div>
              <div className="text-muted-foreground" dir="ltr">{c.id_number} · {c.contact_phone}</div>
            </button>
          ))}
          <button type="button" className="w-full text-right px-3 py-2 hover:bg-muted flex items-center gap-1 font-semibold text-primary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onNew(); setOpen(false); }}>
            <UserPlus className="h-3.5 w-3.5" /> عميل جديد «{value.trim()}»
          </button>
        </div>
      )}
    </div>
  );
}
