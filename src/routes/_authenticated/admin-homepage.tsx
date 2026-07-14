import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, LayoutDashboard, Plus, Trash2, Eye, EyeOff, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin-homepage")({
  component: AdminHomepage,
});

interface FeatureItem { title: string; description: string; icon?: string }
interface Testimonial { name: string; text: string; rating?: number }
interface FaqItem { q: string; a: string }

interface Settings {
  id: number;
  hero_title: string; hero_subtitle: string; hero_cta: string; hero_image_url: string | null;
  about_title: string | null; about_body: string | null;
  features: FeatureItem[] | null;
  testimonials: Testimonial[] | null;
  faq: FaqItem[] | null;
  cta_title: string | null; cta_body: string | null; cta_button_label: string | null;
}

interface Section {
  id: string; section_key: string; title: string | null; subtitle: string | null;
  image_url: string | null; button_text: string | null; button_link: string | null;
  bg_color: string | null; visible: boolean; display_order: number;
}

function AdminHomepage() {
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

  const { data: settings } = useQuery({
    queryKey: ["admin-homepage-settings"],
    enabled: ok === true,
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle()).data as unknown as Settings | null,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["homepage-sections-admin"],
    enabled: ok === true,
    queryFn: async () => (await supabase.from("homepage_sections").select("*").order("display_order")).data as Section[] ?? [],
  });

  const [local, setLocal] = useState<Settings | null>(null);
  useEffect(() => { if (settings) setLocal(settings); }, [settings]);

  async function save() {
    if (!local) return;
    const { error } = await supabase.from("app_settings").update({
      hero_title: local.hero_title, hero_subtitle: local.hero_subtitle, hero_cta: local.hero_cta,
      hero_image_url: local.hero_image_url,
      about_title: local.about_title, about_body: local.about_body,
      features: local.features ?? [], testimonials: local.testimonials ?? [], faq: local.faq ?? [],
      cta_title: local.cta_title, cta_body: local.cta_body, cta_button_label: local.cta_button_label,
    } as never).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-homepage-settings"] });
    qc.invalidateQueries({ queryKey: ["home-cms"] });
  }

  async function saveSection(s: Section) {
    const { error } = await supabase.from("homepage_sections").update({
      title: s.title, subtitle: s.subtitle, image_url: s.image_url,
      button_text: s.button_text, button_link: s.button_link, bg_color: s.bg_color,
      visible: s.visible, display_order: s.display_order,
    } as never).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["homepage-sections-admin"] });
    qc.invalidateQueries({ queryKey: ["homepage-sections"] });
  }
  async function toggleVisible(s: Section) {
    await supabase.from("homepage_sections").update({ visible: !s.visible } as never).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["homepage-sections-admin"] });
    qc.invalidateQueries({ queryKey: ["homepage-sections"] });
  }
  async function move(s: Section, dir: -1 | 1) {
    const sorted = [...sections].sort((a, b) => a.display_order - b.display_order);
    const idx = sorted.findIndex((x) => x.id === s.id);
    const other = sorted[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("homepage_sections").update({ display_order: other.display_order } as never).eq("id", s.id),
      supabase.from("homepage_sections").update({ display_order: s.display_order } as never).eq("id", other.id),
    ]);
    qc.invalidateQueries({ queryKey: ["homepage-sections-admin"] });
    qc.invalidateQueries({ queryKey: ["homepage-sections"] });
  }

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;
  if (!local) return <div className="p-8 text-center">جاري التحميل...</div>;

  const features = local.features ?? [];
  const testimonials = local.testimonials ?? [];
  const faq = local.faq ?? [];

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><LayoutDashboard className="h-5 w-5" /> إدارة الصفحة الرئيسية</h1>
          <div className="flex gap-2">
            <Button size="sm" onClick={save} className="rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ المحتوى</Button>
            <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
          </div>
        </div>
      </header>
      <main className="container-luxe py-8">
        <Tabs defaultValue="sections">
          <TabsList className="bg-white rounded-2xl p-1.5 flex flex-wrap h-auto">
            <TabsTrigger value="sections" className="rounded-xl">الأقسام</TabsTrigger>
            <TabsTrigger value="hero" className="rounded-xl">الهيرو</TabsTrigger>
            <TabsTrigger value="about" className="rounded-xl">عن المؤسسة</TabsTrigger>
            <TabsTrigger value="features" className="rounded-xl">المميزات</TabsTrigger>
            <TabsTrigger value="testimonials" className="rounded-xl">آراء العملاء</TabsTrigger>
            <TabsTrigger value="faq" className="rounded-xl">الأسئلة الشائعة</TabsTrigger>
            <TabsTrigger value="cta" className="rounded-xl">دعوة الحجز</TabsTrigger>
          </TabsList>

          <TabsContent value="sections" className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">أعِد ترتيب أقسام الصفحة الرئيسية، أخفِ ما لا تحتاجه، وحرِّر العناوين والألوان والأزرار.</p>
            {sections.sort((a, b) => a.display_order - b.display_order).map((s) => (
              <SectionCard key={s.id} section={s} onSave={saveSection} onToggle={() => toggleVisible(s)} onUp={() => move(s, -1)} onDown={() => move(s, 1)} />
            ))}
          </TabsContent>

          <TabsContent value="hero" className="mt-4 surface-card p-6 grid gap-3">
            <div><Label>العنوان الرئيسي</Label><Input value={local.hero_title} onChange={(e) => setLocal({ ...local, hero_title: e.target.value })} /></div>
            <div><Label>العنوان الفرعي</Label><Textarea value={local.hero_subtitle} onChange={(e) => setLocal({ ...local, hero_subtitle: e.target.value })} /></div>
            <div><Label>نص زر الحجز</Label><Input value={local.hero_cta} onChange={(e) => setLocal({ ...local, hero_cta: e.target.value })} /></div>
            <div><Label>صورة الخلفية (URL)</Label><Input value={local.hero_image_url ?? ""} onChange={(e) => setLocal({ ...local, hero_image_url: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="about" className="mt-4 surface-card p-6 grid gap-3">
            <div><Label>العنوان</Label><Input value={local.about_title ?? ""} onChange={(e) => setLocal({ ...local, about_title: e.target.value })} /></div>
            <div><Label>النص</Label><Textarea rows={6} value={local.about_body ?? ""} onChange={(e) => setLocal({ ...local, about_body: e.target.value })} /></div>
          </TabsContent>

          <TabsContent value="features" className="mt-4 surface-card p-6 space-y-3">
            {features.map((f, i) => (
              <div key={i} className="border-2 rounded-2xl p-3 grid md:grid-cols-3 gap-2">
                <Input placeholder="العنوان" value={f.title} onChange={(e) => { const c=[...features]; c[i]={...f,title:e.target.value}; setLocal({...local,features:c}); }} />
                <Input placeholder="الوصف" className="md:col-span-2" value={f.description} onChange={(e) => { const c=[...features]; c[i]={...f,description:e.target.value}; setLocal({...local,features:c}); }} />
                <Button variant="outline" size="sm" onClick={() => setLocal({ ...local, features: features.filter((_,k)=>k!==i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setLocal({ ...local, features: [...features, { title:"", description:"" }] })}><Plus className="h-4 w-4 ml-1" /> إضافة ميزة</Button>
          </TabsContent>

          <TabsContent value="testimonials" className="mt-4 surface-card p-6 space-y-3">
            {testimonials.map((t, i) => (
              <div key={i} className="border-2 rounded-2xl p-3 grid md:grid-cols-3 gap-2">
                <Input placeholder="الاسم" value={t.name} onChange={(e) => { const c=[...testimonials]; c[i]={...t,name:e.target.value}; setLocal({...local,testimonials:c}); }} />
                <Textarea placeholder="النص" className="md:col-span-2" value={t.text} onChange={(e) => { const c=[...testimonials]; c[i]={...t,text:e.target.value}; setLocal({...local,testimonials:c}); }} />
                <Button variant="outline" size="sm" onClick={() => setLocal({ ...local, testimonials: testimonials.filter((_,k)=>k!==i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setLocal({ ...local, testimonials: [...testimonials, { name:"", text:"" }] })}><Plus className="h-4 w-4 ml-1" /> إضافة رأي</Button>
          </TabsContent>

          <TabsContent value="faq" className="mt-4 surface-card p-6 space-y-3">
            {faq.map((f, i) => (
              <div key={i} className="border-2 rounded-2xl p-3 space-y-2">
                <Input placeholder="السؤال" value={f.q} onChange={(e) => { const c=[...faq]; c[i]={...f,q:e.target.value}; setLocal({...local,faq:c}); }} />
                <Textarea placeholder="الجواب" value={f.a} onChange={(e) => { const c=[...faq]; c[i]={...f,a:e.target.value}; setLocal({...local,faq:c}); }} />
                <Button variant="outline" size="sm" onClick={() => setLocal({ ...local, faq: faq.filter((_,k)=>k!==i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setLocal({ ...local, faq: [...faq, { q:"", a:"" }] })}><Plus className="h-4 w-4 ml-1" /> إضافة سؤال</Button>
          </TabsContent>

          <TabsContent value="cta" className="mt-4 surface-card p-6 grid gap-3">
            <div><Label>العنوان</Label><Input value={local.cta_title ?? ""} onChange={(e) => setLocal({ ...local, cta_title: e.target.value })} /></div>
            <div><Label>النص</Label><Textarea value={local.cta_body ?? ""} onChange={(e) => setLocal({ ...local, cta_body: e.target.value })} /></div>
            <div><Label>نص الزر</Label><Input value={local.cta_button_label ?? ""} onChange={(e) => setLocal({ ...local, cta_button_label: e.target.value })} /></div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function SectionCard({ section, onSave, onToggle, onUp, onDown }: {
  section: Section; onSave: (s: Section) => void; onToggle: () => void; onUp: () => void; onDown: () => void;
}) {
  const [local, setLocal] = useState(section);
  useEffect(() => setLocal(section), [section]);
  return (
    <div className={`surface-card p-4 ${!local.visible ? "opacity-60" : ""}`} style={local.bg_color ? { borderRightColor: local.bg_color, borderRightWidth: 4 } : undefined}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-bold">{local.section_key}</div>
          <div className="text-xs text-muted-foreground">ترتيب #{local.display_order}</div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={onUp}><ArrowUp className="h-3 w-3" /></Button>
          <Button size="sm" variant="outline" onClick={onDown}><ArrowDown className="h-3 w-3" /></Button>
          <Button size="sm" variant="outline" onClick={onToggle}>{local.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div><Label className="text-xs">العنوان</Label><Input value={local.title ?? ""} onChange={(e) => setLocal({ ...local, title: e.target.value })} /></div>
        <div><Label className="text-xs">الوصف</Label><Input value={local.subtitle ?? ""} onChange={(e) => setLocal({ ...local, subtitle: e.target.value })} /></div>
        <div><Label className="text-xs">رابط الصورة</Label><Input value={local.image_url ?? ""} onChange={(e) => setLocal({ ...local, image_url: e.target.value })} /></div>
        <div><Label className="text-xs">لون الخلفية</Label><Input placeholder="#0f2a44" value={local.bg_color ?? ""} onChange={(e) => setLocal({ ...local, bg_color: e.target.value })} /></div>
        <div><Label className="text-xs">نص الزر</Label><Input value={local.button_text ?? ""} onChange={(e) => setLocal({ ...local, button_text: e.target.value })} /></div>
        <div><Label className="text-xs">رابط الزر</Label><Input value={local.button_link ?? ""} onChange={(e) => setLocal({ ...local, button_link: e.target.value })} /></div>
        <div className="flex items-center gap-2"><Switch checked={local.visible} onCheckedChange={(v) => setLocal({ ...local, visible: v })} /><span className="text-xs">ظاهر</span></div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={() => onSave(local)}><Save className="h-4 w-4 ml-1" /> حفظ</Button>
      </div>
    </div>
  );
}
