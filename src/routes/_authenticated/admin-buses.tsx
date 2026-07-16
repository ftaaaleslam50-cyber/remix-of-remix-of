import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, ArrowLeft, Plus, Save, Trash2, Copy, ArrowRightLeft, Layout } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AssetField } from "@/components/admin/AssetField";
import { trackAssetUsage, untrackAssetUsage } from "@/lib/asset-usage";

export const Route = createFileRoute("/_authenticated/admin-buses")({
  component: AdminBuses,
});

interface BusRow {
  id: string; trip_id: string | null; bus_number: number; capacity: number; active: boolean;
  name: string | null; plate: string | null; model: string | null;
  status: "active" | "maintenance" | "stopped";
  blocked_seats: string[] | null; layout: "A" | "B" | null; layout_id: string | null;
  image_url: string | null; bus_type: string | null; details: string | null; price_addition: number;
}
interface LayoutRow { id: string; name: string; seat_count: number; }

const STATUS_LABEL: Record<BusRow["status"], string> = {
  active: "نشطة",
  maintenance: "قيد الصيانة",
  stopped: "خارج الخدمة",
};
const STATUS_COLOR: Record<BusRow["status"], string> = {
  active: "bg-success",
  maintenance: "bg-warning",
  stopped: "bg-destructive",
};

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

  const { data: buses = [] } = useQuery({
    queryKey: ["admin-buses-fleet"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase.from("buses").select("*").order("bus_number");
      return (data as unknown as BusRow[]) ?? [];
    },
  });

  const { data: layouts = [] } = useQuery({
    queryKey: ["bus-layouts"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data } = await supabase.from("bus_layouts").select("id,name,seat_count").order("name");
      return (data as unknown as LayoutRow[]) ?? [];
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

  async function addBus() {
    const next = buses.reduce((m, b) => Math.max(m, b.bus_number), 0) + 1;
    const { error } = await supabase.from("buses").insert({
      bus_number: next, capacity: 49, name: `حافلة ${next}`, layout: "A", status: "active", active: true,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function duplicateBus(b: BusRow) {
    const next = buses.reduce((m, x) => Math.max(m, x.bus_number), 0) + 1;
    const { error } = await supabase.from("buses").insert({
      bus_number: next,
      name: (b.name ? `${b.name} (نسخة)` : `حافلة ${next}`),
      plate: null,
      model: b.model, bus_type: b.bus_type, details: b.details,
      capacity: b.capacity, layout: b.layout, layout_id: b.layout_id,
      image_url: b.image_url, price_addition: b.price_addition,
      status: "active", active: true, trip_id: b.trip_id,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("تم النسخ");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function save(b: BusRow) {
    const patch: Record<string, unknown> = {
      name: b.name, plate: b.plate, model: b.model, capacity: b.capacity,
      status: b.status, active: b.status === "active", layout: b.layout, layout_id: b.layout_id,
      image_url: b.image_url, bus_type: b.bus_type, details: b.details,
      price_addition: Number(b.price_addition) || 0,
    };
    // Sync capacity from selected layout template
    if (b.layout_id) {
      const lay = layouts.find((l) => l.id === b.layout_id);
      if (lay) patch.capacity = lay.seat_count || b.capacity;
    }
    const { error } = await supabase.from("buses").update(patch as never).eq("id", b.id);
    if (error) return toast.error(error.message);
    await trackAssetUsage(b.image_url, "bus", b.id);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function del(id: string) {
    const used = bookingCounts[id] ?? 0;
    if (used > 0) {
      if (!confirm(`لا يمكن حذف الحافلة نهائياً لأنها مرتبطة بـ ${used} حجز. هل تريد أرشفتها (إيقافها عن الاستخدام مع الاحتفاظ بالسجلات)؟`)) return;
      const { error } = await supabase.from("buses").update({ status: "stopped", active: false } as never).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success("تمت أرشفة الحافلة");
      qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
      return;
    }
    if (!confirm("حذف الحافلة نهائياً؟ لن يمكن التراجع.")) return;
    const { error } = await supabase.from("buses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await untrackAssetUsage("bus", id);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  if (isAdmin === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Bus className="h-5 w-5" /> إدارة الأسطول</h1>
          <div className="flex gap-2">
            <Link to="/admin-bus-layouts"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><Layout className="h-4 w-4 ml-1" /> تخطيطات الحافلات</Button></Link>
            <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
          </div>
        </div>
      </header>
      <main className="container-luxe py-8">
        <div className="surface-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-extrabold">الحافلات ({buses.length})</h2>
            <Button onClick={addBus} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة حافلة</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>الاسم</TableHead><TableHead>اللوحة</TableHead><TableHead>الطراز</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>القالب</TableHead>
                <TableHead>السعة</TableHead><TableHead>المحجوز</TableHead>
                <TableHead>+سعر</TableHead>
                <TableHead>صورة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {buses.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">لا توجد حافلات</TableCell></TableRow>}
                {buses.map((b) => (
                  <BusEditRow
                    key={b.id}
                    bus={b}
                    used={bookingCounts[b.id] ?? 0}
                    layouts={layouts}
                    onSave={save}
                    onDelete={() => del(b.id)}
                    onDuplicate={() => duplicateBus(b)}
                    onTransfer={() => setTransferFrom(b)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>

      <TransferDialog
        from={transferFrom}
        buses={buses.filter((b) => b.id !== transferFrom?.id)}
        onClose={() => setTransferFrom(null)}
        onDone={() => {
          setTransferFrom(null);
          qc.invalidateQueries({ queryKey: ["admin-buses-booking-counts"] });
        }}
      />
    </div>
  );
}

function BusEditRow({ bus, used, layouts, onSave, onDelete, onDuplicate, onTransfer }: {
  bus: BusRow; used: number; layouts: LayoutRow[];
  onSave: (b: BusRow) => void; onDelete: () => void; onDuplicate: () => void; onTransfer: () => void;
}) {
  const [local, setLocal] = useState(bus);
  useEffect(() => setLocal(bus), [bus]);
  const free = local.capacity - used;
  return (
    <TableRow>
      <TableCell><Input className="h-9 w-32" value={local.name ?? ""} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-28" value={local.plate ?? ""} onChange={(e) => setLocal({ ...local, plate: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-28" value={local.model ?? ""} onChange={(e) => setLocal({ ...local, model: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-24" placeholder="VIP/عادية" value={local.bus_type ?? ""} onChange={(e) => setLocal({ ...local, bus_type: e.target.value })} /></TableCell>
      <TableCell>
        <Select
          value={local.layout_id ?? "__none"}
          onValueChange={(v) => {
            const id = v === "__none" ? null : v;
            const lay = layouts.find((l) => l.id === id);
            setLocal({ ...local, layout_id: id, capacity: lay?.seat_count ?? local.capacity });
          }}
        >
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">— بدون قالب —</SelectItem>
            {layouts.map((l) => <SelectItem key={l.id} value={l.id}>{l.name} ({l.seat_count})</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell><Input type="number" className="h-9 w-20" value={local.capacity} onChange={(e) => setLocal({ ...local, capacity: Number(e.target.value) })} /></TableCell>
      <TableCell><span className={free <= 0 ? "text-destructive font-bold" : "font-semibold"}>{used}/{local.capacity}</span><div className="text-[10px] text-muted-foreground">متبقٍ {free}</div></TableCell>
      <TableCell><Input type="number" className="h-9 w-24" value={local.price_addition ?? 0} onChange={(e) => setLocal({ ...local, price_addition: Number(e.target.value) })} /></TableCell>
      <TableCell>
        <AssetField
          compact
          value={local.image_url}
          onChange={(url) => setLocal({ ...local, image_url: url })}
        />
      </TableCell>
      <TableCell>
        <Select value={local.status} onValueChange={(v) => setLocal({ ...local, status: v as BusRow["status"] })}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="maintenance">قيد الصيانة</SelectItem>
            <SelectItem value="stopped">خارج الخدمة</SelectItem>
          </SelectContent>
        </Select>
        <Badge className={`${STATUS_COLOR[local.status]} text-white mt-1`}>{STATUS_LABEL[local.status]}</Badge>
      </TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={() => onSave(local)} title="حفظ"><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onDuplicate} title="نسخ"><Copy className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onTransfer} title="نقل الحجوزات"><ArrowRightLeft className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onDelete} title="حذف"><Trash2 className="h-3 w-3" /></Button>
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
          <p className="text-sm text-muted-foreground">اختر الحافلة الهدف. سيتم نقل جميع الحجوزات النشطة.</p>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue placeholder="اختر حافلة الهدف" /></SelectTrigger>
            <SelectContent>
              {buses.map((b) => <SelectItem key={b.id} value={b.id}>{b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={!targetId || busy} onClick={run}>{busy ? "جارٍ النقل..." : "نقل الحجوزات"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
