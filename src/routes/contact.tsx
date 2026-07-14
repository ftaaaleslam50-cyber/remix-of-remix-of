import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Mail, MessageCircle, Phone, MapPin, Music2, Instagram, Camera, Send, Facebook, Twitter, Youtube } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import type { AppSettings } from "@/lib/booking/types";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: `تواصل معنا | ${BRAND.name}` },
      { name: "description", content: "تواصل مع مؤسسة زهرة طيبة للعمرة عبر الواتساب أو الهاتف أو البريد الإلكتروني." },
      { property: "og:title", content: `تواصل معنا | ${BRAND.name}` },
      { property: "og:description", content: "نسعد بخدمتكم والرد على استفساراتكم." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { data: s } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle()).data as AppSettings | null,
  });

  const s2 = s as (AppSettings & { telegram_url?: string; facebook_url?: string; twitter_url?: string; youtube_url?: string }) | null;
  const cards = [
    { icon: MessageCircle, label: "واتساب", value: s?.whatsapp ?? "", href: `https://wa.me/${(s?.whatsapp ?? "").replace(/\D/g, "")}`, color: "bg-[#25D366]" },
    { icon: Phone, label: "هاتف", value: s?.phone ?? "", href: `tel:${s?.phone ?? ""}`, color: "bg-[color:var(--color-navy)]" },
    { icon: Mail, label: "البريد الإلكتروني", value: s?.email ?? BRAND.email, href: `mailto:${s?.email ?? BRAND.email}`, color: "bg-primary" },
    { icon: Send, label: "تيليغرام", value: "Telegram", href: s2?.telegram_url || "#", color: "bg-[#0088cc]" },
    { icon: Facebook, label: "فيسبوك", value: "Facebook", href: s2?.facebook_url || "#", color: "bg-[#1877F2]" },
    { icon: Twitter, label: "X (تويتر)", value: "X", href: s2?.twitter_url || "#", color: "bg-black" },
    { icon: Youtube, label: "يوتيوب", value: "YouTube", href: s2?.youtube_url || "#", color: "bg-[#FF0000]" },
    { icon: Music2, label: "تيك توك", value: "TikTok", href: s?.tiktok_url || "#", color: "bg-black" },
    { icon: Instagram, label: "إنستغرام", value: "Instagram", href: s?.instagram_url || "#", color: "bg-gradient-to-tr from-pink-500 to-orange-400" },
    { icon: Camera, label: "سناب شات", value: "Snapchat", href: s?.snapchat_url || "#", color: "bg-yellow-400 text-black" },
    { icon: MapPin, label: "خرائط جوجل", value: "Maps", href: s?.maps_url || "#", color: "bg-emerald-600" },
  ].filter((c) => c.href && c.href !== "#");

  return (
    <SiteLayout>
      <section className="relative" style={{ background: "var(--gradient-navy)" }}>
        <div className="container-luxe py-16 text-white text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold">تواصل معنا</h1>
          <p className="mt-3 text-white/75 max-w-2xl mx-auto">يسعدنا الرد على جميع استفساراتكم وخدمتكم في أي وقت.</p>
        </div>
      </section>

      <section className="container-luxe py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map((c) => (
            <a
              key={c.label}
              href={c.href}
              target={c.href.startsWith("http") ? "_blank" : undefined}
              rel="noopener noreferrer"
              className="surface-card p-6 hover:shadow-[var(--shadow-elegant)] hover:-translate-y-1 transition-all group"
            >
              <div className={`h-14 w-14 rounded-2xl text-white flex items-center justify-center ${c.color}`}>
                <c.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 font-extrabold text-lg">{c.label}</h3>
              <p className="text-sm text-muted-foreground mt-1 break-all" dir="ltr">{c.value}</p>
            </a>
          ))}
        </div>

        <div className="surface-card mt-10 p-8 text-center">
          <h2 className="text-2xl font-extrabold text-[color:var(--color-navy)]">{BRAND.name}</h2>
          <p className="mt-2 text-muted-foreground">الرقم الوطني الموحد: <span className="font-bold text-foreground">{BRAND.nationalNumber}</span></p>
          <p className="mt-1 text-muted-foreground">البريد الإلكتروني: <span className="font-bold text-foreground" dir="ltr">{BRAND.email}</span></p>
        </div>
      </section>
    </SiteLayout>
  );
}
