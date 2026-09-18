import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ticket, Calendar, Users, Edit, XCircle, Eye, ArrowRight, Loader2, MapPin, Bus, Hotel, Phone, MessageCircle, Globe, User, PlusCircle, Search, TrendingUp } from "lucide-react";
import { ManualBookingRow } from "@/components/admin/ManualBookingRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { sar, formatDateTime } from "@/lib/format";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useAuth } from "@/contexts/AuthContext";
import { bookingBlockedMessage } from "@/lib/booking-availability";
import { departureDisplay, returnActualDisplay, tripWithDate } from "@/lib/return-display";
import { startOfWeek } from "@/lib/week";

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
  rep_share?: number | null;
  trips: { name: string; departure_day: string; return_day: string; departure_date?: string | null; return_date?: string | null } | null;
  buses: {
    name: string | null; bus_number: number; capacity?: number | null; settled_at?: string | null;
    expense_bus_cost?: number | null; expense_driver_tip?: number | null; expense_taxi?: number | null;
    expense_supervisor?: number | null; expense_supervisor_bed?: number | null;
    expense_empty_beds?: number | null; expense_extra?: number | null;
  } | null;
  packages: { name: string } | null;
}

const n = (v: unknown) => Number(v) || 0;

/** تكلفة المقعد التقديرية = مجموع مصاريف الحافلة ÷ سعتها. */
function seatCostOf(b: MyBooking) {
  const bus = b.buses;
  if (!bus || !bus.capacity) return 0;
  const total =
    n(bus.expense_bus_cost) + n(bus.expense_driver_tip) + n(bus.expense_taxi) +
    n(bus.expense_supervisor) + n(bus.expense_supervisor_bed) + n(bus.expense_empty_beds) +
    n(bus.expense_extra);
  return total ? total / bus.capacity : 0;
}

/** دالة إعادة الحساب لا تكتب الحصة إلا بعد اعتماد الحافلة والفندق معًا. */
function profitSettled(b: MyBooking) {
  return !!b.buses?.settled_at && b.rep_share != null;
}
/** ربح المندوب المعتمد فقط (غير المعتمد = 0 حتى لا يظهر رقم غير نهائي). */
function repProfitOf(b: MyBooking) {
  return profitSettled(b) && b.status !== "cancelled" ? n(b.rep_share) : 0;
}

