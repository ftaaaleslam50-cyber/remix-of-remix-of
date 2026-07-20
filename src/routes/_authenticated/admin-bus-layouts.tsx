import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout, ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin-bus-layouts")({
  component: AdminBusLayouts,
});

type CellKind = "seat" | "empty" | "driver" | "door" | "restroom";

interface Cell {
  row: number;
  col: number;
  kind: CellKind;
  label?: string;
}

interface LayoutJson {
  rows: number;
  cols: number;
  cells: Cell[];
}

interface LayoutRow {
  id: string;
  name: string;
  seat_count: number;
  layout_json: LayoutJson;
}

const KIND_CYCLE: CellKind[] = ["empty", "seat", "driver", "door", "restroom"];

const KIND_STYLE: Record<CellKind, { bg: string; label: string; icon: string }> = {
  empty: {
    bg: "bg-muted/40 border-dashed",
    label: "فراغ",
    icon: "·",
  },
  seat: {
    bg: "bg-primary/15 border-primary/60",
    label: "مقعد",
    icon: "🪑",
  },
  driver: {
    bg: "bg-amber-100 border-amber-500",
    label: "سائق",
    icon: "🚍",
  },
  door: {
    bg: "bg-blue-100 border-blue-500",
    label: "باب",
    icon: "🚪",
  },
  restroom: {
    bg: "bg-emerald-100 border-emerald-500",
    label: "دورة مياه",
    icon: "🚻",
  },
};

function AdminBusLayouts() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [editing, setEditing] = useState<LayoutRow | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate({ to: "/auth" });
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!data);
    })();
  }, [navigate]);

  const { data: layouts = [] } = useQuery({
    queryKey: ["bus-layouts-admin"],
    enabled: isAdmin === true,

    queryFn: async () => {
      const { data } = await supabase.from("bus_layouts").select("*").order("created_at", { ascending: false });

      return (data as unknown as LayoutRow[]) ?? [];
    },
  });

  async function add() {
    const name = prompt("اسم القالب:");

    if (!name) return;

    const empty: LayoutJson = {
      rows: 12,
      cols: 5,
      cells: [],
    };

    const { error } = await supabase.from("bus_layouts").insert({
      name,
      seat_count: 0,
      layout_json: empty as never,
    } as never);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم الإنشاء");

    qc.invalidateQueries({
      queryKey: ["bus-layouts-admin"],
    });
  }

  async function del(id: string) {
    if (!confirm("حذف القالب؟")) return;

    const { error } = await supabase.from("bus_layouts").delete().eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    qc.invalidateQueries({
      queryKey: ["bus-layouts-admin"],
    });
  }

  if (isAdmin === false) {
    return <div className="p-8 text-center">ليس لديك صلاحية</div>;
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <Layout className="h-5 w-5" />
            تخطيطات الحافلات
          </h1>

          <div className="flex gap-2">
            <Button size="sm" onClick={add} className="rounded-full">
              <Plus className="h-4 w-4 ml-1" />
              قالب جديد
            </Button>

            <Link to="/admin-buses">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 ml-1" />
                الأسطول
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container-luxe py-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {layouts.length === 0 && (
          <div className="surface-card p-10 text-center text-muted-foreground md:col-span-2 lg:col-span-3">
            لا توجد قوالب بعد.
          </div>
        )}

        {layouts.map((l) => (
          <div key={l.id} className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-bold">{l.name}</div>

                <div className="text-xs text-muted-foreground">{l.seat_count} مقعد</div>
              </div>

              <div className="flex gap-1">
                <Button size="sm" onClick={() => setEditing(l)}>
                  تحرير
                </Button>

                <Button size="sm" variant="outline" onClick={() => del(l.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <MiniPreview layout={l.layout_json} />
          </div>
        ))}
      </main>

      <LayoutEditor
        layout={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);

          qc.invalidateQueries({
            queryKey: ["bus-layouts-admin"],
          });
        }}
      />
    </div>
  );
}

function MiniPreview({ layout }: { layout: LayoutJson }) {
  const map = new Map<string, Cell>();

  for (const c of layout.cells) {
    map.set(`${c.row}:${c.col}`, c);
  }

  return (
    <div
      className="grid gap-0.5 bg-muted/30 p-2 rounded-lg"
      style={{
        gridTemplateColumns: `repeat(${layout.cols || 1}, minmax(0,1fr))`,
      }}
    >
      {Array.from({
        length: (layout.rows || 1) * (layout.cols || 1),
      }).map((_, i) => {
        const r = Math.floor(i / layout.cols) + 1;

        const c = (i % layout.cols) + 1;

        const cell = map.get(`${r}:${c}`);

        const kind = cell?.kind ?? "empty";

        return (
          <div
            key={i}
            className={`aspect-square rounded text-[8px] flex items-center justify-center border ${KIND_STYLE[kind].bg}`}
          >
            {cell?.label || (kind === "seat" ? KIND_STYLE.seat.icon : "")}
          </div>
        );
      })}
    </div>
  );
}

