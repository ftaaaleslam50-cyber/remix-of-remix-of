import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, Calendar, Users, Edit, XCircle, Eye, ArrowRight, Loader2, MapPin, Bus, Hotel, Phone, MessageCircle, Globe, User, PlusCircle, Search } from "lucide-react";
import { ManualBookingRow } from "@/components/admin/ManualBookingRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { sar, formatDateTime } from "@/lib/format";
import { SiteLayout } from "@/components/site/SiteLayout";
import { bookingBlockedMessage } from "@/lib/booking-availability";
import { departureDisplay, returnActualDisplay, tripWithDate } from "@/lib/return-display";

export const Route = createFileRoute("/_authenticated/my-bookings")({
  head: () => ({ meta: [{ title: `حجوزاتي | ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: MyBookingsPage,
});

interface MyBooking {
  id: string; booking_code: string; status: string; created_at: string; no_show?: boolean | null;
  customer_name: string | null; passenger_count: number; total_price: number; room_type?: string | null;
  trip_id: string | null; bus_id: string | null; no_hotel: boolean; no_bus: boolean;
  seat_numbers: string[] | null;
  contact_phone: string | null; whatsapp_phone: string | null;
  nationality: string | null; booking_source: string | null;
  extension_nights?: number | null;
  trip_mode?: string | null;
  departure_date?: string | null;
  return_date?: string | null;
  trips: { name: string; departure_day: string; return_day: string; departure_date?: string | null; return_date?: string | null } | null;
  buses: { name: string | null; bus_number: number } | null;
  packages: { name: string } | null;
}

function isPast(dateStr?: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr); d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

function effectiveStatus(b: MyBooking): "no_show" | "cancelled" | "completed" | "active" {
  if (b.no_show) return "no_show";
  if (b.status === "cancelled") return "cancelled";
  if (isPast(b.trips?.departure_day)) return "completed";
  return "active";
}

function MyBookingsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [uid, setUid] = useState<string>("");
  const [isRep, setIsRep] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [details, setDetails] = useState<MyBooking | null>(null);
  const [search, setSearch] = useState("");


  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);
      const [{ data: role }, { data: profile }] = await Promise.all([
        supabase
          .from("user_roles").select("role").eq("user_id", user.id).eq("role", "representative").maybeSingle(),
        supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle(),
      ]);
      setIsRep(!!role || profile?.account_type === "representative");
    })();
  }, []);


  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,booking_code,status,no_show,created_at,customer_name,passenger_count,total_price,room_type,trip_id,bus_id,no_hotel,no_bus,seat_numbers,contact_phone,whatsapp_phone,nationality,booking_source,extension_nights,trip_mode,departure_date,return_date,trips(name,departure_day,return_day,departure_date,return_date),buses!bookings_bus_id_fkey(name,bus_number),packages(name)")
        .eq("created_by", uid)
        .or("deleted_at.is.null,no_show.is.true")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyBooking[];
    },
  });

  const sorted = useMemo(() => {
    const order = { active: 0, completed: 1, no_show: 2, cancelled: 3 } as const;
    return [...bookings].sort((a, b) => {
      const sa = effectiveStatus(a), sb = effectiveStatus(b);
      if (order[sa] !== order[sb]) return order[sa] - order[sb];
      return (b.trips?.departure_day || "").localeCompare(a.trips?.departure_day || "");
    });
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((b) =>
      (b.customer_name || "").toLowerCase().includes(q) ||
      (b.booking_code || "").toLowerCase().includes(q) ||
      (b.contact_phone || "").includes(q)
    );
  }, [sorted, search]);

  const groups = useMemo(() => {
    const startOfWeek = (d: Date) => {
      const x = new Date(d); x.setHours(0, 0, 0, 0);
      x.setDate(x.getDate() - x.getDay()); // الأحد
      return x;
    };
    const thisWeekStart = startOfWeek(new Date()).getTime();
    const lastWeekStart = thisWeekStart - 7 * 86400000;

    const refTime = (b: MyBooking) => {
      const s = b.departure_date ?? b.trips?.departure_date ?? b.trips?.departure_day ?? b.created_at;
      const t = new Date(s as string).getTime();
      return Number.isNaN(t) ? new Date(b.created_at).getTime() : t;
    };
    const tripLabel = (b: MyBooking) =>
      b.trips ? tripWithDate(b.trips.name, b.departure_date ?? b.trips.departure_date, b.trips.departure_day) : "بدون رحلة";

    const buckets: Record<string, MyBooking[]> = { current: [], last: [], older: [] };
    for (const b of filtered) {
      const t = refTime(b);
      if (t >= thisWeekStart) buckets.current.push(b);
      else if (t >= lastWeekStart) buckets.last.push(b);
      else buckets.older.push(b);
    }

    const out: { title: string; items: MyBooking[] }[] = [];
    const push = (title: string, items: MyBooking[], forceByTrip = false) => {
      if (!items.length) return;
      if (!forceByTrip && items.length < 10) { out.push({ title, items }); return; }
      const byTrip = new Map<string, MyBooking[]>();
      for (const b of items) {
        const k = String(tripLabel(b));
        byTrip.set(k, [...(byTrip.get(k) ?? []), b]);
      }
      for (const [k, v] of byTrip) out.push({ title: `${title} — ${k}`, items: v });
    };
    push("حجوزات الأسبوع الحالي", buckets.current);
    push("حجوزات الأسبوع الماضي", buckets.last);
    push("حجوزات سابقة", buckets.older, true);
    return out;
  }, [filtered]);

  /** Mini dashboard: bookings / passengers / rooms per trip (active bookings only). */
  const tripStats = useMemo(() => {
    const active = bookings.filter((b) => effectiveStatus(b) === "active");
    const map = new Map<string, { label: string; bookings: number; passengers: number; rooms: number; time: number }>();
    for (const b of active) {
      const key = `${b.trip_id ?? "none"}-${b.departure_date ?? b.trips?.departure_date ?? ""}`;
      const label = b.trips ? String(tripWithDate(b.trips.name, b.departure_date ?? b.trips.departure_date, b.trips.departure_day)) : "بدون رحلة";
      const cur = map.get(key) ?? { label, bookings: 0, passengers: 0, rooms: 0, time: new Date((b.departure_date ?? b.trips?.departure_date ?? b.created_at) as string).getTime() || 0 };
      cur.bookings += 1;
      cur.passengers += b.passenger_count || 0;
      if (!b.no_hotel) {
        const cap = Number(b.room_type) || 0;
        cur.rooms += cap > 0 ? Math.ceil((b.passenger_count || 0) / cap) : 0;
      }
      map.set(key, cur);
    }
    const rows = [...map.values()].sort((a, b) => b.time - a.time);
    const totals = rows.reduce((t, r) => ({ bookings: t.bookings + r.bookings, passengers: t.passengers + r.passengers, rooms: t.rooms + r.rooms }), { bookings: 0, passengers: 0, rooms: 0 });
    return { rows, totals };
  }, [bookings]);




  async function deleteBooking(b: MyBooking) {
    const blocked = await bookingBlockedMessage();
    if (blocked) return toast.error(blocked);
    if (!confirm(`هل أنت متأكد من حذف الحجز ${b.booking_code}؟`)) return;
    const { error } = await supabase.from("bookings").update({ deleted_at: new Date().toISOString() }).eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الحجز");
    qc.invalidateQueries({ queryKey: ["my-bookings", uid] });
  }

  async function editBooking(code: string) {
    const blocked = await bookingBlockedMessage();
    if (blocked) return toast.error(blocked);
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
          <div className="flex gap-2 flex-wrap">
            <Link to="/booking"><Button className="btn-primary-glow rounded-xl">حجز جديد</Button></Link>
            {isRep && (
              <Button variant="secondary" className="rounded-xl gap-1" onClick={() => setManualOpen((v) => !v)}>
                <PlusCircle className="h-4 w-4" /> حجز يدوي
              </Button>
            )}
            <Link to="/"><Button variant="outline" className="rounded-xl gap-1"><ArrowRight className="h-4 w-4" /> الرئيسية</Button></Link>
          </div>
        </div>

        {isRep && manualOpen && (
          <div className="mb-6 overflow-x-auto">
            <table className="w-full"><tbody>
              <ManualBookingRow
                colSpan={1}
                ownerId={uid}
                onClose={() => setManualOpen(false)}
                onSaved={() => {
                  setManualOpen(false);
                  qc.invalidateQueries({ queryKey: ["my-bookings", uid] });
                }}
              />
            </tbody></table>
          </div>
        )}

        {!isLoading && tripStats.rows.length > 0 && (
          <section className="surface-card p-4 mb-5" aria-label="ملخص الحجوزات">
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: "الحجوزات", value: tripStats.totals.bookings, icon: Ticket },
                { label: "الأفراد", value: tripStats.totals.passengers, icon: Users },
                { label: "الغرف", value: tripStats.totals.rooms, icon: Hotel },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-primary/5 border border-primary/15 p-3 text-center">
                  <s.icon className="h-4 w-4 mx-auto text-primary" />
                  <p className="text-xl font-extrabold text-primary mt-1">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground font-semibold">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="divide-y divide-border/60 text-sm">
              {tripStats.rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="font-semibold truncate flex items-center gap-1.5 min-w-0"><MapPin className="h-3.5 w-3.5 text-primary shrink-0" /><span className="truncate">{r.label}</span></span>
                  <span className="flex items-center gap-1.5 shrink-0 text-xs">
                    <Badge variant="secondary" className="rounded-full gap-1"><Ticket className="h-3 w-3" />{r.bookings}</Badge>
                    <Badge variant="secondary" className="rounded-full gap-1"><Users className="h-3 w-3" />{r.passengers}</Badge>
                    <Badge variant="secondary" className="rounded-full gap-1"><Hotel className="h-3 w-3" />{r.rooms}</Badge>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="relative mb-5">
          <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو جزء منه، أو برقم الحجز/الجوال"
            className="pr-9 rounded-xl h-11"
          />
        </div>

        {isLoading ? (
          <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
        ) : sorted.length === 0 ? (
          <div className="surface-card p-10 text-center">
            <Ticket className="h-14 w-14 mx-auto text-muted-foreground/40" />
            <p className="mt-4 font-semibold text-lg">لا توجد لديك حجوزات بعد.</p>
            <Link to="/booking"><Button className="mt-6 h-14 px-8 text-lg btn-primary-glow rounded-xl">ابدأ الحجز</Button></Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface-card p-10 text-center text-muted-foreground">لا توجد نتائج مطابقة للبحث.</div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.title}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="font-extrabold text-lg">{g.title}</h2>
                  <Badge variant="secondary" className="rounded-full">{g.items.length}</Badge>
                </div>
                <div className="grid gap-4">
            {g.items.map((b) => {
              const eff = effectiveStatus(b);
              const canModify = eff === "active";
              const cardStyle =
                eff === "no_show" ? "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800" :
                eff === "cancelled" ? "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900" :
                eff === "completed" ? "bg-gray-50 border-gray-200 dark:bg-gray-900/40 dark:border-gray-800 opacity-90" :
                "";
              const badge =
                eff === "no_show" ? { cls: "bg-red-600 text-white", label: "❌ لم يحضر" } :
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
                      <p className="mt-2 flex items-start gap-2 font-bold text-base">
                        <User className="h-4 w-4 text-primary shrink-0 mt-1" />
                        <span className="break-words whitespace-normal">{b.customer_name || "—"}</span>
                      </p>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> تاريخ الحجز: <b className="text-foreground">{formatDateTime(b.created_at)}</b></span>
                        {b.trips && <span className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" /> تاريخ الرحلة: <b className="text-foreground">{departureDisplay(b.departure_date ?? b.trips.departure_date, b.trips.departure_day, "-", b.trip_mode)}</b></span>}
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
              </section>
            ))}
          </div>
        )}

      </div>

      <Dialog open={!!details} onOpenChange={(o) => !o && setDetails(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>تفاصيل الحجز</DialogTitle></DialogHeader>
          {details && (() => {
            const eff = effectiveStatus(details);
            const badge = eff === "no_show" ? "لم يحضر" : eff === "cancelled" ? "ملغي" : eff === "completed" ? "مكتمل" : "نشط";
            const rows: [string, React.ReactNode][] = [
              ["رقم الحجز", <span className="font-mono">{details.booking_code}</span>],
              ["تاريخ الحجز", formatDateTime(details.created_at)],
              ["الرحلة", tripWithDate(details.trips?.name, details.departure_date ?? details.trips?.departure_date, details.trips?.departure_day)],
              ["تاريخ الذهاب", departureDisplay(details.departure_date ?? details.trips?.departure_date, details.trips?.departure_day, "—", details.trip_mode)],
              ["العودة الفعلية", returnActualDisplay(details.return_date ?? details.trips?.return_date, details.trips?.return_day, details.extension_nights, details.trip_mode, "—")],
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