/** هل انتهى موعد الرحلة؟ نستخدم العودة أولًا، ثم الذهاب عند عدم وجودها. */
function tripEnded(b: MyBooking) {
  const value = b.return_date ?? b.trips?.return_date ?? b.departure_date ?? b.trips?.departure_date;
  if (!value) return false;
  const end = new Date(`${value.slice(0, 10)}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}

/** التاريخ المرجعي للحجز (تاريخ الرحلة، وإلا تاريخ الإنشاء). */
function refTimeOf(b: MyBooking) {
  const s = b.departure_date ?? b.trips?.departure_date ?? b.trips?.departure_day ?? b.created_at;
  const t = new Date(s as string).getTime();
  return Number.isNaN(t) ? new Date(b.created_at).getTime() : t;
}

const dayMonth = (d: Date) => d.toLocaleDateString("ar-SA-u-ca-gregory", { day: "numeric", month: "long" });

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
  // Read the id from the shared auth state so the list still loads when the
  // session hydrates a moment after the page mounts (this used to leave the
  // page permanently empty for representatives).
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const [isRep, setIsRep] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [details, setDetails] = useState<MyBooking | null>(null);
  const [search, setSearch] = useState("");


  useEffect(() => {
    if (!uid) return;
    (async () => {
      const [{ data: role }, { data: profile }] = await Promise.all([
        supabase
          .from("user_roles").select("role").eq("user_id", uid).eq("role", "representative").maybeSingle(),
        supabase.from("profiles").select("account_type").eq("id", uid).maybeSingle(),
      ]);
      setIsRep(!!role || profile?.account_type === "representative");
    })();
  }, [uid]);



  // ------------------------- فلتر الأسبوع بالتاريخ -------------------------
  const [weekBack, setWeekBack] = useState(0);

  /** آخر 12 أسبوعًا كخيارات تاريخية: «1 سبتمبر - 7 سبتمبر». */
  const weekOptions = useMemo(() => {
    const base = startOfWeek(new Date());
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(base);
      start.setDate(base.getDate() - i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      const endLabel = new Date(end);
      endLabel.setDate(end.getDate() - 1);
      return { value: i, start: start.getTime(), end: end.getTime(), label: `${dayMonth(start)} - ${dayMonth(endLabel)}` };
    });
  }, []);
  const activeWeek = weekOptions[weekBack] ?? weekOptions[0];

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["my-bookings", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,booking_code,status,no_show,created_at,customer_name,passenger_count,total_price,room_type,trip_id,bus_id,no_hotel,no_bus,seat_numbers,contact_phone,whatsapp_phone,nationality,booking_source,extension_nights,trip_mode,departure_date,return_date,rep_share,trips(name,departure_day,return_day,departure_date,return_date),buses!bookings_bus_id_fkey(name,bus_number,capacity,settled_at,expense_bus_cost,expense_driver_tip,expense_taxi,expense_supervisor,expense_supervisor_bed,expense_empty_beds,expense_extra),packages(name)")
        // الحجوزات التي أنشأها المستخدم + الحجوزات المسجّلة باسمه كمندوب (ولو أدخلها موظف آخر).
        .or(`created_by.eq.${uid},rep_profile_id.eq.${uid}`)
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
    let list = sorted;
    // فلتر الأسبوع يتحكم في الصفحة كلها (الملخص + القائمة).
    if (activeWeek) {
      list = list.filter((b) => {
        const t = refTimeOf(b);
        return t >= activeWeek.start && t < activeWeek.end;
      });
    }
    if (!q) return list;
    return list.filter((b) =>
      (b.customer_name || "").toLowerCase().includes(q) ||
      (b.booking_code || "").toLowerCase().includes(q) ||
      (b.contact_phone || "").includes(q)
    );
  }, [sorted, search, activeWeek]);

  const tripLabelOf = (b: MyBooking) =>
    b.trips ? String(tripWithDate(b.trips.name, b.departure_date ?? b.trips.departure_date, b.trips.departure_day)) : "بدون رحلة";

  /** تجميع الحجوزات تحت كل رحلة مع إجمالي ربحها. */
  const groups = useMemo(() => {
    const map = new Map<string, { title: string; items: MyBooking[]; profit: number; time: number }>();
    for (const b of filtered) {
      const k = tripLabelOf(b);
      const cur = map.get(k) ?? { title: k, items: [], profit: 0, time: refTimeOf(b) };
      cur.items.push(b);
      cur.profit += repProfitOf(b);
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.time - a.time);
  }, [filtered]);

  /** ملخص الأسبوع المختار: إجمالي الربح + عدد الحجوزات. */
  const summary = useMemo(() => {
    let total = 0;
    for (const b of filtered) total += repProfitOf(b);
    return { total, count: filtered.length };
  }, [filtered]);




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
      <div className="container-luxe py-5 sm:py-10 max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex items-center gap-2 whitespace-nowrap text-xl font-extrabold sm:text-3xl">
            <Ticket className="h-5 w-5 shrink-0 text-primary sm:h-6 sm:w-6" /> {isRep ? "حجوزاتي وأرباحي" : "حجوزاتي"}
          </h1>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Link to="/booking" className="min-w-0"><Button className="btn-primary-glow w-full rounded-xl">حجز جديد</Button></Link>
            {/* زر الحجز اليدوي مخفي مؤقتًا (الكود محفوظ) */}
            {false && isRep && (
              <Button variant="secondary" className="rounded-xl gap-1" onClick={() => setManualOpen((v) => !v)}>
                <PlusCircle className="h-4 w-4" /> حجز يدوي
              </Button>
            )}
            <Link to="/" className="min-w-0"><Button variant="outline" className="w-full rounded-xl gap-1"><ArrowRight className="h-4 w-4" /> الرئيسية</Button></Link>
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

        <section className="surface-card mb-4 p-3 sm:mb-5 sm:p-4" aria-label="ملخص الأسبوع">
          <div className="mb-3 grid gap-2 sm:flex sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-base font-extrabold sm:text-lg">
              <TrendingUp className="h-5 w-5 text-primary" /> ملخص الأسبوع
            </h2>
            <select
              className="h-9 w-full rounded-xl border bg-background px-3 text-sm sm:w-auto"
              value={weekBack}
              onChange={(e) => setWeekBack(Number(e.target.value))}
            >
              {weekOptions.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {isRep && (
               <div className="rounded-xl bg-primary/5 border border-primary/15 p-2.5 text-center sm:p-4">
                 <p className="text-lg font-extrabold text-emerald-600 sm:text-2xl">{sar(summary.total)}</p>
                <p className="text-[11px] text-muted-foreground font-semibold mt-1">أرباح الأسبوع ({activeWeek?.label})</p>
              </div>
            )}
             <div className="rounded-xl bg-primary/5 border border-primary/15 p-2.5 text-center sm:p-4">
               <p className="text-lg font-extrabold text-primary sm:text-2xl">{summary.count}</p>
              <p className="text-[11px] text-muted-foreground font-semibold mt-1">الحجوزات</p>
            </div>
          </div>
        </section>

        <div className="relative mb-5">
          <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو جزء منه، أو برقم الحجز/الجوال"
            className="pr-9 rounded-xl h-11"
          />
        </div>

        {isLoading || !uid ? (
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
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="font-extrabold text-lg truncate">{g.title}</h2>
                    <span className="rounded-full bg-green-600 text-white text-xs font-bold px-2 py-0.5 shrink-0">{g.items.length}</span>
                  </div>
                  {isRep && <b className="text-emerald-600 shrink-0">{sar(g.profit)}</b>}
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
                <div key={b.id} className={`surface-card p-3 sm:p-4 border-2 ${cardStyle}`}>
                  {/* السطر الأول: الاسم + الحالة، والسعر على اليسار */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <User className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-bold text-sm sm:text-base min-w-0 break-words">{b.customer_name || "—"}</span>
                      <Badge className={`${badge.cls} shrink-0 text-[10px] px-1.5 py-0`}>{badge.label}</Badge>
                    </div>
                    <p className="text-base sm:text-lg font-extrabold text-red-600 shrink-0">{sar(b.total_price)}</p>
                  </div>

                  {/* السطر الثاني: تفاصيل تلتف على الجوال */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] sm:text-sm">
                    {isRep && (
                      profitSettled(b) ? (
                        <span className="flex items-center gap-1 font-extrabold text-emerald-600 shrink-0">
                          <TrendingUp className="h-3.5 w-3.5" /> {sar(repProfitOf(b))}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-bold text-amber-600 shrink-0">
                          <TrendingUp className="h-3.5 w-3.5" /> {tripEnded(b) ? "لم تعتمد الحسابات" : "بانتظار اعتماد الحسابات"}
                        </span>
                      )
                    )}
                    <span className="flex items-center gap-1 font-bold shrink-0">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      {b.trips
                        ? departureDisplay(b.departure_date ?? b.trips.departure_date, b.trips.departure_day, "-", b.trip_mode)
                        : formatDateTime(b.created_at)}
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                      <Hotel className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{b.packages?.name || "بدون فندق"}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                      <Bus className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{b.buses ? (b.buses.name || `حافلة ${b.buses.bus_number}`) : "بدون حافلة"}</span>
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                      <Users className="h-3.5 w-3.5" /> {b.passenger_count}
                    </span>
                  </div>

                  {/* السطر الثالث: الأزرار */}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 rounded-xl gap-1" onClick={() => setDetails(b)}>
                      <Eye className="h-3 w-3" /> تفاصيل
                    </Button>
                    {canModify && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 rounded-xl gap-1" onClick={() => editBooking(b.booking_code)}>
                          <Edit className="h-3 w-3" /> تعديل
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 rounded-xl gap-1 border-destructive text-destructive hover:bg-destructive/10" onClick={() => deleteBooking(b)}>
                          <XCircle className="h-3 w-3" /> حذف
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
