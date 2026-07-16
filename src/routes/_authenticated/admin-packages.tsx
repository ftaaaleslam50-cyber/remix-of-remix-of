import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, ArrowLeft, Plus, Trash2, Save, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AssetPicker, type AssetSelection } from "@/components/admin/AssetPicker";
import { AssetImg } from "@/components/admin/AssetImg";


export const Route = createFileRoute("/_authenticated/admin-packages")({
  component: AdminPackages,
});

interface PkgImage {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
}

async function trackUsage(assetUrl: string, entityType: string, entityId: string) {
  // Look up the asset by public_url, then insert into asset_usages (idempotent-ish).
  const { data: asset } = await supabase
    .from("assets" as never)
    .select("id")
    .eq("public_url", assetUrl)
    .maybeSingle();
  const assetId = (asset as { id?: string } | null)?.id;
  if (!assetId) return;
  await supabase.from("asset_usages" as never).insert({
    asset_id: assetId,
    entity_type: entityType,
    entity_id: entityId,
  } as never);
}

async function untrackUsage(entityType: string, entityId: string) {
  await supabase.from("asset_usages" as never).delete()
    .eq("entity_type", entityType).eq("entity_id", entityId);
}

function AdminPackages() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ok, setOk] = useState<boolean | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFor, setPickerFor] = useState<{ mode: "add" } | { mode: "replace"; id: string } | null>(null);

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

  async function onPicked(asset: AssetSelection) {
    if (!pickerFor) return;
    if (pickerFor.mode === "add") {
      const { data: row, error } = await supabase
        .from("package_images" as never)
        .insert({ image_url: asset.url, caption: "", display_order: images.length } as never)
        .select("id").single();
      if (error) return toast.error(error.message);
      const newId = (row as { id: string }).id;
      await trackUsage(asset.url, "package_image", newId);
      toast.success("تمت الإضافة");
    } else {
      const id = pickerFor.id;
      const { error } = await supabase
        .from("package_images" as never)
        .update({ image_url: asset.url } as never).eq("id", id);
      if (error) return toast.error(error.message);
      await untrackUsage("package_image", id);
      await trackUsage(asset.url, "package_image", id);
      toast.success("تم استبدال الصورة");
    }
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
    qc.invalidateQueries({ queryKey: ["admin-asset-usages"] });
    setPickerFor(null);
  }

  async function saveOne(img: PkgImage) {
    const { error } = await supabase
      .from("package_images" as never)
      .update({ caption: img.caption, display_order: img.display_order } as never)
      .eq("id", img.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
  }

  async function deleteOne(id: string) {
    if (!confirm("حذف الصورة؟")) return;
    await untrackUsage("package_image", id);
    const { error } = await supabase.from("package_images" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-package-images"] });
    qc.invalidateQueries({ queryKey: ["admin-asset-usages"] });
  }

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Package className="h-5 w-5" /> إدارة صور الباقات</h1>
          <div className="flex gap-2">
            <Link to="/admin-assets">
              <Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
                مكتبة الوسائط
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
                <ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container-luxe py-8">
        <div className="surface-card p-6">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <div>
              <h2 className="font-bold">الصور ({images.length})</h2>
              <p className="text-xs text-muted-foreground mt-1">
                جميع الصور تُدار من مكتبة الوسائط المركزية.
              </p>
            </div>
            <Button
              onClick={() => { setPickerFor({ mode: "add" }); setPickerOpen(true); }}
              className="rounded-full"
            >
              <Plus className="h-4 w-4 ml-1" /> إضافة من مكتبة الوسائط
            </Button>
          </div>

          {images.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">لا توجد صور بعد.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {images.map((img) => (
                <ImageCard
                  key={img.id}
                  img={img}
                  onSave={saveOne}
                  onDelete={() => deleteOne(img.id)}
                  onReplace={() => { setPickerFor({ mode: "replace", id: img.id }); setPickerOpen(true); }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <AssetPicker
        open={pickerOpen}
        onOpenChange={(v) => { setPickerOpen(v); if (!v) setPickerFor(null); }}
        onSelect={onPicked}
      />
    </div>
  );
}

function ImageCard({ img, onSave, onDelete, onReplace }: {
  img: PkgImage; onSave: (i: PkgImage) => void; onDelete: () => void; onReplace: () => void;
}) {
  const [local, setLocal] = useState(img);
  useEffect(() => setLocal(img), [img]);
  return (
    <div className="border rounded-2xl p-3 space-y-2 bg-white">
      {local.image_url && <AssetImg src={local.image_url} className="w-full h-40 rounded-lg object-cover" />}
      <Button size="sm" variant="outline" className="w-full" onClick={onReplace}>
        <ImagePlus className="h-3 w-3 ml-1" /> استبدال من المكتبة
      </Button>
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
