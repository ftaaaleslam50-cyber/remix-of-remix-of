import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ArrowLeft, Search, Save, Trash2, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin-users")({
  component: AdminUsers,
});

interface ProfileRow {
  id: string; full_name: string | null; mobile_phone: string | null; whatsapp_phone: string | null;
  national_id: string | null; account_type: "customer" | "representative";
  active: boolean; last_login_at: string | null; created_at: string;
}

function AdminUsers() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "customer" | "representative">("all");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).in("role", ["admin","user_manager"]);
      setIsAdmin(!!data && data.length > 0);
    })();
  }, [navigate]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-profiles"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ProfileRow[]) ?? [];
    },
  });

  const filtered = profiles.filter((p) => {
    if (typeFilter !== "all" && p.account_type !== typeFilter) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return (p.full_name ?? "").toLowerCase().includes(s) || (p.mobile_phone ?? "").includes(s) || (p.national_id ?? "").includes(s);
  });

  async function save(p: ProfileRow) {
    const { error } = await supabase.from("profiles").update({
      full_name: p.full_name, mobile_phone: p.mobile_phone, whatsapp_phone: p.whatsapp_phone,
      national_id: p.national_id, account_type: p.account_type, active: p.active,
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  }

  async function toggleActive(p: ProfileRow) {
    await supabase.from("profiles").update({ active: !p.active }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  }

  async function del(p: ProfileRow) {
    if (!confirm(`حذف الملف الشخصي للمستخدم ${p.full_name}؟`)) return;
    const { error } = await supabase.from("profiles").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-profiles"] });
  }

  if (isAdmin === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Users className="h-5 w-5" /> إدارة المستخدمين</h1>
          <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
        </div>
      </header>
      <main className="container-luxe py-8">
        <div className="surface-card p-6">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input dir="rtl" className="pr-10" placeholder="بحث بالاسم/الجوال/الهوية" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="customer">عملاء</SelectItem>
                <SelectItem value="representative">مندوبون</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline">{filtered.length} مستخدم</Badge>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>الاسم</TableHead><TableHead>الجوال</TableHead><TableHead>واتساب</TableHead>
                <TableHead>الهوية</TableHead><TableHead>النوع</TableHead><TableHead>الحالة</TableHead>
                <TableHead>آخر دخول</TableHead><TableHead>التسجيل</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">لا يوجد مستخدمون</TableCell></TableRow>}
                {filtered.map((p) => <UserRowEditor key={p.id} profile={p} onSave={save} onDelete={() => del(p)} onToggle={() => toggleActive(p)} />)}
              </TableBody>
            </Table>
          </div>
        </div>
      </main>
    </div>
  );
}

function UserRowEditor({ profile, onSave, onDelete, onToggle }: { profile: ProfileRow; onSave: (p: ProfileRow) => void; onDelete: () => void; onToggle: () => void }) {
  const [local, setLocal] = useState(profile);
  useEffect(() => setLocal(profile), [profile]);
  return (
    <TableRow>
      <TableCell><Input className="h-9 w-36" value={local.full_name ?? ""} onChange={(e) => setLocal({ ...local, full_name: e.target.value })} /></TableCell>
      <TableCell><Input dir="ltr" className="h-9 w-32" value={local.mobile_phone ?? ""} onChange={(e) => setLocal({ ...local, mobile_phone: e.target.value })} /></TableCell>
      <TableCell><Input dir="ltr" className="h-9 w-32" value={local.whatsapp_phone ?? ""} onChange={(e) => setLocal({ ...local, whatsapp_phone: e.target.value })} /></TableCell>
      <TableCell><Input dir="ltr" className="h-9 w-32" value={local.national_id ?? ""} onChange={(e) => setLocal({ ...local, national_id: e.target.value })} /></TableCell>
      <TableCell>
        <Select value={local.account_type} onValueChange={(v) => setLocal({ ...local, account_type: v as ProfileRow["account_type"] })}>
          <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">عميل</SelectItem>
            <SelectItem value="representative">مندوب</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>{local.active ? <Badge className="bg-success">نشط</Badge> : <Badge variant="outline">موقوف</Badge>}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{local.last_login_at ? formatDate(local.last_login_at) : "—"}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{formatDate(local.created_at)}</TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={() => onSave(local)}><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={onToggle}>{local.active ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}</Button>
        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </TableCell>
    </TableRow>
  );
}
