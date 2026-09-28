// «العملاء» — قاعدة بيانات دائمة لعملاء المؤسسة، مستقلة عن الحجوزات.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, MessageCircle, IdCard, Pencil, Trash2, Plus, Search, Loader2, Upload, Power, Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  customersTable, customerWhatsapp, idImageUrl, searchCustomers, uploadCustomerId, waLink, cleanPhone,
  type TravelCustomer,
} from "@/lib/customers";
import { makeCustomersWorkbook, parseCustomersWorkbook } from "@/lib/export/customers-sheet";
import { downloadBlob } from "@/lib/export/official-bus-sheet";

const PAGE = 25;

export function CustomersTab() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<TravelCustomer> | null>(null);
  const [confirmDel, setConfirmDel] = useState<TravelCustomer | null>(null);
  const [idView, setIdView] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ["travel-customers", debounced, page, showInactive],
    queryFn: () => searchCustomers(debounced, PAGE, page * PAGE, showInactive),
    placeholderData: (p) => p,
  });
  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["travel-customers"] });

  async function downloadCustomers(template: boolean) {
    setWorking(true);
    try {
      const all: TravelCustomer[] = [];
      if (!template) {
        // Export the complete list, including inactive customers and rows beyond the current page.
        let offset = 0;
        while (true) {
          const chunk = await searchCustomers("", 500, offset, true);
          all.push(...chunk.rows);
          offset += chunk.rows.length;
          if (offset >= chunk.count || chunk.rows.length === 0) break;
        }
      }
      downloadBlob(await makeCustomersWorkbook(all), template ? "نموذج-العملاء.xlsx" : "قائمة-العملاء.xlsx");
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر تنزيل الملف"); }
    finally { setWorking(false); }
  }

  async function importCustomers(file?: File) {
    if (!file) return;
    setWorking(true);
    try {
      const { rows: incoming, errors } = await parseCustomersWorkbook(file);
      if (errors.length) { toast.error(`${errors[0]}${errors.length > 1 ? ` (${errors.length} أخطاء)` : ""}`); return; }
      if (!incoming.length) { toast.info("النموذج فارغ"); return; }
      const existing = new Set<string>();
      let offset = 0;
      while (true) {
        const chunk = await searchCustomers("", 500, offset, true);
        chunk.rows.forEach((c) => existing.add(c.id_number.trim()));
        offset += chunk.rows.length;
        if (offset >= chunk.count || !chunk.rows.length) break;
      }
      let added = 0;
      let skipped = 0;
      for (const row of incoming) {
        if (existing.has(row.id_number)) { skipped++; continue; }
        const { error } = await customersTable().insert(row as never);
        if (error?.code === "23505") { skipped++; continue; }
        if (error) throw new Error(`بعد إضافة ${added} عميل: ${error.message}`);
        added++;
      }
      toast.success(`تمت إضافة ${added} عميل${skipped ? `، وتخطي ${skipped} هوية مسجلة` : ""}`);
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "تعذر استيراد الملف"); }
    finally { setWorking(false); if (importRef.current) importRef.current.value = ""; }
  }

  async function openId(c: TravelCustomer) {
    const url = await idImageUrl(c.id_image_url);
    if (!url) return toast.error("لا توجد صورة هوية لهذا العميل");
    setIdView(url);
  }

  async function toggleActive(c: TravelCustomer) {
    const { error } = await customersTable().update({ active: !c.active } as never).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(c.active ? "تم تعطيل العميل" : "تم تفعيل العميل");
    refresh();
  }

  async function remove(c: TravelCustomer) {
    const { error } = await customersTable().delete().eq("id", c.id);
    setConfirmDel(null);
    if (error) return toast.error(error.message);
    if (c.id_image_url && !/^https?:/.test(c.id_image_url)) {
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.storage.from("id-uploads").remove([c.id_image_url]);
    }
    toast.success("تم حذف العميل");
    refresh();
  }

  return (
    <div className="surface-card p-4 sm:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-extrabold">العملاء <span className="text-sm text-muted-foreground font-normal">({total})</span></h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={working} onClick={() => downloadCustomers(false)}><Download className="h-4 w-4 ml-1" /> تنزيل القائمة</Button>
          <Button variant="outline" disabled={working} onClick={() => downloadCustomers(true)}><FileDown className="h-4 w-4 ml-1" /> تنزيل النموذج</Button>
          <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void importCustomers(e.target.files?.[0])} />
          <Button variant="outline" disabled={working} onClick={() => importRef.current?.click()}><Upload className="h-4 w-4 ml-1" /> رفع النموذج</Button>
          <Button className="rounded-full font-bold" onClick={() => setEditing({ same_whatsapp: true, active: true })}>
            <Plus className="h-4 w-4 ml-1" /> إضافة عميل جديد
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-11 rounded-xl" placeholder="ابحث بالاسم أو رقم الهوية أو الجوال أو الواتساب" value={q} onChange={(e) => setQ(e.target.value)} />
          {isFetching && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={showInactive} onCheckedChange={(v) => { setShowInactive(!!v); setPage(0); }} /> إظهار المعطّلين
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs">
            <tr>
              <th className="p-2 text-right">الاسم</th>
              <th className="p-2 text-right">رقم الهوية</th>
              <th className="p-2 text-right">رقم الجوال</th>
              <th className="p-2 text-right">الواتساب</th>
              <th className="p-2 text-right">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">{isFetching ? "جارِ التحميل…" : "لا يوجد عملاء"}</td></tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className={`border-t ${c.active ? "" : "opacity-50"}`}>
                <td className="p-2 font-semibold">{c.full_name}</td>
                <td className="p-2" dir="ltr">{c.id_number}</td>
                <td className="p-2" dir="ltr">{c.contact_phone}</td>
                <td className="p-2" dir="ltr">
                  {c.same_whatsapp ? <span className="text-xs text-muted-foreground" dir="rtl">نفس رقم الجوال</span> : c.whatsapp_phone || "—"}
                </td>
                <td className="p-2">
                  <div className="flex gap-1 flex-wrap">
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="اتصال">
                      <a href={`tel:${cleanPhone(c.contact_phone) ? "+" + cleanPhone(c.contact_phone) : ""}`}><Phone className="h-4 w-4" /></a>
                    </Button>
                    <Button asChild size="icon" variant="ghost" className="h-8 w-8 text-success" title="واتساب">
                      <a href={waLink(customerWhatsapp(c))} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="صورة الهوية" disabled={!c.id_image_url} onClick={() => openId(c)}>
                      <IdCard className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title="تعديل" onClick={() => setEditing(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" title={c.active ? "تعطيل" : "تفعيل"} onClick={() => toggleActive(c)}>
                      <Power className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="حذف" onClick={() => setConfirmDel(c)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>السابق</Button>
          <span>{page + 1} / {Math.ceil(total / PAGE)}</span>
          <Button size="sm" variant="outline" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>التالي</Button>
        </div>
      )}

      {editing && <CustomerForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العميل؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف «{confirmDel?.full_name}» نهائيًا. الحجوزات السابقة لن تتأثر. يمكنك التعطيل بدلًا من الحذف.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={() => confirmDel && remove(confirmDel)}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!idView} onOpenChange={(o) => !o && setIdView(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader><DialogTitle>صورة الهوية</DialogTitle></DialogHeader>
          {idView && <img src={idView} alt="صورة الهوية" className="w-full rounded-xl border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CustomerForm({ initial, onClose, onSaved }: {
  initial: Partial<TravelCustomer>;
  onClose: () => void;
  onSaved: (c: TravelCustomer) => void;
}) {
  const [f, setF] = useState<Partial<TravelCustomer>>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof TravelCustomer>(k: K, v: TravelCustomer[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    const name = (f.full_name ?? "").trim();
    const idn = (f.id_number ?? "").trim();
    const phone = (f.contact_phone ?? "").replace(/\s/g, "");
    if (name.length < 2) return toast.error("أدخل الاسم الكامل");
    if (!idn) return toast.error("أدخل رقم الهوية");
    if (cleanPhone(phone).length < 9) return toast.error("أدخل رقم جوال صحيح");
    if (!f.same_whatsapp && cleanPhone(f.whatsapp_phone).length < 9) return toast.error("أدخل رقم واتساب صحيح");
    setSaving(true);
    try {
      let id_image_url = f.id_image_url ?? null;
      if (file) id_image_url = await uploadCustomerId(file);
      const payload = {
        full_name: name, id_number: idn, contact_phone: phone,
        same_whatsapp: !!f.same_whatsapp,
        whatsapp_phone: f.same_whatsapp ? phone : (f.whatsapp_phone ?? "").trim(),
        id_image_url, nationality: f.nationality?.trim() || null, notes: f.notes?.trim() || null,
      };
      const res = f.id
        ? await customersTable().update(payload as never).eq("id", f.id).select().single()
        : await customersTable().insert(payload as never).select().single();
      if (res.error) {
        if (res.error.code === "23505") throw new Error("يوجد عميل مسجل بنفس رقم الهوية");
        throw res.error;
      }
      toast.success(f.id ? "تم تحديث العميل" : "تمت إضافة العميل");
      onSaved(res.data as unknown as TravelCustomer);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle>{f.id ? "تعديل عميل" : "إضافة عميل جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>الاسم الكامل *</Label><Input className="mt-1" value={f.full_name ?? ""} onChange={(e) => set("full_name", e.target.value)} /></div>
          <div><Label>رقم الهوية *</Label><Input className="mt-1" dir="ltr" value={f.id_number ?? ""} onChange={(e) => set("id_number", e.target.value)} /></div>
          <div><Label>رقم الجوال *</Label><Input className="mt-1" dir="ltr" value={f.contact_phone ?? ""} onChange={(e) => set("contact_phone", e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={!!f.same_whatsapp} onCheckedChange={(v) => set("same_whatsapp", !!v)} /> رقم الجوال هو نفسه رقم الواتساب
          </label>
          {!f.same_whatsapp && (
            <div><Label>رقم الواتساب *</Label><Input className="mt-1" dir="ltr" value={f.whatsapp_phone ?? ""} onChange={(e) => set("whatsapp_phone", e.target.value)} /></div>
          )}
          <div><Label>الجنسية</Label><Input className="mt-1" value={f.nationality ?? ""} onChange={(e) => set("nationality", e.target.value)} /></div>
          <div>
            <Label>صورة الهوية</Label>
            <label className="mt-1 flex items-center gap-2 cursor-pointer text-sm rounded-xl border border-dashed p-3">
              <Upload className="h-4 w-4" />
              <span className="truncate">{file ? file.name : f.id_image_url ? "صورة محفوظة — اختر لاستبدالها" : "اختر صورة"}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </label>
          </div>
          <div><Label>ملاحظات</Label><Textarea className="mt-1" value={f.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1 font-bold" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />} حفظ</Button>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
