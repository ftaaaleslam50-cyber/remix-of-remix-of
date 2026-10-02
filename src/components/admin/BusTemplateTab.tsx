// «قالب صورة الباص» — رفع القالب وضبط مواضع رقم الباص واللوحة مع معاينة حية.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { loadBusTemplate, renderBusImage, templateTable, templateUrlFor, type BusImageTemplate, type BusImageVariant } from "@/lib/bus-image";

type NumKey = { [K in keyof BusImageTemplate]: BusImageTemplate[K] extends number ? K : never }[keyof BusImageTemplate];

export function BusTemplateTab() {
  const [t, setT] = useState<BusImageTemplate | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [variant, setVariant] = useState<BusImageVariant>("day");
  const urlKey = variant === "night" ? "night_template_image_url" : "template_image_url";
  const [sample, setSample] = useState({ bus_number: 25, plate: "1234 ABC" });

  useEffect(() => { void loadBusTemplate().then(setT); }, []);

  useEffect(() => {
    if (!t) return;
    let url = "";
    const h = setTimeout(() => {
      renderBusImage(t, sample, variant).then((b) => { url = URL.createObjectURL(b); setPreview(url); }).catch((e) => toast.error(e.message));
    }, 150);
    return () => { clearTimeout(h); if (url) URL.revokeObjectURL(url); };
  }, [t, sample, variant]);

  if (!t) return <div className="surface-card p-6 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  const set = <K extends keyof BusImageTemplate>(k: K, v: BusImageTemplate[K]) => setT({ ...t, [k]: v });
  const numField = (k: NumKey, label: string, step = 0.005) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} className="h-9 mt-1" dir="ltr" value={t[k] as number} onChange={(e) => set(k, Number(e.target.value) as never)} />
    </div>
  );
  const alignField = (k: "bus_number_alignment" | "plate_alignment") => (
    <div>
      <Label className="text-xs">المحاذاة</Label>
      <select className="h-9 mt-1 w-full rounded-md border px-2 bg-background" value={t[k]} onChange={(e) => set(k, e.target.value as never)}>
        <option value="center">وسط</option><option value="left">يسار</option><option value="right">يمين</option>
      </select>
    </div>
  );

  async function upload(file: File) {
    const path = `bus-template/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("assets").upload(path, file);
    if (error) return toast.error(error.message);
    set(urlKey, supabase.storage.from("assets").getPublicUrl(path).data.publicUrl);
  }

  async function save() {
    setSaving(true);
    const { error } = await templateTable().update({ ...t, updated_at: new Date().toISOString() } as never).eq("id" as never, 1 as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ إعدادات قالب صورة الباص");
  }

  return (
    <div className="surface-card p-4 sm:p-6 grid lg:grid-cols-2 gap-6" dir="rtl">
      <div className="space-y-4">
        <h2 className="text-xl font-extrabold">قالب صورة الباص</h2>
        <p className="text-xs text-muted-foreground">المواضع نسب من أبعاد الصورة (0 = البداية، 1 = النهاية). حجم الخط نسبة من عرض الصورة.</p>
        <div className="flex gap-2">
          <Button size="sm" variant={variant === "day" ? "default" : "outline"} onClick={() => setVariant("day")}>☀️ صورة الصباح</Button>
          <Button size="sm" variant={variant === "night" ? "default" : "outline"} onClick={() => setVariant("night")}>🌙 صورة الليل</Button>
        </div>
        <p className="text-xs text-muted-foreground">مواضع الرقم واللوحة مشتركة بين الصورتين.</p>
        <div className="flex gap-2 flex-wrap">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button asChild variant="outline" size="sm"><span><Upload className="h-4 w-4 ml-1" /> رفع قالب جديد</span></Button>
          </label>
          {t[urlKey] && (
            <Button variant="ghost" size="sm" onClick={() => set(urlKey, null)}><RotateCcw className="h-4 w-4 ml-1" /> القالب الافتراضي</Button>
          )}
        </div>

        <fieldset className="rounded-xl border p-3 space-y-2">
          <legend className="px-2 text-sm font-bold">رقم الباص</legend>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={t.bus_number_enabled} onCheckedChange={(v) => set("bus_number_enabled", !!v)} /> إظهار رقم الباص (يسار أسفل)</label>
          <div className="grid grid-cols-3 gap-2">
            {numField("bus_number_x", "X")}{numField("bus_number_y", "Y")}{numField("bus_number_width", "العرض")}
            {numField("bus_number_font_size", "حجم الخط", 0.001)}{numField("bus_number_font_weight", "سماكة الخط", 100)}{alignField("bus_number_alignment")}
            <div><Label className="text-xs">اللون</Label><Input type="color" className="h-9 mt-1" value={t.bus_number_color} onChange={(e) => set("bus_number_color", e.target.value)} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={t.bus_number2_enabled} onCheckedChange={(v) => set("bus_number2_enabled", !!v)} /> تكرار الرقم (يمين أسفل)</label>
          {t.bus_number2_enabled && <div className="grid grid-cols-3 gap-2">{numField("bus_number2_x", "X")}{numField("bus_number2_y", "Y")}</div>}
        </fieldset>

        <fieldset className="rounded-xl border p-3 space-y-2">
          <legend className="px-2 text-sm font-bold">اللوحة</legend>
          <div className="grid grid-cols-3 gap-2">
            {numField("plate_x", "X")}{numField("plate_y", "Y")}{numField("plate_width", "العرض")}
            {numField("plate_height", "الارتفاع")}{numField("plate_font_size", "حجم الخط", 0.001)}{numField("plate_font_weight", "سماكة الخط", 100)}
            {alignField("plate_alignment")}
            <div><Label className="text-xs">اللون</Label><Input type="color" className="h-9 mt-1" value={t.plate_color} onChange={(e) => set("plate_color", e.target.value)} /></div>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border p-3 grid grid-cols-2 gap-2">
          <legend className="px-2 text-sm font-bold">بيانات تجريبية للمعاينة</legend>
          <div><Label className="text-xs">رقم الباص</Label><Input type="number" className="h-9 mt-1" value={sample.bus_number} onChange={(e) => setSample({ ...sample, bus_number: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">اللوحة</Label><Input className="h-9 mt-1" value={sample.plate} onChange={(e) => setSample({ ...sample, plate: e.target.value })} /></div>
        </fieldset>

        <Button className="w-full font-bold" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />} حفظ الإعدادات</Button>
      </div>
      <div>
        {preview ? <img src={preview} alt="معاينة صورة الباص" className="w-full rounded-xl border" /> : <img src={templateUrlFor(t, variant)} alt="" className="w-full rounded-xl border opacity-50" />}
      </div>
    </div>
  );
}
