// إدارة المناديب: أسماء + أرقام الجوال والواتساب، تُستخدم للتعبئة التلقائية في الحجز اليدوي.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Save, Trash2, UserCog } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface RepRow {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  notes: string | null;
  active: boolean;
  display_order: number;
}

export function useRepresentatives() {
  return useQuery({
    queryKey: ["representatives"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("representatives")
        .select("id,name,phone,whatsapp,notes,active,display_order")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data as RepRow[]) ?? [];
    },
    staleTime: 60_000,
  });
}

export function RepresentativesTab() {
  const qc = useQueryClient();
  const { data: reps = [], isLoading } = useRepresentatives();
  const [draft, setDraft] = useState<{ name: string; phone: string; whatsapp: string; notes: string } | null>(null);

  async function addRep() {
    if (!draft?.name.trim()) return toast.error("اكتب اسم المندوب");
    const { error } = await supabase.from("representatives").insert({
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      whatsapp: (draft.whatsapp.trim() || draft.phone.trim()),
      notes: draft.notes.trim() || null,
      display_order: reps.length,
    });
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة المندوب");
    setDraft(null);
    qc.invalidateQueries({ queryKey: ["representatives"] });
  }

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h3 className="font-bold flex items-center gap-2">
          <UserCog className="h-5 w-5" /> المناديب
          <Badge variant="outline">{reps.length}</Badge>
        </h3>
        <Button size="sm" onClick={() => setDraft({ name: "", phone: "", whatsapp: "", notes: "" })}>
          <Plus className="h-4 w-4 ml-1" /> مندوب جديد
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        عند اختيار اسم المندوب في الحجز اليدوي سيتم تعبئة رقم الجوال والواتساب تلقائياً.
      </p>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>واتساب</TableHead>
              <TableHead>ملاحظات</TableHead>
              <TableHead>مفعّل</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft && (
              <TableRow className="bg-muted/40">
                <TableCell>
                  <Input className="h-9" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="اسم المندوب" />
                </TableCell>
                <TableCell>
                  <Input className="h-9" dir="ltr" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="05xxxxxxxx" />
                </TableCell>
                <TableCell>
                  <Input className="h-9" dir="ltr" value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} placeholder="اختياري" />
                </TableCell>
                <TableCell>
                  <Input className="h-9" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
                </TableCell>
                <TableCell>—</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" onClick={addRep}><Save className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setDraft(null)}>إلغاء</Button>
                </TableCell>
              </TableRow>
            )}
            {!isLoading && reps.length === 0 && !draft && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا يوجد مناديب بعد</TableCell>
              </TableRow>
            )}
            {reps.map((r) => (
              <RepRowEditor key={r.id} rep={r} onChanged={() => qc.invalidateQueries({ queryKey: ["representatives"] })} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RepRowEditor({ rep, onChanged }: { rep: RepRow; onChanged: () => void }) {
  const [local, setLocal] = useState(rep);

  async function save() {
    const { error } = await supabase
      .from("representatives")
      .update({ name: local.name, phone: local.phone, whatsapp: local.whatsapp, notes: local.notes, active: local.active })
      .eq("id", rep.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    onChanged();
  }

  async function remove() {
    if (!confirm(`حذف المندوب ${rep.name}؟`)) return;
    const { error } = await supabase.from("representatives").delete().eq("id", rep.id);
    if (error) return toast.error(error.message);
    onChanged();
  }

  return (
    <TableRow>
      <TableCell><Input className="h-9 w-40" value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-36" dir="ltr" value={local.phone} onChange={(e) => setLocal({ ...local, phone: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-36" dir="ltr" value={local.whatsapp} onChange={(e) => setLocal({ ...local, whatsapp: e.target.value })} /></TableCell>
      <TableCell><Input className="h-9 w-40" value={local.notes ?? ""} onChange={(e) => setLocal({ ...local, notes: e.target.value })} /></TableCell>
      <TableCell><Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} /></TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" onClick={save}><Save className="h-3 w-3" /></Button>
        <Button size="sm" variant="outline" onClick={remove}><Trash2 className="h-3 w-3" /></Button>
      </TableCell>
    </TableRow>
  );
}
