import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Save, Trash2, Store, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin-exhibitions")({
  component: AdminExhibitions,
});

interface ExhRow {
  id: string; title: string; description: string | null; image_url: string | null;
  location: string | null; starts_at: string | null; ends_at: string | null;
  active: boolean; display_order: number;
}
interface RegRow {
  id: string; exhibition_id: string; full_name: string; phone: string; notes: string | null; created_at: string;
  exhibitions?: { title: string } | null;
}

function AdminExhibitions() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin","manager"]);
      setOk(!!data && data.length > 0);
    })();
  }, [navigate]);

  const { data: rows = [] } = useQuery({
    queryKey: ["admin-exh"], enabled: ok === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("exhibitions" as never).select("*").order("display_order");
      if (error) throw error;
      return (data as unknown as ExhRow[]) ?? [];
    },
  });
  const { data: regs = [] } = useQuery({
    queryKey: ["admin-exh-regs"], enabled: ok === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("exhibition_registrations" as never).select("*,exhibitions(title)").order("created_at",{ascending:false});
      if (error) throw error;
      return (data as unknown as RegRow[]) ?? [];
    },
  });

  async function add() {
    const title = prompt("عنوان المعرض:");
    if (!title) return;
    const { error } = await supabase.from("exhibitions" as never).insert({ title, active: true, display_order: rows.length } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-exh"] });
  }
  async function save(e: ExhRow) {
    const { error } = await supabase.from("exhibitions" as never).update({
      title: e.title, description: e.description, image_url: e.image_url, location: e.location,
      starts_at: e.starts_at, ends_at: e.ends_at, active: e.active, display_order: e.display_order,
    } as never).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-exh"] });
  }
  async function del(id: string) {
    if (!confirm("حذف المعرض؟")) return;
    await supabase.from("exhibitions" as never).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-exh"] });
  }

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Store className="h-5 w-5" /> إدارة المعارض</h1>
          <div className="flex gap-2">
            <Button size="sm" onClick={add} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة معرض</Button>
            <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
          </div>
        </div>
      </header>
      <main className="container-luxe py-8">
        <Tabs defaultValue="list">
          <TabsList className="bg-white rounded-2xl p-1.5">
            <TabsTrigger value="list" className="rounded-xl"><Store className="h-4 w-4 ml-1" /> المعارض</TabsTrigger>
            <TabsTrigger value="regs" className="rounded-xl"><Users className="h-4 w-4 ml-1" /> التسجيلات ({regs.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-4 space-y-4">
            {rows.length === 0 && <div className="surface-card p-10 text-center text-muted-foreground">لا توجد معارض</div>}
            {rows.map((e) => <ExhEditor key={e.id} row={e} onSave={save} onDelete={() => del(e.id)} />)}
          </TabsContent>
          <TabsContent value="regs" className="mt-4">
            <div className="surface-card p-5">
              <Table>
                <TableHeader><TableRow><TableHead>الاسم</TableHead><TableHead>الجوال</TableHead><TableHead>المعرض</TableHead><TableHead>ملاحظات</TableHead><TableHead>التاريخ</TableHead></TableRow></TableHeader>
                <TableBody>
                  {regs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا توجد تسجيلات</TableCell></TableRow>}
                  {regs.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.full_name}</TableCell>
                      <TableCell dir="ltr">{r.phone}</TableCell>
                      <TableCell>{r.exhibitions?.title ?? "-"}</TableCell>
                      <TableCell className="text-xs">{r.notes}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function ExhEditor({ row, onSave, onDelete }: { row: ExhRow; onSave: (r: ExhRow) => void; onDelete: () => void }) {
  const [local, setLocal] = useState(row);
  useEffect(() => setLocal(row), [row]);
  return (
    <div className="surface-card p-5 grid gap-3 md:grid-cols-4">
      <div className="md:col-span-2"><Label className="text-xs">العنوان</Label><Input value={local.title} onChange={(e) => setLocal({ ...local, title: e.target.value })} /></div>
      <div className="md:col-span-2"><Label className="text-xs">الموقع</Label><Input value={local.location ?? ""} onChange={(e) => setLocal({ ...local, location: e.target.value })} /></div>
      <div className="md:col-span-4"><Label className="text-xs">الوصف</Label><Textarea value={local.description ?? ""} onChange={(e) => setLocal({ ...local, description: e.target.value })} /></div>
      <div className="md:col-span-2"><Label className="text-xs">رابط الصورة</Label><Input value={local.image_url ?? ""} onChange={(e) => setLocal({ ...local, image_url: e.target.value })} /></div>
      <div><Label className="text-xs">يبدأ</Label><Input type="datetime-local" value={local.starts_at?.slice(0,16) ?? ""} onChange={(e) => setLocal({ ...local, starts_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
      <div><Label className="text-xs">ينتهي</Label><Input type="datetime-local" value={local.ends_at?.slice(0,16) ?? ""} onChange={(e) => setLocal({ ...local, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
      <div className="md:col-span-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} /><span className="text-xs">مفعّل</span></div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onDelete} className="rounded-full"><Trash2 className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => onSave(local)} className="rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ</Button>
        </div>
      </div>
    </div>
  );
}
