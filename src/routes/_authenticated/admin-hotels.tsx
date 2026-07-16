import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hotel as HotelIcon, ArrowLeft, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AssetField } from "@/components/admin/AssetField";
import { trackAssetUsage, untrackAssetUsage } from "@/lib/asset-usage";

export const Route = createFileRoute("/_authenticated/admin-hotels")({
  component: AdminHotels,
});

interface HotelRow {
  id: string;
  name: string;
  description: string | null;
  stars: number | null;
  rating: number | null;
  distance_km: number | null;
  image_url: string | null;
  price_addition: number | null;
  price_label: string | null;
  available: boolean;
  display_order: number | null;
  is_no_hotel: boolean;
}

function AdminHotels() {
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

  const { data: hotels = [] } = useQuery({
    queryKey: ["admin-hotels"],
    enabled: ok === true,
    queryFn: async () => {
      const { data } = await supabase.from("hotels").select("*").order("display_order", { ascending: true });
      return (data as unknown as HotelRow[]) ?? [];
    },
  });

  async function addHotel() {
    const { data, error } = await supabase.from("hotels").insert({
      name: "فندق جديد", available: true, display_order: hotels.length, is_no_hotel: false,
    } as never).select("id").single();
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-hotels"] });
    toast.success("تمت الإضافة");
    void data;
  }

  async function saveOne(h: HotelRow) {
    const { error } = await supabase.from("hotels").update({
      name: h.name, description: h.description, stars: h.stars, rating: h.rating,
      distance_km: h.distance_km, image_url: h.image_url,
      price_addition: h.price_addition, price_label: h.price_label,
      available: h.available, display_order: h.display_order, is_no_hotel: h.is_no_hotel,
    } as never).eq("id", h.id);
    if (error) return toast.error(error.message);
    await trackAssetUsage(h.image_url, "hotel", h.id);
    qc.invalidateQueries({ queryKey: ["admin-hotels"] });
    toast.success("تم الحفظ");
  }

  async function deleteOne(id: string) {
    if (!confirm("حذف الفندق؟")) return;
    await untrackAssetUsage("hotel", id);
    const { error } = await supabase.from("hotels").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-hotels"] });
  }

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <HotelIcon className="h-5 w-5" /> إدارة الفنادق
          </h1>
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

      <main className="container-luxe py-8 space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h2 className="font-bold">الفنادق ({hotels.length})</h2>
            <p className="text-xs text-muted-foreground mt-1">جميع الصور تُدار من مكتبة الوسائط المركزية.</p>
          </div>
          <Button onClick={addHotel} className="rounded-full">
            <Plus className="h-4 w-4 ml-1" /> إضافة فندق
          </Button>
        </div>

        {hotels.length === 0 ? (
          <div className="surface-card p-8 text-center text-muted-foreground">لا توجد فنادق بعد.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {hotels.map((h) => (
              <HotelCard key={h.id} hotel={h} onSave={saveOne} onDelete={() => deleteOne(h.id)} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function HotelCard({ hotel, onSave, onDelete }: {
  hotel: HotelRow; onSave: (h: HotelRow) => void; onDelete: () => void;
}) {
  const [local, setLocal] = useState(hotel);
  useEffect(() => setLocal(hotel), [hotel]);

  return (
    <div className="surface-card p-4 space-y-3">
      <AssetField
        label="صورة الفندق"
        value={local.image_url}
        onChange={(url) => setLocal({ ...local, image_url: url })}
      />
      <div>
        <Label className="text-xs">الاسم</Label>
        <Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">الوصف</Label>
        <Textarea rows={2} value={local.description ?? ""} onChange={(e) => setLocal({ ...local, description: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">النجوم</Label>
          <Input type="number" min={0} max={5} value={local.stars ?? 0} onChange={(e) => setLocal({ ...local, stars: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs">التقييم</Label>
          <Input type="number" step="0.1" value={local.rating ?? 0} onChange={(e) => setLocal({ ...local, rating: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs">المسافة (كم)</Label>
          <Input type="number" step="0.1" value={local.distance_km ?? 0} onChange={(e) => setLocal({ ...local, distance_km: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs">إضافة السعر</Label>
          <Input type="number" value={local.price_addition ?? 0} onChange={(e) => setLocal({ ...local, price_addition: Number(e.target.value) })} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">وسم السعر</Label>
          <Input value={local.price_label ?? ""} onChange={(e) => setLocal({ ...local, price_label: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">الترتيب</Label>
          <Input type="number" value={local.display_order ?? 0} onChange={(e) => setLocal({ ...local, display_order: Number(e.target.value) })} />
        </div>
        <div className="flex items-end gap-2">
          <Switch checked={local.available} onCheckedChange={(v) => setLocal({ ...local, available: v })} />
          <Label className="text-xs">متاح</Label>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
        <Button size="sm" onClick={() => onSave(local)}><Save className="h-3 w-3 ml-1" /> حفظ</Button>
      </div>
    </div>
  );
}
