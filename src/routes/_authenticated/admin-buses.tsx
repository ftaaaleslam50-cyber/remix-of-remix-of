import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, ArrowLeft, Plus, Save, Trash2, Star, GripVertical, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin-buses")({
  component: AdminBuses,
});

interface BusRow {
  id: string; trip_id: string; bus_number: number; capacity: number; active: boolean;
  name: string | null; plate: string | null; model: string | null;
  status: "active" | "disabled" | "maintenance" | "stopped"; priority: number; is_active_booking: boolean;
  blocked_seats: string[] | null; layout: "A" | "B";
  image_url: string | null; bus_type: string | null; details: string | null; price_addition: number;
}
interface TripRow { id: string; name: string; active: boolean; }

function AdminBuses() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [transferFrom, setTransferFrom] = useState<BusRow | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [navigate]);

  const { data: trips = [] } = useQuery({
    queryKey: ["admin-trips"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase.from("trips").select("id,name,active").order("created_at");
      return (data as TripRow[]) ?? [];
    },
  });

  const { data: buses = [] } = useQuery({
    queryKey: ["admin-buses-fleet"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase.from("buses").select("*").order("priority").order("bus_number");
      return (data as unknown as BusRow[]) ?? [];
    },
  });

  const { data: bookingCounts = {} } = useQuery({
    queryKey: ["admin-buses-booking-counts"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("bus_id,seat_numbers").neq("status", "cancelled");
      const map: Record<string, number> = {};
      for (const b of (data ?? []) as { bus_id: string; seat_numbers: string[] }[]) {
        if (!b.bus_id) continue;
        map[b.bus_id] = (map[b.bus_id] ?? 0) + (b.seat_numbers?.length ?? 0);
      }
      return map;
    },
  });

  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => { setOrder(buses.map((b) => b.id)); }, [buses]);
  const orderedBuses = useMemo(() => {
    const byId = new Map(buses.map((b) => [b.id, b]));
    return order.map((id) => byId.get(id)).filter(Boolean) as BusRow[];
  }, [order, buses]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = order.indexOf(String(active.id));
    const newIdx = order.indexOf(String(over.id));
    const next = arrayMove(order, oldIdx, newIdx);
    setOrder(next);
    // persist as priority = index (10-step gaps so hand edits still fit)
    for (let i = 0; i < next.length; i++) {
      await supabase.from("buses").update({ priority: (i + 1) * 10 }).eq("id", next[i]);
    }
    toast.success("تم تحديث الأولوية");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function addBus() {
    if (trips.length === 0) return toast.error("لا توجد رحلات — أنشئ رحلة أولاً");
    const trip = trips[0];
    const next = (buses.filter((b) => b.trip_id === trip.id).reduce((m, b) => Math.max(m, b.bus_number), 0)) + 1;
    const maxPriority = buses.reduce((m, b) => Math.max(m, b.priority ?? 0), 0);
    const { error } = await supabase.from("buses").insert({
      trip_id: trip.id, bus_number: next, capacity: 49, name: `حافلة ${next}`, priority: maxPriority + 10, layout: "A",
    });
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function save(b: BusRow) {
    const { error } = await supabase.from("buses").update({
      name: b.name, plate: b.plate, model: b.model, capacity: b.capacity, status: b.status, priority: b.priority, active: b.status === "active", layout: b.layout,
    }).eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function setActiveBooking(id: string) {
    await supabase.from("buses").update({ is_active_booking: false }).neq("id", id);
    const { error } = await supabase.from("buses").update({ is_active_booking: true }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم تعيينها كحافلة الحجز النشطة");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function del(id: string) {
    if (!confirm("حذف الحافلة؟ لن يمكن التراجع.")) return;
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  if (isAdmin === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Bus className="h-5 w-5" /> إدارة الأسطول</h1>
          <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
        </div>
      </header>
      <main className="container-luxe py-8">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-extrabold">الحافلات ({buses.length})</h2>
              <p className="text-xs text-muted-foreground mt-1">اسحب <GripVertical className="inline h-3 w-3" /> لإعادة ترتيب الأولوية. الأولى في الترتيب تُستخدم أولاً في الحجز.</p>
            </div>
            <Button onClick={addBus} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة حافلة</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="w-6"></TableHead>
                <TableHead>الاسم</TableHead><TableHead>اللوحة</TableHead><TableHead>الطراز</TableHead>
                <TableHead>التخطيط</TableHead>
                <TableHead>السعة</TableHead><TableHead>المحجوز</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>الحجز النشط</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={order} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {orderedBuses.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">لا توجد حافلات</TableCell></TableRow>}
                    {orderedBuses.map((b) => {
                      const used = bookingCounts[b.id] ?? 0;
                      const cap = b.capacity ?? 49;
                      const free = cap - ((b.blocked_seats ?? ["A2"]).length) - used;
                      return (
                        <SortableBusRow
                          key={b.id}
                          bus={b}
                          used={used}
                          free={free}
                          onSave={save}
                          onDelete={() => del(b.id)}
                          onActivate={() => setActiveBooking(b.id)}
                          onTransfer={() => setTransferFrom(b)}
                        />
                      );
                    })}
                  </TableBody>
                </SortableContext>
              </DndContext>
            </Table>
          </div>
        </div>
      </main>

      <TransferDialog
        from={transferFrom}
        buses={buses.filter((b) => b.id !== transferFrom?.id && b.trip_id === transferFrom?.trip_id)}
        onClose={() => setTransferFrom(null)}
        onDone={() => {
          setTransferFrom(null);
          qc.invalidateQueries({ queryKey: ["admin-buses-booking-counts"] });
        }}
      />
    </div>
  );
}

function SortableBusRow({ bus, used, free, onSave, onDelete, onActivate, onTransfer }: {
  bus: BusRow; used: number; free: number;
  onSave: (b: BusRow) => void; onDelete: () => void; onActivate: () => void; onTransfer: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bus.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const [local, setLocal] = useState(bus);
  useEffect(() => setLocal(bus), [bus]);
  const statusBadge = { active: "bg-success", disabled: "bg-muted-foreground", maintenance: "bg-warning", stopped: "bg-destructive" }[local.status];
  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell>
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" aria-label="سحب">
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>
      <TableCell><Input className="h-9 w-32" value={local.name ?? ""} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-28" value={local.plate ?? ""} onChange={(e) => setLocal({ ...local, plate: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-28" value={local.model ?? ""} onChange={(e) => setLocal({ ...local, model: e.target.value })} /></TableCell>
      <TableCell>
        <Select value={local.layout ?? "A"} onValueChange={(v) => {
          const layout = v as "A" | "B";
          setLocal({ ...local, layout, capacity: layout === "B" ? 53 : 49 });
        }}>
          <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="A">A · 49</SelectItem>
            <SelectItem value="B">B · 53 (+F1–F4)</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell><Input type="number" className="h-9 w-20" value={local.capacity} onChange={(e) => setLocal({ ...local, capacity: Number(e.target.value) })} /></TableCell>
      <TableCell><span className={free <= 0 ? "text-destructive font-bold" : "font-semibold"}>{used}/{local.capacity}</span><div className="text-[10px] text-muted-foreground">متبقٍ {free}</div></TableCell>
      <TableCell>
        <Select value={local.status} onValueChange={(v) => setLocal({ ...local, status: v as BusRow["status"] })}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="disabled">معطّلة</SelectItem>
            <SelectItem value="maintenance">صيانة</SelectItem>
            <SelectItem value="stopped">موقوفة</SelectItem>
          </SelectContent>
        </Select>
        <Badge className={`${statusBadge} text-white mt-1`}>{local.status}</Badge>
      </TableCell>
      <TableCell>{bus.is_active_booking ? <Badge className="bg-primary">✓ نشطة</Badge> : <Button size="sm" variant="outline" onClick={onActivate}><Star className="h-3 w-3 ml-1" /> تعيين</Button>}</TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={() => onSave(local)}><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onTransfer} title="نقل الحجوزات"><ArrowRightLeft className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </TableCell>
    </TableRow>
  );
}

function TransferDialog({ from, buses, onClose, onDone }: {
  from: BusRow | null; buses: BusRow[]; onClose: () => void; onDone: () => void;
}) {
  const [targetId, setTargetId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTargetId(""); }, [from?.id]);

  async function run() {
    if (!from || !targetId) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("bookings").update({ bus_id: targetId }).eq("bus_id", from.id).neq("status", "cancelled");
      if (error) throw error;
      toast.success("تم نقل جميع الحجوزات");
      onDone();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : "فشل النقل"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!from} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>نقل الحجوزات من {from?.name || `حافلة ${from?.bus_number}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">اختر الحافلة الهدف لنفس الرحلة. سيتم نقل جميع الحجوزات النشطة.</p>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue placeholder="اختر حافلة الهدف" /></SelectTrigger>
            <SelectContent>
              {buses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}</SelectItem>)}
            </SelectContent>
          </Select>
          {buses.length === 0 && <p className="text-xs text-destructive">لا توجد حافلات أخرى لنفس الرحلة.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={!targetId || busy} onClick={run}>{busy ? "جارٍ النقل..." : "نقل الحجوزات"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
