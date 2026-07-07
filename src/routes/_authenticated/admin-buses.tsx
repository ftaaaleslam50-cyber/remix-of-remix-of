import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bus, ArrowLeft, Plus, Save, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin-buses")({
  component: AdminBuses,
});

interface BusRow {
  id: string; trip_id: string; bus_number: number; capacity: number; active: boolean;
  name: string | null; plate: string | null; model: string | null;
  status: "active" | "disabled" | "maintenance" | "stopped"; priority: number; is_active_booking: boolean;
}
interface TripRow { id: string; name: string; active: boolean; }

function AdminBuses() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

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
      const { data } = await supabase.from("buses").select("*").order("priority");
      return (data as unknown as BusRow[]) ?? [];
    },
  });

  async function addBus() {
    if (trips.length === 0) return toast.error("لا توجد رحلات — أنشئ رحلة أولاً");
    const trip = trips[0];
    const next = (buses.filter((b) => b.trip_id === trip.id).reduce((m, b) => Math.max(m, b.bus_number), 0)) + 1;
    const { error } = await supabase.from("buses").insert({
      trip_id: trip.id, bus_number: next, capacity: 49, name: `حافلة ${next}`, priority: 100,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    qc.invalidateQueries({ queryKey: ["admin-buses-fleet"] });
  }

  async function save(b: BusRow) {
    const { error } = await supabase.from("buses").update({
      name: b.name, plate: b.plate, model: b.model, capacity: b.capacity, status: b.status, priority: b.priority, active: b.status === "active",
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
            <h2 className="text-lg font-extrabold">الحافلات ({buses.length})</h2>
            <Button onClick={addBus} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة حافلة</Button>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>الاسم</TableHead><TableHead>اللوحة</TableHead><TableHead>الطراز</TableHead>
                <TableHead>السعة</TableHead><TableHead>الحالة</TableHead><TableHead>الأولوية</TableHead>
                <TableHead>الحجز النشط</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {buses.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">لا توجد حافلات</TableCell></TableRow>}
                {buses.map((b) => <BusRowEditor key={b.id} bus={b} onSave={save} onDelete={() => del(b.id)} onActivate={() => setActiveBooking(b.id)} />)}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}

function BusRowEditor({ bus, onSave, onDelete, onActivate }: { bus: BusRow; onSave: (b: BusRow) => void; onDelete: () => void; onActivate: () => void }) {
  const [local, setLocal] = useState(bus);
  useEffect(() => setLocal(bus), [bus]);
  const statusBadge = { active: "bg-success", disabled: "bg-muted-foreground", maintenance: "bg-warning", stopped: "bg-destructive" }[local.status];
  return (
    <TableRow>
      <TableCell><Input className="h-9 w-32" value={local.name ?? ""} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-28" value={local.plate ?? ""} onChange={(e) => setLocal({ ...local, plate: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-28" value={local.model ?? ""} onChange={(e) => setLocal({ ...local, model: e.target.value })} /></TableCell>
      <TableCell><Input type="number" className="h-9 w-20" value={local.capacity} onChange={(e) => setLocal({ ...local, capacity: Number(e.target.value) })} /></TableCell>
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
      <TableCell><Input type="number" className="h-9 w-16" value={local.priority} onChange={(e) => setLocal({ ...local, priority: Number(e.target.value) })} /></TableCell>
      <TableCell>{bus.is_active_booking ? <Badge className="bg-primary">✓ نشطة</Badge> : <Button size="sm" variant="outline" onClick={onActivate}><Star className="h-3 w-3 ml-1" /> تعيين</Button>}</TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={() => onSave(local)}><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </TableCell>
    </TableRow>
  );
}
