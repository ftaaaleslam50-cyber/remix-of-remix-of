import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, Bus, Hotel, MapPin, ShieldCheck, Sparkles, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Logo } from "@/components/site/Logo";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/integrations/supabase/client";

interface HomeCms {
  hero_title: string; hero_subtitle: string; hero_cta: string; hero_image_url: string | null;
  about_title: string | null; about_body: string | null;
  features: { title: string; description: string }[] | null;
  testimonials: { name: string; text: string }[] | null;
  faq: { q: string; a: string }[] | null;
  cta_title: string | null; cta_body: string | null; cta_button_label: string | null;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} | احجز رحلتك للعمرة الآن` },
      { name: "description", content: "رحلات عمرة منظّمة من المدينة المنورة إلى مكة المكرمة. باقات أفراد وعوائل، فنادق مختارة، حافلات حديثة، وأسعار شفافة." },
      { property: "og:title", content: `${BRAND.name} | احجز رحلتك للعمرة` },
      { property: "og:description", content: "رحلات عمرة منظّمة من المدينة المنورة إلى مكة المكرمة." },
      { property: "og:image", content: BRAND.logoUrl },
    ],
  }),
  component: Home,
});

function useHomeCms() {
  return useQuery({
    queryKey: ["home-cms"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("hero_title,hero_subtitle,hero_cta,hero_image_url,about_title,about_body,features,testimonials,faq,cta_title,cta_body,cta_button_label").eq("id", 1).maybeSingle();
      return (data as unknown as HomeCms) ?? null;
    },
  });
}

function Home() {
  const { data: cms } = useHomeCms();
  return (
    <SiteLayout>
      <Hero cms={cms} />
      <Stats />
      {cms?.about_title && <About title={cms.about_title} body={cms.about_body ?? ""} />}
      <Features items={cms?.features?.length ? cms.features : DEFAULT_FEATURES} />
      <Steps />
      {cms?.testimonials?.length ? <Testimonials items={cms.testimonials} /> : null}
      {cms?.faq?.length ? <Faq items={cms.faq} /> : null}
      <FinalCTA cms={cms} />
    </SiteLayout>
  );
}

const DEFAULT_FEATURES = [
  { title: "حافلات حديثة", description: "أسطول حافلات مكيّفة بأعلى مستويات الراحة والأمان مع مقاعد محددة." },
  { title: "فنادق مختارة", description: "باقات فندقية متعددة من الاقتصادي إلى ٥ نجوم وVIP بإطلالة على الحرم." },
  { title: "انطلاق من المدينة", description: "نقطة انطلاق ثابتة من المدينة المنورة وعودة في مواعيد محددة." },
  { title: "حجز آمن", description: "تأكيد فوري، تذكرة PDF، ومقعد مخصص لك في الحافلة." },
];

function Hero({ cms }: { cms: HomeCms | null | undefined }) {
  const title = cms?.hero_title || "احجز رحلتك للعمرة الآن";
  const subtitle = cms?.hero_subtitle || "رحلات منظّمة من المدينة المنورة إلى مكة المكرمة بأعلى درجات الراحة والموثوقية.";
  const cta = cms?.hero_cta || "ابدأ الحجز الآن";
  const bg = cms?.hero_image_url || "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1800&q=80";
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
      <div className="absolute inset-0 -z-10 opacity-[0.07] bg-[radial-gradient(circle_at_30%_20%,white,transparent_50%)]" />
      <div className="absolute inset-0 -z-10 opacity-20" style={{ backgroundImage: `url('${bg}')`, backgroundSize: "cover", backgroundPosition: "center", mixBlendMode: "overlay" }} />
      <div className="container-luxe py-20 md:py-28 lg:py-32 text-white">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full glass-bar !border-white/15 !bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-gold)]" />
            تجربة عمرة فاخرة وموثوقة
          </div>
          <div className="my-6"><Logo size={96} /></div>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.15] max-w-4xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-white/80 text-lg leading-relaxed">{subtitle}</p>
          <div className="mt-9 flex flex-col sm:flex-row items-center gap-3">
            <Link to="/booking">
              <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-14 px-8 text-base font-bold">{cta}<ArrowLeft className="mr-2 h-5 w-5" /></Button>
            </Link>
            <Link to="/gallery">
              <Button variant="outline" className="rounded-full h-14 px-8 text-base font-semibold bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white">استعرض الصور</Button>
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-white/70">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[color:var(--color-gold)]" /> مرخّصة رسمياً</span>
            <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[color:var(--color-gold)]" /> الرقم الموحد {BRAND.nationalNumber}</span>
            <span className="inline-flex items-center gap-2"><Star className="h-4 w-4 text-[color:var(--color-gold)]" /> آلاف المعتمرين السعداء</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { value: "+8000", label: "معتمر خدمتهم المؤسسة" },
    { value: "+450", label: "رحلة منظّمة سنوياً" },
    { value: "5★", label: "متوسط تقييم العملاء" },
    { value: "24/7", label: "دعم متواصل" },
  ];
  return (
    <section className="container-luxe -mt-12 relative z-10">
      <div className="surface-card grid grid-cols-2 md:grid-cols-4 p-6 md:p-8 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="text-center">
            <p className="text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">{s.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function About({ title, body }: { title: string; body: string }) {
  return (
    <section className="container-luxe py-16">
      <div className="surface-card p-8 md:p-12 max-w-4xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">{title}</h2>
        <p className="mt-4 text-muted-foreground leading-relaxed whitespace-pre-line">{body}</p>
      </div>
    </section>
  );
}

function Features({ items }: { items: { title: string; description: string }[] }) {
  const icons = [Bus, Hotel, MapPin, ShieldCheck];
  return (
    <section className="container-luxe py-20">
      <SectionHead eyebrow="ما يميّزنا" title="تجربة عمرة بلا قلق" desc="نهتم بكل تفاصيل رحلتك حتى تتفرغ تماماً للعبادة." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
        {items.map((it, i) => {
          const Icon = icons[i % icons.length];
          return (
            <motion.div key={it.title + i} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="surface-card p-6 hover:shadow-[var(--shadow-elegant)] transition-shadow">
              <div className="h-12 w-12 rounded-2xl bg-[color:var(--color-navy)] text-white flex items-center justify-center"><Icon className="h-6 w-6" /></div>
              <h3 className="mt-4 font-bold text-lg">{it.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{it.description}</p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function Steps() {
  const steps = ["اختر نوع الحجز وعدد الأفراد", "حدّد الفندق والرحلة", "اختر مقعدك في الحافلة", "أدخل بياناتك واستلم التذكرة"];
  return (
    <section className="bg-muted py-20">
      <div className="container-luxe">
        <SectionHead eyebrow="كيف تحجز" title="حجزك في 4 خطوات بسيطة" />
        <div className="grid md:grid-cols-4 gap-6 mt-12">
          {steps.map((s, i) => (
            <div key={s} className="surface-card p-6 relative">
              <div className="absolute -top-5 right-6 h-10 w-10 rounded-full btn-primary-glow flex items-center justify-center font-extrabold text-white">{i + 1}</div>
              <p className="mt-4 font-semibold leading-relaxed">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials({ items }: { items: { name: string; text: string }[] }) {
  return (
    <section className="container-luxe py-20">
      <SectionHead eyebrow="آراء العملاء" title="ماذا قالوا عنّا" />
      <div className="grid md:grid-cols-3 gap-6 mt-12">
        {items.map((t, i) => (
          <div key={i} className="surface-card p-6">
            <div className="flex gap-0.5">{[0,1,2,3,4].map(k => <Star key={k} className="h-4 w-4 fill-[color:var(--color-gold)] text-[color:var(--color-gold)]" />)}</div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">"{t.text}"</p>
            <p className="mt-3 font-bold text-[color:var(--color-navy)]">— {t.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <section className="bg-muted py-20">
      <div className="container-luxe max-w-3xl">
        <SectionHead eyebrow="أسئلة شائعة" title="كل ما تريد معرفته" />
        <Accordion type="single" collapsible className="mt-8 surface-card p-4">
          {items.map((f, i) => (
            <AccordionItem key={i} value={`f${i}`}>
              <AccordionTrigger className="font-bold text-right">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground whitespace-pre-line">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

function FinalCTA({ cms }: { cms: HomeCms | null | undefined }) {
  const title = cms?.cta_title || "جاهز لرحلة العمر؟";
  const body = cms?.cta_body || "اختر الباقة الأنسب لك وأكمل حجزك خلال دقائق.";
  const label = cms?.cta_button_label || "ابدأ الحجز الآن";
  return (
    <section className="container-luxe py-20">
      <div className="relative overflow-hidden rounded-[2rem] p-10 md:p-16 text-white text-center" style={{ background: "var(--gradient-navy)" }}>
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(circle at top right, var(--color-gold), transparent 50%)" }} />
        <div className="relative">
          <h2 className="text-3xl md:text-5xl font-extrabold">{title}</h2>
          <p className="mt-4 text-white/80 max-w-2xl mx-auto">{body}</p>
          <Link to="/booking" className="inline-block mt-8">
            <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-14 px-10 text-base font-bold">{label}</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <span className="inline-block text-xs font-bold tracking-widest uppercase text-primary">{eyebrow}</span>
      <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">{title}</h2>
      {desc && <p className="mt-3 text-muted-foreground">{desc}</p>}
    </div>
  );
}
