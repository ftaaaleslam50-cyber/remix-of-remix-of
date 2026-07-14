import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, Calendar, Users, Edit, XCircle, Eye, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  trips: { name: string; departure_day: string; return_day: string } | null;
  buses: { name: string | null; bus_number: number } | null;
  packages: { name: string } | null;
}

function MyBookingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [uid, setUid] = useState<string>("");

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
        .select("id,booking_code,status,created_at,customer_name,passenger_count,total_price,trip_id,bus_id,no_hotel,no_bus,trips(name,departure_day,return_day),buses(name,bus_number),packages(name)")
        .eq("created_by", uid)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyBooking[];
    },
  });

  async function cancelBooking(code: string) {
    if (!confirm("هل تريد إلغاء هذا الحجز؟")) return;
    const { error } = await supabase.from("bookings").update({ status: "cancelled" }).eq("booking_code", code);
    if (error) return toast.error(error.message);
    toast.success("تم إلغاء الحجز");
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
        ) : bookings.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <Ticket className="h-14 w-14 mx-auto text-muted-foreground/40" />
            <p className="mt-4 font-semibold">لا توجد حجوزات بعد</p>
            <Link to="/booking"><Button className="mt-4 btn-primary-glow rounded-xl">ابدأ حجزك الأول</Button></Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {bookings.map((b) => {
              const statusColor =
                b.status === "confirmed" ? "bg-success" :
                b.status === "cancelled" ? "bg-destructive" :
                b.status === "pending" ? "bg-warning" : "bg-muted-foreground";
              const canEdit = b.status !== "cancelled";
              return (
                <div key={b.id} className="surface-card p-5">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-primary">{b.booking_code}</span>
                        <Badge className={`${statusColor} text-white`}>{b.status}</Badge>
                        {b.no_hotel && <Badge variant="outline">بدون فندق</Badge>}
                        {b.no_bus && <Badge variant="outline">بدون حافلة</Badge>}
                      </div>
                      <p className="mt-1 font-semibold">{b.customer_name}</p>
                      <div className="mt-2 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        {b.packages && <span>🏨 {b.packages.name}</span>}
                        {b.trips && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {b.trips.name}</span>}
                        {b.buses && <span>🚌 {b.buses.name || `حافلة ${b.buses.bus_number}`}</span>}
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {b.passenger_count}</span>
                      </div>
                    </div>
                    <div className="text-left">
                      <p className="text-2xl font-extrabold text-primary">{sar(b.total_price)}</p>
                      <p className="text-xs text-muted-foreground">{new Date(b.created_at).toLocaleDateString("ar")}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2 flex-wrap">
                    <Link to="/ticket/$code" params={{ code: b.booking_code }}>
                      <Button size="sm" variant="outline" className="rounded-xl gap-1"><Eye className="h-3 w-3" /> عرض التذكرة</Button>
                    </Link>
                    {canEdit && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-xl gap-1" onClick={() => editBooking(b.booking_code)}>
                          <Edit className="h-3 w-3" /> تعديل
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-xl gap-1 text-destructive hover:bg-destructive/10" onClick={() => cancelBooking(b.booking_code)}>
                          <XCircle className="h-3 w-3" /> إلغاء
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
    </SiteLayout>
  );
}
