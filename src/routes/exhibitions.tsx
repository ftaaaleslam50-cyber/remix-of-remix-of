import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Store } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { BRAND } from "@/lib/brand";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/exhibitions")({
  head: () => ({
    meta: [
      { title: `المعارض | ${BRAND.name}` },
      { name: "description", content: "استعرض معارض وفعاليات مؤسسة زهرة طيبة للعمرة وسجّل حضورك مسبقاً." },
      { property: "og:title", content: `المعارض | ${BRAND.name}` },
      { property: "og:description", content: "معارض وفعاليات زهرة طيبة." },
    ],
  }),
  component: ExhibitionsPage,
});

interface Exh {
  id: string; title: string; description: string | null; image_url: string | null;
  location: string | null; starts_at: string | null; ends_at: string | null;
}

function ExhibitionsPage() {
  const { data: rows = [] } = useQuery({
    queryKey: ["exhibitions-public"],
    queryFn: async () => {
      const { data } = await supabase.from("exhibitions" as never).select("*").eq("active", true).order("display_order");
      return (data as unknown as Exh[]) ?? [];
    },
  });

  return (
    <SiteLayout>
      <section className="container-luxe py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="inline-block text-xs font-bold tracking-widest uppercase text-primary">المعارض</span>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-[color:var(--color-navy)]">فعاليات ومعارض زهرة طيبة</h1>
          <p className="mt-3 text-muted-foreground">اطّلع على معارضنا القادمة وسجّل حضورك للاستفادة من عروض حصرية.</p>
        </div>
        {rows.length === 0 && <div className="surface-card p-10 text-center text-muted-foreground">لا توجد معارض حالياً</div>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rows.map(e => <ExhCard key={e.id} exh={e} />)}
        </div>
      </section>
    </SiteLayout>
  );
}

function ExhCard({ exh }: { exh: Exh }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function register() {
    if (!name.trim() || !phone.trim()) return toast.error("الاسم والجوال مطلوبان");
    setBusy(true);
    const { error } = await supabase.from("exhibition_registrations" as never).insert({
      exhibition_id: exh.id, full_name: name.trim(), phone: phone.trim(), notes: notes.trim() || null,
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم التسجيل — سنتواصل معك قريباً");
    setOpen(false); setName(""); setPhone(""); setNotes("");
  }

  return (
    <div className="surface-card overflow-hidden flex flex-col">
      {exh.image_url && <img src={exh.image_url} alt={exh.title} className="h-48 w-full object-cover" />}
      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-lg font-extrabold text-[color:var(--color-navy)]">{exh.title}</h3>
        {exh.description && <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1">{exh.description}</p>}
        <div className="mt-3 text-xs text-muted-foreground space-y-1">
          {exh.location && <p className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {exh.location}</p>}
          {exh.starts_at && <p className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {formatDate(exh.starts_at)}{exh.ends_at ? ` — ${formatDate(exh.ends_at)}` : ""}</p>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="btn-primary-glow rounded-full mt-4 w-full font-bold"><Store className="h-4 w-4 ml-1" /> سجّل حضورك</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>التسجيل في {exh.title}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Input placeholder="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} />
              <Input dir="ltr" placeholder="رقم الجوال" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Textarea placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <DialogFooter>
              <Button disabled={busy} onClick={register} className="btn-primary-glow rounded-full font-bold">{busy ? "..." : "تأكيد التسجيل"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
