import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, Calendar, Users, Edit, XCircle, Eye, ArrowRight, Loader2, MapPin, Bus, Hotel, Phone, MessageCircle, Globe, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { sar } from "@/lib/format";
import { SiteLayout } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/_authenticated/my-bookings")({
  head: () => ({ meta: [{ title: `حجوزاتي | ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: MyBookingsPage,
});

interface MyBooking {
  id: string; booking_code: string; status: string; created_at: string;
  customer_name: string | null; passenger_count: number; total_price: number;
  trip_id: string | null; bus_id: string | null; no_hotel: boolean; no_bus: boolean;
  seat_numbers: string[] | null;
  contact_phone: string | null; whatsapp_phone: string | null;
  nationality: string | null; booking_source: string | null;
  trips: { name: string; departure_day: string; return_day: string } | null;
  buses: { name: string | null; bus_number: number } | null;
  packages: { name: string } | null;
}

function isPast(dateStr?: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr); d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

function effectiveStatus(b: MyBooking): "cancelled" | "completed" | "active" {
  if (b.status === "cancelled") return "cancelled";
  if (isPast(b.trips?.departure_day)) return "completed";
  return "active";
}

function MyBookingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [uid, setUid] = useState<string>("");
  const [details, setDetails] = useState<MyBooking | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUid(user.id);
    })();
  }, []);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,booking_code,status,created_at,customer_name,passenger_count,total_price,trip_id,bus_id,no_hotel,no_bus,seat_numbers,contact_phone,whatsapp_phone,nationality,booking_source,trips(name,departure_day,return_day),buses(name,bus_number),packages(name)")
        .eq("created_by", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyBooking[];
    },
  });

  const sorted = useMemo(() => {
    const order = { active: 0, completed: 1, cancelled: 2 } as const;
    return [...bookings].sort((a, b) => {
      const sa = effectiveStatus(a), sb = effectiveStatus(b);
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return (b.trips?.departure_day || "").localeCompare(a.trips?.departure_day || "");
    });
  }, [bookings]);

  async function deleteBooking(b: MyBooking) {
    if (!confirm(`هل أنت متأكد من حذف الحجز ${b.booking_code}؟`)) return;
    const { error } = await supabase.from("bookings").update({ deleted_at: new Date().toISOString() }).eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الحجز");
    qc.invalidateQueries({ queryKey: ["my-bookings", uid] });
  }

  function editBooking(code: string) {
    localStorage.setItem("edit_booking_code", code);
    navigate({ to: "/booking" });
  }

  return (
    <SiteLayout>
      <div className="container-luxe py-10 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-extrabold flex items-center gap-2">
            <Ticket className="h-6 w-6 text-primary" /> حجوزاتي
          </h1>
          <div className="flex gap-2">
            <Link to="/booking"><Button className="btn-primary-glow rounded-xl">حجز جديد</Button></Link>
            <Link to="/"><Button variant="outline" className="rounded-xl gap-1"><ArrowRight className="h-4 w-4" /> الرئيسية</Button></Link>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
        ) : sorted.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <Ticket className="h-14 w-14 mx-auto text-muted-foreground/40" />
            <p className="mt-4 font-semibold text-lg">لا توجد لديك حجوزات بعد.</p>
            <Link to="/booking"><Button className="mt-6 h-14 px-8 text-lg btn-primary-glow rounded-xl">ابدأ الحجز</Button></Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {sorted.map((b) => {
              const eff = effectiveStatus(b);
              const canModify = eff === "active";
              const cardStyle =
                eff === "cancelled" ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900" :
                eff === "completed" ? "bg-gray-50 border-gray-200 dark:bg-gray-900/40 dark:border-gray-800 opacity-90" :
                "";
              const badge =
                eff === "cancelled" ? { cls: "bg-red-500 text-white", label: "ملغي" } :
                eff === "completed" ? { cls: "bg-gray-500 text-white", label: "مكتمل" } :
                { cls: "bg-green-600 text-white", label: "نشط" };
              return (
                <div key={b.id} className={`surface-card p-5 border-2 ${cardStyle}`}>
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary text-lg">{b.booking_code}</span>
                        <Badge className={badge.cls}>{badge.label}</Badge>
                        {b.no_hotel && <Badge variant="outline">بدون فندق</Badge>}
                        {b.no_bus && <Badge variant="outline">بدون حافلة</Badge>}
                      </div>
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> تاريخ الحجز: <b className="text-foreground">{new Date(b.created_at).toLocaleDateString("ar")}</b></span>
                        {b.trips && <span className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> تاريخ الرحلة: <b className="text-foreground">{new Date(b.trips.departure_day).toLocaleDateString("ar")}</b></span>}
                        {b.packages && <span className="flex items-center gap-2 text-muted-foreground"><Hotel className="h-4 w-4" /> الفندق: <b className="text-foreground">{b.packages.name}</b></span>}
                        {b.buses && <span className="flex items-center gap-2 text-muted-foreground"><Bus className="h-4 w-4" /> الحافلة: <b className="text-foreground">{b.buses.name || `حافلة ${b.buses.bus_number}`}</b></span>}
                        {b.seat_numbers && b.seat_numbers.length > 0 && <span className="flex items-center gap-2 text-muted-foreground col-span-full">🎫 المقاعد: <b className="text-foreground font-mono">{b.seat_numbers.join(", ")}</b></span>}
                        <span className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /> عدد الأفراد: <b className="text-foreground">{b.passenger_count}</b></span>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-extrabold text-primary">{sar(b.total_price)}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => setDetails(b)}>
                      <Eye className="h-3 w-3" /> عرض التفاصيل
                    </Button>
                    {canModify && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => editBooking(b.booking_code)}>
                          <Edit className="h-3 w-3" /> تعديل الحجز
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl gap-1 text-destructive hover:bg-destructive/10" onClick={() => deleteBooking(b)}>
                          <XCircle className="h-3 w-3" /> حذف الحجز
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>تفاصيل الحجز</DialogTitle></DialogHeader>
          {details && (() => {
            const eff = effectiveStatus(details);
            const badge = eff === "cancelled" ? "ملغي" : eff === "completed" ? "مكتمل" : "نشط";
            const rows: [string, React.ReactNode][] = [
              ["رقم الحجز", <span className="font-mono">{details.booking_code}</span>],
              ["تاريخ الحجز", new Date(details.created_at).toLocaleDateString("ar")],
              ["تاريخ الرحلة", details.trips ? new Date(details.trips.departure_day).toLocaleDateString("ar") : "—"],
              ["الفندق", details.packages?.name || (details.no_hotel ? "بدون فندق" : "—")],
              ["الحافلة", details.buses ? (details.buses.name || `حافلة ${details.buses.bus_number}`) : (details.no_bus ? "بدون حافلة" : "—")],
              ["المقاعد", details.seat_numbers?.join(", ") || "—"],
              ["اسم العميل", details.customer_name || "—"],
              ["رقم الجوال", details.contact_phone || "—"],
              ["رقم الواتساب", details.whatsapp_phone || "—"],
              ["الجنسية", details.nationality || "—"],
              ["مصدر الحجز", details.booking_source || "—"],
              ["حالة الحجز", badge],
            ];
            return (
              <div className="space-y-2 text-sm">
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border/50 py-2">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-semibold text-left">{v}</span>
                  </div>
                ))}
                <div className="pt-3">
                  <Link to="/ticket/$code" params={{ code: details.booking_code }}>
                    <Button className="w-full rounded-xl btn-primary-glow">فتح التذكرة</Button>
                  </Link>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}
