import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { SiteLayout } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/packages")({
  head: () => ({
    meta: [
      { title: `الباقات | ${BRAND.name}` },
      { name: "description", content: `تصفح باقات ${BRAND.name} من خلال معرض الصور.` },
      { property: "og:title", content: `الباقات | ${BRAND.name}` },
      { property: "og:description", content: `تصفح باقات ${BRAND.name} من خلال معرض الصور.` },
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <figure key={img.id} className="surface-card overflow-hidden">
                <img
                  src={img.image_url}
                  alt={img.caption ?? "باقة"}
                  loading="lazy"
                  className="w-full h-64 object-cover"
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
      </section>
    </SiteLayout>
  );
}
