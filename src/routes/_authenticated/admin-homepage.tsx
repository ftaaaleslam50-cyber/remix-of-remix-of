import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, LayoutDashboard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      if (error) throw error;
      return data as unknown as Settings | null;
    },
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
            <Button size="sm" onClick={save} className="rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ الكل</Button>
            <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
          </div>
        </div>
      </header>
      <main className="container-luxe py-8">
        <Tabs defaultValue="hero">
          <TabsList className="bg-white rounded-2xl p-1.5 flex flex-wrap h-auto">
            <TabsTrigger value="hero" className="rounded-xl">الهيرو</TabsTrigger>
            <TabsTrigger value="about" className="rounded-xl">عن المؤسسة</TabsTrigger>
            <TabsTrigger value="features" className="rounded-xl">المميزات</TabsTrigger>
            <TabsTrigger value="testimonials" className="rounded-xl">آراء العملاء</TabsTrigger>
            <TabsTrigger value="faq" className="rounded-xl">الأسئلة الشائعة</TabsTrigger>
            <TabsTrigger value="cta" className="rounded-xl">دعوة الحجز</TabsTrigger>
          </TabsList>

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
