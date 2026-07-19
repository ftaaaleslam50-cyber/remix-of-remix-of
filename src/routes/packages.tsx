import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { AssetImg } from "@/components/admin/AssetImg";


export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: `الباقات | ${BRAND.name}` },
      { name: "description", content: `تصفح باقات ${BRAND.name} واحجز رحلتك بسهولة.` },
      { property: "og:title", content: `الباقات | ${BRAND.name}` },
      { property: "og:description", content: `تصفح باقات ${BRAND.name} واحجز رحلتك بسهولة.` },
    ],
  }),
  component: PackagesPage,
});

interface PackageImage {
  id: string;
  image_url: string;
  caption: string | null;
  display_order: number;
}

function PackagesPage() {
  const { data: images = [], isLoading } = useQuery({
    queryKey: ["package-images"],
    queryFn: async () => {
      const { data } = await supabase
        .from("package_images" as never)
        .select("*")
        .order("display_order");
      return (data as PackageImage[]) ?? [];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["packages-cta-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("whatsapp")
        .eq("id", 1)
        .maybeSingle();
      return data as { whatsapp: string | null } | null;
    },
  });

  const rawNumber = (settings?.whatsapp || BRAND.whatsapp).replace(/\D/g, "");
  const waText = encodeURIComponent("السلام عليكم، أرغب في الاستفسار عن حجز رحلة عمرة.");
  const waHref = `https://wa.me/${rawNumber}?text=${waText}`;

  return (
    <SiteLayout>
      <section className="container-luxe py-12">
        <header className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">الباقات</h1>
          <p className="text-muted-foreground mt-2">تصفح صور باقاتنا المتاحة</p>
        </header>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-16">جارٍ التحميل...</div>
        ) : images.length === 0 ? (
          <div className="text-center text-muted-foreground py-16">لا توجد صور بعد.</div>
        ) : (
          <div className="space-y-6">
            {images.map((img) => (
              <figure key={img.id} className="surface-card overflow-hidden">
                <AssetImg
                  src={img.image_url}
                  alt={img.caption ?? "باقة"}
                  className="w-full h-auto block"
                />

                {img.caption && (
                  <figcaption className="p-3 text-sm text-center font-semibold text-[color:var(--color-navy)]">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        )}

        {/* Full-width promotional CTA */}
        <div
          className="relative overflow-hidden rounded-2xl sm:rounded-[2rem] p-5 sm:p-8 md:p-14 text-white mt-10 sm:mt-14"
          style={{ background: "var(--gradient-navy)" }}
        >
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ background: "radial-gradient(circle at top right, var(--color-gold), transparent 55%)" }}
          />
          <div className="relative text-center max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold">صمّم رحلتك كما تريد</h2>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-white/80 leading-relaxed">
              اختر الفندق، والرحلة، والحافلة، والمقاعد بكل مرونة، واستمتع بتجربة حجز تناسب احتياجاتك.
            </p>

            <div className="mt-6 sm:mt-8 grid gap-3 max-w-xl mx-auto">
              <Link to="/booking" className="w-full">
                <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-12 sm:h-14 w-full px-4 sm:px-8 text-sm sm:text-base font-bold whitespace-nowrap">
                  <span className="truncate">ابدأ الحجز الآن</span>
                  <ArrowLeft className="mr-2 h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                </Button>
              </Link>

              <div className="flex items-center gap-3 my-1 text-white/60">
                <span className="flex-1 h-px bg-white/20" />
                <span className="text-xs font-semibold">أو</span>
                <span className="flex-1 h-px bg-white/20" />
              </div>

              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full"
              >
                <Button
                  className="rounded-full h-12 sm:h-14 w-full px-4 sm:px-8 text-sm sm:text-base font-bold bg-[#25D366] hover:bg-[#1FB755] text-white border-0 whitespace-nowrap"
                >
                  <MessageCircle className="ml-2 h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                  <span className="truncate">احجز عبر واتساب</span>
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
