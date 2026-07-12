import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, Trash2, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin-trips")({
  component: AdminTrips,
});

interface TripRow {
  id: string;
  name: string;
  departure_day: string;
  return_day: string;
  departure_time: string | null;
  return_time: string | null;
  departure_period: string | null;
  return_period: string | null;
  capacity: number;
  active: boolean;
  display_order: number;
}

const PERIODS = [
  { v: "morning", l: "صباحاً" },
  { v: "afternoon", l: "ظهراً" },
  { v: "evening", l: "مساءً" },
  { v: "night", l: "ليلاً" },
];

function AdminTrips() {
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
    queryKey: ["admin-trips-full"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").order("display_order");
      if (error) throw error;
      return (data as unknown as TripRow[]) ?? [];
    },
  });

  async function addTrip() {
    const name = prompt("اسم الرحلة:");
    if (!name) return;
    const { error } = await supabase.from("trips").insert({
      name, departure_day: "", return_day: "", capacity: 49, active: true, display_order: trips.length,
    } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-trips-full"] });
  }
  async function save(t: TripRow) {
    const { error } = await supabase.from("trips").update({
      name: t.name, departure_day: t.departure_day, return_day: t.return_day,
      departure_time: t.departure_time || null, return_time: t.return_time || null,
      departure_period: t.departure_period, return_period: t.return_period,
      capacity: t.capacity, active: t.active, display_order: t.display_order,
    } as never).eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-trips-full"] });
  }
  async function del(id: string) {
    if (!confirm("حذف الرحلة؟")) return;
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-trips-full"] });
  }

  if (isAdmin === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><CalendarClock className="h-5 w-5" /> إدارة الرحلات</h1>
          <div className="flex gap-2">
            <Button size="sm" onClick={addTrip} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة رحلة</Button>
            <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
          </div>
        </div>
      </header>
      <main className="container-luxe py-8 space-y-4">
        {trips.length === 0 && <div className="surface-card p-10 text-center text-muted-foreground">لا توجد رحلات</div>}
        {trips.map((t) => <TripEditor key={t.id} trip={t} onSave={save} onDelete={() => del(t.id)} />)}
      </main>
    </div>
  );
}

function TripEditor({ trip, onSave, onDelete }: { trip: TripRow; onSave: (t: TripRow) => void; onDelete: () => void }) {
  const [local, setLocal] = useState(trip);
  useEffect(() => setLocal(trip), [trip]);
  return (
    <div className="surface-card p-5 grid gap-3 md:grid-cols-6">
      <div className="md:col-span-2"><Label className="text-xs">اسم الرحلة</Label><Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></div>
      <div><Label className="text-xs">يوم المغادرة</Label><Input placeholder="الخميس 15/8" value={local.departure_day} onChange={(e) => setLocal({ ...local, departure_day: e.target.value })} /></div>
      <div><Label className="text-xs">وقت المغادرة</Label><Input type="time" value={local.departure_time ?? ""} onChange={(e) => setLocal({ ...local, departure_time: e.target.value })} /></div>
      <div>
        <Label className="text-xs">فترة المغادرة</Label>
        <Select value={local.departure_period ?? ""} onValueChange={(v) => setLocal({ ...local, departure_period: v })}>
          <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
          <SelectContent>{PERIODS.map(p => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">السعة</Label><Input type="number" value={local.capacity} onChange={(e) => setLocal({ ...local, capacity: Number(e.target.value) })} /></div>
      <div><Label className="text-xs">يوم العودة</Label><Input placeholder="السبت 17/8" value={local.return_day} onChange={(e) => setLocal({ ...local, return_day: e.target.value })} /></div>
      <div><Label className="text-xs">وقت العودة</Label><Input type="time" value={local.return_time ?? ""} onChange={(e) => setLocal({ ...local, return_time: e.target.value })} /></div>
      <div>
        <Label className="text-xs">فترة العودة</Label>
        <Select value={local.return_period ?? ""} onValueChange={(v) => setLocal({ ...local, return_period: v })}>
          <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
          <SelectContent>{PERIODS.map(p => <SelectItem key={p.v} value={p.v}>{p.l}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">الترتيب</Label><Input type="number" value={local.display_order} onChange={(e) => setLocal({ ...local, display_order: Number(e.target.value) })} /></div>
      <div className="flex items-end gap-2">
        <div className="flex items-center gap-2"><Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} /><span className="text-xs">مفعّلة</span></div>
      </div>
      <div className="md:col-span-6 flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDelete} className="rounded-full"><Trash2 className="h-4 w-4" /></Button>
        <Button size="sm" onClick={() => onSave(local)} className="rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ</Button>
      </div>
    </div>
  );
}
