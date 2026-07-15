import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, ArrowLeft, Plus, Trash2, Save, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin-packages")({
  component: AdminPackages,
});

interface PkgImage {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
}

function AdminPackages() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setOk(!!data);
    })();
  }, [navigate]);

  const { data: images = [] } = useQuery({
    queryKey: ["admin-package-images"],
    enabled: ok === true,
    queryFn: async () => {
      const { data } = await supabase.from("package_images" as never).select("*").order("display_order");
      return (data as PkgImage[]) ?? [];
    },
  });

  async function addByUrl() {
    const url = prompt("رابط الصورة:");
    if (!url) return;
    const { error } = await supabase
      .from("package_images" as never)
      .insert({ image_url: url, caption: "", display_order: images.length } as never);
    if (error) return toast.error(error.message);
    toast.success("تمت الإضافة");
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
  }

  async function uploadFile(file: File) {
    const path = `packages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("gallery").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const { data: signed } = await supabase.storage.from("gallery").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    const url = signed?.signedUrl ?? path;
    const { error } = await supabase
      .from("package_images" as never)
      .insert({ image_url: url, caption: "", display_order: images.length } as never);
    if (error) return toast.error(error.message);
    toast.success("تم الرفع");
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
  }

  async function saveOne(img: PkgImage) {
    const { error } = await supabase
      .from("package_images" as never)
      .update({ image_url: img.image_url, caption: img.caption, display_order: img.display_order } as never)
      .eq("id", img.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
  }

  async function deleteOne(id: string) {
    if (!confirm("حذف الصورة؟")) return;
    const { error } = await supabase.from("package_images" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
  }

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Package className="h-5 w-5" /> إدارة صور الباقات</h1>
          <Link to="/dashboard">
            <Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
              <ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم
            </Button>
          </Link>
        </div>
      </header>

      <main className="container-luxe py-8">
        <div className="surface-card p-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="font-bold">الصور ({images.length})</h2>
            <div className="flex gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
                />
                <span className="cursor-pointer inline-flex items-center h-9 px-4 rounded-full bg-[color:var(--color-navy)] text-white text-sm font-bold hover:opacity-90">
                  <Upload className="h-4 w-4 ml-1" /> رفع صورة
                </span>
              </label>
              <Button onClick={addByUrl} variant="outline" className="rounded-full">
                <Plus className="h-4 w-4 ml-1" /> إضافة برابط
              </Button>
            </div>
          </div>

          {images.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">لا توجد صور بعد.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <ImageCard key={img.id} img={img} onSave={saveOne} onDelete={() => deleteOne(img.id)} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function ImageCard({ img, onSave, onDelete }: { img: PkgImage; onSave: (i: PkgImage) => void; onDelete: () => void }) {
  const [local, setLocal] = useState(img);
  useEffect(() => setLocal(img), [img]);
  return (
    <div className="border rounded-2xl p-3 space-y-2 bg-white">
      {local.image_url && <img src={local.image_url} alt="" className="w-full h-40 rounded-lg object-cover" />}
      <div>
        <Label className="text-xs">رابط الصورة</Label>
        <Input value={local.image_url} onChange={(e) => setLocal({ ...local, image_url: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">التعليق</Label>
        <Input value={local.caption ?? ""} onChange={(e) => setLocal({ ...local, caption: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">الترتيب</Label>
        <Input type="number" value={local.display_order} onChange={(e) => setLocal({ ...local, display_order: Number(e.target.value) })} />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        <Button size="sm" onClick={() => onSave(local)}><Save className="h-3 w-3 ml-1" /> حفظ</Button>
      </div>
    </div>
  );
}