function LayoutEditor({
  layout,
  onClose,
  onSaved,
}: {
  layout: LayoutRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState(12);
  const [cols, setCols] = useState(5);

  const [cells, setCells] = useState<Map<string, Cell>>(new Map());

  const [brush, setBrush] = useState<CellKind>("seat");

  const [autoNumber, setAutoNumber] = useState(true);

  useEffect(() => {
    if (!layout) return;

    setName(layout.name);

    setRows(layout.layout_json.rows || 12);

    setCols(layout.layout_json.cols || 5);

    const m = new Map<string, Cell>();

    for (const c of layout.layout_json.cells) {
      m.set(`${c.row}:${c.col}`, c);
    }

    setCells(m);
  }, [layout]);

  /*
   * عدد المقاعد الحقيقي.
   *
   * يتم احتساب الخلايا من نوع seat فقط.
   *
   * لا يتم احتساب:
   * - السائق
   * - الأبواب
   * - دورة المياه
   * - الفراغات
   */
  const seatCount = useMemo(() => Array.from(cells.values()).filter((cell) => cell.kind === "seat").length, [cells]);

  function paint(r: number, c: number) {
    const key = `${r}:${c}`;

    const next = new Map(cells);

    const existing = next.get(key);

    if (existing?.kind === brush) {
      next.delete(key);
    } else {
      next.set(key, {
        row: r,
        col: c,
        kind: brush,
        label: existing?.label,
      });
    }

    setCells(next);
  }

  function relabel(r: number, c: number) {
    const key = `${r}:${c}`;

    const existing = cells.get(key);

    if (!existing) return;

    const lbl = prompt("رقم/اسم الخلية:", existing.label ?? "");

    if (lbl === null) return;

    const next = new Map(cells);

    next.set(key, {
      ...existing,
      label: lbl || undefined,
    });

    setCells(next);
  }

  function autoNumberSeats() {
    const seats = Array.from(cells.values())
      .filter((cell) => cell.kind === "seat")
      .sort((a, b) => a.row - b.row || a.col - b.col);

    const next = new Map(cells);

    seats.forEach((seat, index) => {
      next.set(`${seat.row}:${seat.col}`, {
        ...seat,
        label: String(index + 1),
      });
    });

    setCells(next);
  }

  async function save() {
    if (!layout) return;

    /*
     * نعمل على نسخة مستقلة من الخلايا
     * حتى لا نعتمد على تحديث React غير الفوري
     */
    const nextCells = new Map(cells);

    /*
     * ترقيم المقاعد فقط
     */
    if (autoNumber) {
      const seats = Array.from(nextCells.values())
        .filter((cell) => cell.kind === "seat")
        .sort((a, b) => a.row - b.row || a.col - b.col);

      seats.forEach((seat, index) => {
        nextCells.set(`${seat.row}:${seat.col}`, {
          ...seat,
          label: String(index + 1),
        });
      });
    }

    /*
     * مصدر الحقيقة الوحيد لعدد المقاعد:
     *
     * kind === "seat"
     *
     * لذلك:
     * driver  لا يحسب
     * door    لا يحسب
     * restroom لا يحسب
     * empty   لا يحسب
     */
    const passengerSeatCount = Array.from(nextCells.values()).filter((cell) => cell.kind === "seat").length;

    const json: LayoutJson = {
      rows,
      cols,
      cells: Array.from(nextCells.values()),
    };

    const { error } = await supabase
      .from("bus_layouts")
      .update({
        name,
        seat_count: passengerSeatCount,
        layout_json: json as never,
      } as never)
      .eq("id", layout.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(`تم الحفظ — ${passengerSeatCount} مقعد`);

    onSaved();
  }

  return (
    <Dialog open={!!layout} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>محرر التخطيط · {seatCount} مقعد</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>الاسم</Label>

            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div>
            <Label>الصفوف</Label>

            <Input
              type="number"
              min={1}
              max={40}
              value={rows}
              onChange={(e) => setRows(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <div>
            <Label>الأعمدة</Label>

            <Input
              type="number"
              min={1}
              max={10}
              value={cols}
              onChange={(e) => setCols(Math.max(1, Number(e.target.value)))}
            />
          </div>

          <div className="md:col-span-2">
            <Label>الأداة الحالية</Label>

            <Select value={brush} onValueChange={(v) => setBrush(v as CellKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {KIND_CYCLE.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_STYLE[k].icon} {KIND_STYLE[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2 flex items-end gap-2">
            <Button variant="outline" onClick={autoNumberSeats}>
              ترقيم تلقائي
            </Button>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoNumber} onChange={(e) => setAutoNumber(e.target.checked)} />
              ترقيم عند الحفظ
            </label>
          </div>
        </div>

        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-2">
            اضغط على أي خلية لتطبيق الأداة. اضغط مرتين على خلية لتعديل الرقم/الاسم.
          </div>

          <div
            className="grid gap-1 p-3 bg-muted/40 rounded-2xl mx-auto"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`,
              maxWidth: cols * 60,
            }}
          >
            {Array.from({
              length: rows * cols,
            }).map((_, i) => {
              const r = Math.floor(i / cols) + 1;

              const c = (i % cols) + 1;

              const cell = cells.get(`${r}:${c}`);

              const kind = cell?.kind ?? "empty";

              return (
                <button
                  key={i}
                  onClick={() => paint(r, c)}
                  onDoubleClick={() => relabel(r, c)}
                  className={`aspect-square rounded-lg text-[11px] font-bold border-2 flex items-center justify-center transition-all ${KIND_STYLE[kind].bg} hover:scale-105`}
                >
                  {cell?.label || (kind !== "empty" ? KIND_STYLE[kind].icon : "")}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>

          <Button onClick={save}>
            <Save className="h-4 w-4 ml-1" />
            حفظ ({seatCount} مقعد)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
