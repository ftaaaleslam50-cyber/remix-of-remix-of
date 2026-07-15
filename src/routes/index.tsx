import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, ShieldCheck, Sparkles, Star, UserPlus, LogIn, Gift, ArrowDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Logo } from "@/components/site/Logo";
import { BRAND } from "@/lib/brand";
import { supabase } from "@/integrations/supabase/client";

interface HomeCms {
  hero_title: string;
  hero_subtitle: string;
  hero_cta: string;
  hero_image_url: string | null;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} | احجز رحلتك للعمرة الآن` },
      {
        name: "description",
        content:
          "رحلات عمرة منظّمة من المدينة المنورة إلى مكة المكرمة. باقات أفراد وعوائل، فنادق مختارة، حافلات حديثة، وأسعار شفافة.",
      },
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
      const { data } = await supabase
        .from("app_settings")
        .select("hero_title,hero_subtitle,hero_cta,hero_image_url")
        .eq("id", 1)
        .maybeSingle();
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
      <BookingJourney />
      <CreateAccount />
      <LuckyDraw />
    </SiteLayout>
  );
}

function Hero({ cms }: { cms: HomeCms | null | undefined }) {
  const title = cms?.hero_title || "احجز رحلتك الآن وادفع داخل الحافلة ";
  const subtitle = cms?.hero_subtitle || "تحرك من مسجد قباء إلى مكة المكرمة مباشرة";
  const cta = cms?.hero_cta || "ابدأ الحجز الآن";
  const bg = cms?.hero_image_url || "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1800&q=80";
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-hero)" }} />
      <div className="absolute inset-0 -z-10 opacity-[0.07] bg-[radial-gradient(circle_at_30%_20%,white,transparent_50%)]" />
      <div
        className="absolute inset-0 -z-10 opacity-20"
        style={{
          backgroundImage: `url('${bg}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          mixBlendMode: "overlay",
        }}
      />
      <div className="container-luxe py-20 md:py-28 lg:py-32 text-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center text-center"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass-bar !border-white/15 !bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-gold)]" />
            تجربة عمرة فاخرة وموثوقة
          </div>
          <div className="my-6">
            <Logo size={96} />
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold leading-[1.15] max-w-4xl">{title}</h1>
          <p className="mt-5 max-w-2xl text-white/80 text-lg leading-relaxed">{subtitle}</p>
          <div className="mt-9 flex flex-col sm:flex-row items-center gap-3">
            <Link to="/booking">
              <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-14 px-8 text-base font-bold">
                {cta}
                <ArrowLeft className="mr-2 h-5 w-5" />
              </Button>
            </Link>
            <Link to="/packages">
              <Button
                variant="outline"
                className="rounded-full h-14 px-8 text-base font-semibold bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
              >
                استعرض الباقات
              </Button>
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-white/70">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[color:var(--color-gold)]" /> مرخّصة رسمياً
            </span>
            <span className="inline-flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-[color:var(--color-gold)]" /> رقم السجل التجاري {BRAND.nationalNumber}
            </span>
            <span className="inline-flex items-center gap-2">
              <Star className="h-4 w-4 text-[color:var(--color-gold)]" /> آلاف المعتمرين السعداء
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function Stats() {
  const stats = [
    { value: "+20000", label: "معتمر خدمتهم المؤسسة" },
    { value: "+500", label: "رحلة منظّمة" },
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

function BookingJourney() {
  const steps = [
    "اختر نوع الحجز وعدد الأفراد",
    "اختر الفندق والرحلة",
    "اختر الحافلة ثم المقعد",
    "أدخل بياناتك واستلم تذكرتك",
  ];
  return (
    <section className="container-luxe py-16">
      <div className="surface-card p-8 md:p-12 max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-primary">رحلة الحجز</span>
          <h2 className="mt-2 text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">
            حجزك في 4 خطوات بسيطة
          </h2>
          <p className="mt-3 text-muted-foreground">تجربة حجز سريعة وسهلة تناسب الجميع.</p>
        </div>
        <ol className="space-y-3 max-w-xl mx-auto">
          {steps.map((s, i) => (
            <li key={s}>
              <div className="flex items-center gap-4 rounded-2xl border-2 border-[color:var(--color-navy)]/10 bg-white p-4">
                <div className="h-11 w-11 shrink-0 rounded-full btn-primary-glow flex items-center justify-center font-extrabold text-white text-lg">
                  {i + 1}
                </div>
                <p className="font-semibold leading-relaxed text-[color:var(--color-navy)]">{s}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="flex justify-center py-1 text-[color:var(--color-navy)]/40">
                  <ArrowDown className="h-4 w-4" />
                </div>
              )}
            </li>
          ))}
        </ol>
        <div className="mt-8 flex justify-center">
          <Link to="/booking">
            <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-14 px-10 text-base font-bold">
              ابدأ الحجز الآن
              <ArrowLeft className="mr-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function CreateAccount() {
  return (
    <section className="container-luxe py-16">
      <div
        className="relative overflow-hidden rounded-[2rem] p-8 md:p-14 text-white"
        style={{ background: "var(--gradient-navy)" }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: "radial-gradient(circle at top left, var(--color-gold), transparent 55%)" }}
        />
        <div className="relative grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold">وفّر وقتك في كل عملية حجز</h2>
            <p className="mt-4 text-white/80 leading-relaxed max-w-2xl">
              احفظ بياناتك مرة واحدة، واستعرض جميع حجوزاتك، وعدّلها بسهولة، دون الحاجة إلى إدخال معلوماتك في كل مرة.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row md:flex-col gap-3 md:min-w-[220px]">
            <Link to="/auth" search={{ mode: "signup" } as never} className="w-full">
              <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-12 px-6 w-full font-bold">
                <UserPlus className="ml-2 h-5 w-5" /> إنشاء حساب
              </Button>
            </Link>
            <Link to="/auth" className="w-full">
              <Button
                variant="outline"
                className="rounded-full h-12 px-6 w-full font-semibold bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
              >
                <LogIn className="ml-2 h-5 w-5" /> تسجيل الدخول
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function LuckyDraw() {
  return (
    <section className="container-luxe py-16">
      <div className="surface-card p-8 md:p-12 text-center max-w-3xl mx-auto relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{ background: "radial-gradient(circle at 50% 0%, var(--color-gold), transparent 60%)" }}
        />
        <div className="relative">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--color-gold)]/15 text-[color:var(--color-gold)] mb-4">
            <Gift className="h-8 w-8" />
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">
            🎉 كل شهر لديك فرصة للفوز!
          </h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            لف عجلة الحظ الآن، وادخل السحب الشهري للفوز بعمرة مجانية بالكامل أو خصومات حصرية وجوائز مميزة.
          </p>
          <div className="mt-8">
            <Link to="/draw">
              <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-14 px-10 text-base font-bold">
                اذهب إلى السحب
                <ArrowLeft className="mr-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
