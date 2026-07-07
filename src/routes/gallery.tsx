import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { X } from "lucide-react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Album { id: string; name: string; slug: string }
interface Image { id: string; album_id: string; image_url: string; caption: string }

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: `المعرض | ${BRAND.name}` },
      { name: "description", content: "استعرض صور الرحلات والفنادق والحافلات والخدمات." },
      { property: "og:title", content: `معرض الصور | ${BRAND.name}` },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);

  const { data: albums = [] } = useQuery({
    queryKey: ["albums"],
    queryFn: async () => (await supabase.from("gallery_albums").select("*").order("display_order")).data as Album[] ?? [],
  });
  const { data: images = [] } = useQuery({
    queryKey: ["images"],
    queryFn: async () => (await supabase.from("gallery_images").select("*").order("display_order")).data as Image[] ?? [],
  });

  const shown = filter === "all" ? images : images.filter((i) => albums.find((a) => a.slug === filter)?.id === i.album_id);

  return (
    <SiteLayout>
      <section className="relative" style={{ background: "var(--gradient-navy)" }}>
        <div className="container-luxe py-16 text-white text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold">معرض الصور</h1>
          <p className="mt-3 text-white/75">استعرض صور الرحلات والفنادق والخدمات.</p>
        </div>
      </section>

      <section className="container-luxe py-10">
        <div className="flex flex-wrap gap-2 justify-center">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>الكل</FilterChip>
          {albums.map((a) => (
            <FilterChip key={a.id} active={filter === a.slug} onClick={() => setFilter(a.slug)}>{a.name}</FilterChip>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {shown.map((img) => (
            <button
              key={img.id}
              onClick={() => setOpen(img.image_url)}
              className="group rounded-2xl overflow-hidden shadow-[var(--shadow-soft)] border border-border bg-muted aspect-[4/3] block"
            >
              <img
                src={img.image_url}
                alt={img.caption || "معرض"}
                className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500"
                loading="lazy"
              />
            </button>
          ))}
          {shown.length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-10">لا توجد صور في هذا القسم بعد.</p>
          )}
        </div>

        <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
            <button onClick={() => setOpen(null)} className="absolute top-2 left-2 z-10 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center"><X /></button>
            {open && <img src={open} alt="" className="w-full max-h-[85vh] object-contain" />}
          </DialogContent>
        </Dialog>
      </section>
    </SiteLayout>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${
        active ? "btn-primary-glow text-white" : "bg-muted text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
