import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CalendarCheck,
  DollarSign,
  Bus,
  LogOut,
  Users,
  Hotel as HotelIcon,
  Ticket,
  Sparkles,
  Download,
  Save,
  Trash2,
  Plus,
  Archive,
  RotateCcw,
  IdCard,
  MessageCircle,
  CalendarClock,
  Layout,
  Images,
  FileText,
  Share2,
  Pencil,
  Search,
  Image as ImageIcon,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import type { LayoutJson } from "@/components/booking/LayoutSeatMap";
import { ManualBookingRow } from "@/components/admin/ManualBookingRow";
import { TripSheetTab } from "@/components/admin/TripSheetTab";
import { ExportSheetDialog, type ExportPayload } from "@/components/admin/ExportSheetDialog";
import { ROOM_LABEL } from "@/lib/booking/pricing";
import type { RoomType } from "@/lib/booking/types";
import {
  buildDefaultLayout,
  downloadSeatChartPdf,
  downloadSeatChartPng,
  renderSeatChartCanvas,
  type SeatOccupant,
} from "@/lib/bus-seat-chart";
import { AssetField } from "@/components/admin/AssetField";
import { trackAssetUsage } from "@/lib/asset-usage";
import { NotificationBell } from "@/components/site/NotificationBell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Logo";
import { BRAND } from "@/lib/brand";
import { sar, formatDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface BookingRow {
  id: string;
  booking_code: string;
  customer_name: string;
  contact_phone: string;
  whatsapp_phone: string;
  id_number: string;
  id_image_url?: string | null;
  passenger_count: number;
  total_price: number;
  status: string;
  created_at: string;
  seat_numbers: string[];
  room_type: string;
  booking_type?: string | null;
  male_count?: number | null;
  female_count?: number | null;
  seat_genders?: Record<string, "male" | "female"> | null;
  discount_amount?: number;
  coupon_code?: string | null;
  deleted_at?: string | null;
  notes?: string | null;
  actual_return_day?: string | null;
  nationality?: string | null;
  booking_source?: string | null;
  bus_id?: string | null;
  trip_id?: string | null;
  packages?: { name: string } | null;
  trips?: { name: string; departure_day: string | null; return_day: string | null } | null;
  buses?: { id: string; name: string | null; bus_number: number; expenses: number | null } | null;
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  // Realtime: refresh bookings list & stats when anything changes server-side
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdmin, qc]);

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings", showArchived],
    enabled: isAdmin === true,
    queryFn: async () => {
      let q = supabase
        .from("bookings")
        .select(
          "id,booking_code,customer_name,contact_phone,whatsapp_phone,id_number,id_image_url,passenger_count,total_price,status,created_at,seat_numbers,room_type,booking_type,male_count,female_count,seat_genders,discount_amount,coupon_code,deleted_at,notes,actual_return_day,nationality,booking_source,bus_id,trip_id,packages(name),trips(name,departure_day,return_day),buses(id,name,bus_number,expenses)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      q = showArchived ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });

  async function archiveBooking(id: string) {
    if (!confirm("حذف الحجز؟ سيتم نقله للأرشفة وإلغاء تأكيده.")) return;
    // Deleting a booking always un-confirms it so seats/finance stop counting it.
    const { error } = await supabase
      .from("bookings")
      .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف وإلغاء التأكيد");
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  }
  async function restoreBooking(id: string) {
    // Restoring re-activates the booking automatically.
    const { error } = await supabase
      .from("bookings")
      .update({ deleted_at: null, status: "confirmed" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الاسترجاع والتفعيل");
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  }
  async function setBookingStatus(id: string, status: string) {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "confirmed" ? "تم تأكيد الحجز" : "تم إلغاء التأكيد");
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  }
  async function permanentDelete(id: string) {
    if (!confirm("حذف نهائي؟ لا يمكن التراجع.")) return;
    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  }

  async function downloadIdImage(b: BookingRow) {
    if (!b.id_image_url) return toast.error("لا توجد صورة هوية");
    const { data, error } = await supabase.storage.from("id-uploads").createSignedUrl(b.id_image_url, 3600);
    if (error || !data) return toast.error("تعذر إنشاء الرابط");
    window.open(data.signedUrl, "_blank");
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }


  function exportBookingsExcel() {
    const rows = bookings.map((b) => ({
      "رقم الحجز": b.booking_code,
      الاسم: b.customer_name,
      الهوية: b.id_number,
      الجوال: b.contact_phone,
      واتساب: b.whatsapp_phone,
      الفندق: b.packages?.name ?? "-",
      الغرفة: b.room_type,
      الرحلة: b.trips?.name ?? "-",
      الباص: b.buses?.bus_number ?? "-",
      المقاعد: b.seat_numbers.join(", "),
      الذكور: Number(b.male_count ?? 0),
      الإناث: Number(b.female_count ?? 0),
      "العودة الفعلية": b.actual_return_day || b.trips?.return_day || "-",
      الخصم: Number(b.discount_amount ?? 0),
      الكود: b.coupon_code ?? "",
      السعر: Number(b.total_price),
      الحالة: b.status,
      التاريخ: formatDate(b.created_at),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `bookings-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Logo size={42} withText light />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="hidden md:inline text-sm text-white/70">{email}</span>
            {isAdmin && <NotificationBell />}
            {isAdmin && (
              <Link to="/audit">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  السجل
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin-buses">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <Bus className="h-4 w-4 ml-1" /> الأسطول
                </Button>
              </Link>
            )}

            {isAdmin && (
              <Link to="/admin-trips">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <CalendarClock className="h-4 w-4 ml-1" /> الرحلات
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin-gallery">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <Images className="h-4 w-4 ml-1" /> المعرض
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin-packages">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <Images className="h-4 w-4 ml-1" /> الباقات
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin-users">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <Users className="h-4 w-4 ml-1" /> المستخدمون
                </Button>
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin-assets">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
                >
                  <Images className="h-4 w-4 ml-1" /> مكتبة الوسائط
                </Button>
              </Link>
            )}
            <Link to="/" className="text-sm text-white/80 hover:text-white">
              الموقع
            </Link>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4 ml-1" /> خروج
            </Button>
          </div>
        </div>
      </header>

      <main className="container-luxe py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[color:var(--color-navy)]">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">{BRAND.name}</p>
          </div>
        </div>

        {isAdmin === false && (
          <div className="surface-card p-6 mb-6 border-r-4 border-r-warning">
            <h3 className="font-bold">حسابك ليس لديه صلاحية مسؤول</h3>
          </div>
        )}

        {/* Global stats moved into UnifiedBookingsTab so they respond to the trip/bus filter */}

        <Tabs defaultValue="bookings" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto justify-start bg-white rounded-2xl p-1.5">
            <TabsTrigger value="bookings" className="rounded-xl">
              <CalendarCheck className="h-4 w-4 ml-1" /> إدارة الحجوزات
            </TabsTrigger>
            <TabsTrigger value="tripsheet" className="rounded-xl">
              <FileText className="h-4 w-4 ml-1" /> كشف الرحلة
            </TabsTrigger>
            <TabsTrigger value="packages" className="rounded-xl">
              <HotelIcon className="h-4 w-4 ml-1" /> الفنادق
            </TabsTrigger>
            <TabsTrigger value="pricing" className="rounded-xl">
              <DollarSign className="h-4 w-4 ml-1" /> الأسعار
            </TabsTrigger>
            <TabsTrigger value="wheel" className="rounded-xl">
              <Sparkles className="h-4 w-4 ml-1" /> السحب
            </TabsTrigger>
            <TabsTrigger value="coupons" className="rounded-xl">
              <Ticket className="h-4 w-4 ml-1" /> الكوبونات
            </TabsTrigger>
            <TabsTrigger value="social" className="rounded-xl">
              <Share2 className="h-4 w-4 ml-1" /> التواصل
            </TabsTrigger>
            <TabsTrigger value="site" className="rounded-xl">
              <Layout className="h-4 w-4 ml-1" /> إعدادات الموقع
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="mt-4">
            <UnifiedBookingsTab
              bookings={bookings}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
              exportBookingsExcel={exportBookingsExcel}
              archiveBooking={archiveBooking}
              restoreBooking={restoreBooking}
              permanentDelete={permanentDelete}
              setBookingStatus={setBookingStatus}

              downloadIdImage={downloadIdImage}
            />
          </TabsContent>

          <TabsContent value="tripsheet" className="mt-4">
            <TripSheetTab />
          </TabsContent>

          <TabsContent value="packages" className="mt-4">
            <PackagesTab />
          </TabsContent>
          <TabsContent value="pricing" className="mt-4">
            <PricingTab />
          </TabsContent>
          <TabsContent value="wheel" className="mt-4">
            <WheelTab />
          </TabsContent>
          <TabsContent value="coupons" className="mt-4">
            <CouponsTab />
          </TabsContent>
          <TabsContent value="social" className="mt-4">
            <SocialTab />
          </TabsContent>
          <TabsContent value="site" className="mt-4">
            <SiteTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ================== UNIFIED BOOKINGS (merges: main list + trip/bus filter + editor entry) ==================
interface UBTripOpt {
  id: string;
  name: string;
}
interface UBBusOpt {
  id: string;
  name: string | null;
  bus_number: number;
  capacity: number;
  trip_id: string | null;
  layout?: string | null;
  layout_id?: string | null;
}

function UnifiedBookingsTab(props: {
  bookings: BookingRow[];
  showArchived: boolean;
  setShowArchived: (v: boolean | ((p: boolean) => boolean)) => void;
  exportBookingsExcel: () => void;
  archiveBooking: (id: string) => void;
  restoreBooking: (id: string) => void;
  permanentDelete: (id: string) => void;
  setBookingStatus: (id: string, status: string) => void;
  downloadIdImage: (b: BookingRow) => void;
}) {
  const {
    bookings,
    showArchived,
    setShowArchived,
    exportBookingsExcel,
    archiveBooking,
    restoreBooking,
    permanentDelete,
    setBookingStatus,
    downloadIdImage,

  } = props;
  const [tripId, setTripId] = useState<string>("");
  const [busId, setBusId] = useState<string>("");
  const [manualOpen, setManualOpen] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const { data: trips = [] } = useQuery({
    queryKey: ["ub-trips"],
    queryFn: async () =>
      ((await supabase.from("trips").select("id,name").eq("active", true).order("display_order"))
        .data as UBTripOpt[]) ?? [],
  });
  const { data: buses = [] } = useQuery({
    queryKey: ["ub-buses-all", tripId],
    queryFn: async () => {
      // If a trip is selected, prefer buses linked via trip_buses; fall back to
      // legacy buses.trip_id column. When no trip: return all active buses so
      // the admin can filter/report on any bus independently.
      if (tripId) {
        const { data: links } = await supabase.from("trip_buses").select("bus_id").eq("trip_id", tripId);
        const ids = (links ?? []).map((x: { bus_id: string }) => x.bus_id);
        let q = supabase
          .from("buses")
          .select("id,name,bus_number,capacity,trip_id,layout,layout_id")
          .order("bus_number");
        if (ids.length > 0) {
          q = q.or(`id.in.(${ids.join(",")}),trip_id.eq.${tripId}`);
        } else {
          q = q.eq("trip_id", tripId);
        }
        return ((await q).data as UBBusOpt[]) ?? [];
      }
      return (
        ((await supabase.from("buses").select("id,name,bus_number,capacity,trip_id,layout,layout_id").order("bus_number"))
          .data as UBBusOpt[]) ?? []
      );
    },
  });

  // Filter bookings by bus_id when set (works across trips). When only a trip is
  // selected, match on the booking's own trip_id (stable) rather than trip name.
  const filtered = bookings.filter((b) => {
    if (status && b.status !== status) return false;
    if (busId) {
      if (b.bus_id !== busId) return false;
    } else if (tripId) {
      if (b.trip_id !== tripId) return false;
    }
    if (search) {
      const q = search.trim().toLowerCase();
      const hay = `${b.booking_code} ${b.customer_name} ${b.contact_phone} ${b.id_number}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const bus = buses.find((b) => b.id === busId);
  const occupied = filtered.reduce((s, x) => s + (x.seat_numbers?.length ?? 0), 0);
  const capacity = bus?.capacity ?? 0;

  // Per-bus finance: revenue from confirmed bookings for THIS bus only.
  const busConfirmed = busId ? filtered.filter((b) => b.status === "confirmed" && !b.deleted_at) : [];
  const busRevenue = busConfirmed.reduce((s, x) => s + Number(x.total_price || 0), 0);
  const { data: busExpensesRow } = useQuery({
    queryKey: ["ub-bus-expenses", busId],
    enabled: !!busId,
    queryFn: async () =>
      (await supabase.from("buses").select("expenses").eq("id", busId).maybeSingle()).data as {
        expenses: number | null;
      } | null,
  });
  const currentExpenses = Number(busExpensesRow?.expenses ?? 0);
  const [expensesInput, setExpensesInput] = useState<string>("");
  const [savingExpenses, setSavingExpenses] = useState(false);
  useEffect(() => {
    setExpensesInput(String(currentExpenses || 0));
  }, [busId, currentExpenses]);
  const parsedExpenses = Number(expensesInput || 0) || 0;
  const netProfit = busRevenue - parsedExpenses;
  const qcInner = useQueryClient();

  async function saveExpenses() {
    if (!busId) return;
    setSavingExpenses(true);
    const { error } = await supabase
      .from("buses")
      .update({ expenses: parsedExpenses } as never)
      .eq("id", busId);
    setSavingExpenses(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ المصاريف");
    qcInner.invalidateQueries({ queryKey: ["admin-bookings"] });
    qcInner.invalidateQueries({ queryKey: ["ub-bus-expenses", busId] });
  }

  // ---- Bus seat chart (PNG / PDF) ----
  const { data: busLayout } = useQuery({
    queryKey: ["ub-bus-layout", bus?.layout_id ?? null],
    enabled: !!bus?.layout_id,
    queryFn: async () =>
      (await supabase.from("bus_layouts").select("layout_json").eq("id", bus!.layout_id!).maybeSingle())
        .data as { layout_json: LayoutJson } | null,
  });

  function buildChart() {
    if (!busId || !bus) {
      toast.error("اختر حافلة أولاً لعرض مخطط المقاعد");
      return null;
    }
    const occupants: SeatOccupant[] = [];
    for (const b of filtered) {
      if (b.deleted_at || b.status === "cancelled") continue;
      const genders = (b.seat_genders ?? {}) as Record<string, "male" | "female">;
      for (const seat of b.seat_numbers ?? []) {
        occupants.push({
          seat,
          name: b.customer_name,
          gender: genders[seat],
          bookingCode: b.booking_code,
          phone: b.contact_phone,
        });
      }
    }
    occupants.sort((a, z) => a.seat.localeCompare(z.seat, "en", { numeric: true }));
    const layout = busLayout?.layout_json ?? buildDefaultLayout((bus.layout as "A" | "B") ?? "A");
    return renderSeatChartCanvas(layout, occupants, {
      busLabel: bus.name || `حافلة ${bus.bus_number}`,
      tripLabel: trips.find((t) => t.id === tripId)?.name,
      capacity: bus.capacity,
    });
  }

  function chartFilename() {
    const label = bus?.name || `bus-${bus?.bus_number ?? ""}`;
    return `seat-chart-${label}-${new Date().toISOString().slice(0, 10)}`;
  }

  function exportSeatChartPng() {
    const c = buildChart();
    if (c) downloadSeatChartPng(c, chartFilename());
  }
  function exportSeatChartPdf() {
    const c = buildChart();
    if (c) downloadSeatChartPdf(c, chartFilename());
  }

  function exportBusExcel() {
    if (!busId) return exportBookingsExcel();
    const rows = filtered.map((b) => ({
      "رقم الحجز": b.booking_code,
      "المندوب / مصدر الحجز": b.booking_source || "Website",
      الاسم: b.customer_name,
      "رقم الجوال": b.contact_phone,
      "رقم الهوية": b.id_number,
      الجنسية: b.nationality ?? "-",
      "نوع الغرفة": b.room_type,
      الذكور: Number(b.male_count ?? 0),
      الإناث: Number(b.female_count ?? 0),
      المقاعد: (b.seat_numbers ?? []).join(", "),
      "اسم الفندق": b.packages?.name ?? "-",
      الذهاب: b.trips?.departure_day ?? "-",
      العودة: b.trips?.return_day ?? "-",
      "العودة الفعلية": b.actual_return_day || b.trips?.return_day || "-",
      "إجمالي المبلغ": Number(b.total_price),
      ملاحظات: b.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const busLabel = bus?.name || `bus-${bus?.bus_number ?? busId}`;
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `${busLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const ROOM_TXT: Record<string, string> = { "1": "فردي", "2": "ثنائي", "3": "ثلاثي", "4": "رباعي", "5": "خماسي" };

  // Data handed to the official-template exporter (Excel / PDF).
  function exportPayload(): ExportPayload {
    const tripName = trips.find((t) => t.id === tripId)?.name;
    const busLabel = bus ? bus.name || `حافلة ${bus.bus_number}` : "";
    const totalPax = filtered.reduce((s, b) => s + (b.passenger_count || 0), 0);
    const info = filtered.find((b) => b.trips)?.trips ?? null;
    return {
      title: `كشف رحلة${tripName ? ` — ${tripName}` : ""}${busLabel ? ` — ${busLabel}` : ""}`,
      filename: `trip-sheet-${busLabel || tripName || "all"}-${new Date().toISOString().slice(0, 10)}`,
      header: {
        departureLabel: "ذهاب",
        departureDay: info?.departure_day ?? "",
        returnLabel: "عودة",
        returnDay: info?.return_day ?? "",
        capacity: bus?.capacity,
        busNumber: bus?.bus_number,
        passengersTotal: totalPax,
        seatsRemaining: bus ? Math.max(0, (bus.capacity ?? 0) - totalPax) : undefined,
      },
      rows: filtered.map((b, i) => ({
        index: i + 1,
        rep: b.booking_source || "الموقع",
        customer: b.customer_name ?? "",
        idNumber: b.id_number ?? "",
        nationality: b.nationality ?? "",
        count: b.passenger_count || 0,
        returnDay: b.actual_return_day || b.trips?.return_day || "",
        hotel: b.packages?.name ?? "بدون فندق",
        roomType: ROOM_TXT[String(b.room_type ?? "5")] ?? String(b.room_type ?? ""),
        total: Number(b.total_price || 0),
        notes: b.notes ?? "",
      })),
    };
  }

  return (
    <div className="surface-card p-6 space-y-4">
      <ExportSheetDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        getData={exportPayload}
        onRawExcel={exportBusExcel}
      />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-extrabold">
          {showArchived ? "الحجوزات المؤرشفة" : "إدارة الحجوزات"}
          <span className="text-sm font-normal text-muted-foreground ms-2">({filtered.length})</span>
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowArchived((v: boolean) => !v)} className="rounded-full">
            <Archive className="h-4 w-4 ml-1" /> {showArchived ? "الحجوزات النشطة" : "المؤرشفة"}
          </Button>
          <Link to="/admin-bookings">
            <Button variant="outline" className="rounded-full">
              <Pencil className="h-4 w-4 ml-1" /> محرر تفصيلي
            </Button>
          </Link>
          <Button onClick={() => setExportOpen(true)} className="rounded-full">
            <Download className="h-4 w-4 ml-1" /> تصدير
          </Button>
          <Button
            variant="outline"
            onClick={exportSeatChartPng}
            disabled={!busId}
            title={busId ? "" : "اختر حافلة أولاً"}
            className="rounded-full"
          >
            <ImageIcon className="h-4 w-4 ml-1" /> مخطط المقاعد PNG
          </Button>
          <Button
            variant="outline"
            onClick={exportSeatChartPdf}
            disabled={!busId}
            title={busId ? "" : "اختر حافلة أولاً"}
            className="rounded-full"
          >
            <FileText className="h-4 w-4 ml-1" /> مخطط المقاعد PDF
          </Button>
        </div>
      </div>

      {/* Professional filter bar */}
      <div className="grid gap-3 md:grid-cols-4 rounded-2xl border-2 border-dashed border-border p-3 bg-muted/40">
        <div>
          <Label className="text-xs mb-1 block">الرحلة</Label>
          <select
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value);
              setBusId("");
            }}
            className="h-10 w-full rounded-md border px-3 text-sm bg-white"
          >
            <option value="">— كل الرحلات —</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">الحافلة</Label>
          <select
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm bg-white"
          >
            <option value="">— كل الحافلات —</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">الحالة</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm bg-white"
          >
            <option value="">— كل الحالات —</option>
            <option value="confirmed">مؤكد</option>
            <option value="pending">قيد المراجعة</option>
            <option value="cancelled">ملغي</option>
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">بحث</Label>
          <div className="relative">
            <Search className="h-4 w-4 absolute top-3 right-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="رقم الحجز، الاسم، الجوال..."
              className="ps-9"
            />
          </div>
        </div>
      </div>

      {bus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Bus} label="الحافلة" value={bus.name || `#${bus.bus_number}`} />
          <StatCard icon={Users} label="المحجوز" value={`${occupied}/${capacity}`} />
          <StatCard icon={CalendarCheck} label="المتاح" value={String(Math.max(0, capacity - occupied))} />
          <StatCard
            icon={DollarSign}
            label="نسبة الإشغال"
            value={`${capacity ? Math.round((occupied / capacity) * 100) : 0}%`}
          />
        </div>
      )}

      {/* Filter-scoped stats: react to Trip / Bus / Status / Search */}
      {(() => {
        const selectedTrip = trips.find((t) => t.id === tripId) ?? null;
        const returnCount = tripId
          ? Math.max(1, 1 + ((selectedTrip as unknown as { return_options?: string[] } | null)?.return_options?.length ?? 0))
          : 0;
        const busesInScope = buses.length;
        const passengers = filtered.reduce((s, b) => s + (b.passenger_count || 0), 0);
        // Rooms breakdown per hotel: individual (shared 5-bed) bookings count people, not rooms.
        const roomLabels: Record<string, string> = {
          "1": "فردي",
          "2": "ثنائي",
          "3": "ثلاثي",
          "4": "رباعي",
          "5": "خماسي",
        };
        const byHotel = new Map<string, { rooms: Record<string, number>; shared: number }>();
        for (const b of filtered) {
          const hotel = b.packages?.name || "بدون فندق";
          const entry = byHotel.get(hotel) ?? { rooms: {}, shared: 0 };
          if (b.booking_type === "individual") {
            entry.shared += b.passenger_count || 0;
          } else {
            const key = String(b.room_type ?? "-");
            entry.rooms[key] = (entry.rooms[key] ?? 0) + 1;
          }
          byHotel.set(hotel, entry);
        }
        const hotelStats = [...byHotel.entries()]
          .map(([hotel, e]) => ({
            hotel,
            shared: e.shared,
            total: Object.values(e.rooms).reduce((s, n) => s + n, 0),
            lines: Object.entries(e.rooms)
              .sort((a, z) => Number(a[0]) - Number(z[0]))
              .map(([k, n]) => `${n} ${roomLabels[k] ?? k}`),
          }))
          .sort((a, z) => z.total - a.total);
        const rooms = hotelStats.reduce((s, h) => s + h.total, 0);
        const sharedPeople = hotelStats.reduce((s, h) => s + h.shared, 0);
        const revenue = filtered
          .filter((b) => b.status === "confirmed")
          .reduce((s, b) => s + Number(b.total_price || 0), 0);
        const todayCount = filtered.filter(
          (b) => new Date(b.created_at).toDateString() === new Date().toDateString(),
        ).length;
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard icon={CalendarCheck} label="الحجوزات" value={String(filtered.length)} />
            <StatCard icon={Users} label="المعتمرون" value={String(passengers)} />
            <StatCard icon={DollarSign} label="الإيرادات (مؤكد)" value={sar(revenue)} />
            <StatCard icon={CalendarClock} label="حجوزات اليوم" value={String(todayCount)} />
            {tripId && <StatCard icon={CalendarCheck} label="مواعيد العودة" value={String(returnCount)} />}
            <StatCard icon={Bus} label={tripId ? "حافلات الرحلة" : "إجمالي الحافلات"} value={String(busesInScope)} />

            {/* Wide rooms counter: overall total + a mini counter per hotel */}
            <div className="surface-card p-5 col-span-2 md:col-span-4 lg:col-span-6">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">الغرف</span>
                <HotelIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-1 flex items-end gap-3 flex-wrap">
                <p className="text-3xl font-extrabold text-[color:var(--color-navy)]">{rooms}</p>
                {sharedPeople > 0 && (
                  <p className="text-xs text-muted-foreground pb-1">+ {sharedPeople} أفراد مشترك</p>
                )}
              </div>
              {hotelStats.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">لا توجد بيانات غرف.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {hotelStats.map((h) => (
                    <div key={h.hotel} className="rounded-xl border bg-white p-3">
                      <p className="font-extrabold text-sm flex items-center gap-1">
                        <span className="text-[color:var(--color-gold)]">★</span> {h.hotel}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{h.total} غرفة</p>
                      <ul className="mt-2 space-y-0.5 text-xs">
                        {h.lines.map((l) => (
                          <li key={l} className="text-[color:var(--color-navy)] font-semibold">
                            {l}
                          </li>
                        ))}
                        {h.shared > 0 && <li className="text-muted-foreground">+ {h.shared} أفراد مشترك</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}


      {busId && (
        <div className="rounded-2xl border-2 border-[color:var(--color-gold)]/40 bg-gradient-to-br from-amber-50 to-white p-4 space-y-3">
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-[color:var(--color-gold)]" />
            حسابات الحافلة: {bus?.name || `#${bus?.bus_number}`}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white p-3 border">
              <p className="text-xs text-muted-foreground">إجمالي الإيراد (مؤكد)</p>
              <p className="text-xl font-extrabold text-primary">{sar(busRevenue)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{busConfirmed.length} حجز</p>
            </div>
            <div className="rounded-xl bg-white p-3 border">
              <Label className="text-xs mb-1 block">مصاريف الحافلة</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  value={expensesInput}
                  onChange={(e) => setExpensesInput(e.target.value)}
                  className="h-9"
                />
                <Button size="sm" onClick={saveExpenses} disabled={savingExpenses} className="rounded-full">
                  {savingExpenses ? "..." : "حفظ"}
                </Button>
              </div>
            </div>
            <div className="rounded-xl bg-white p-3 border">
              <p className="text-xs text-muted-foreground">صافي الربح</p>
              <p className={`text-xl font-extrabold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>
                {sar(netProfit)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" className="rounded-full" onClick={() => setManualOpen((v) => !v)}>
          <Plus className="h-3 w-3 ml-1" />
          حجز يدوي
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم الحجز</TableHead>
              <TableHead>مصدر الحجز</TableHead>
              <TableHead>نوع الحجز</TableHead>
              <TableHead>الأفراد</TableHead>
              <TableHead>الاسم</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>الفندق</TableHead>
              <TableHead>نوع الغرفة</TableHead>
              <TableHead>ليال التمديد</TableHead>
              <TableHead>الرحلة</TableHead>
              <TableHead>العودة</TableHead>
              <TableHead>الحافلة</TableHead>
              <TableHead>المقاعد</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {manualOpen && (
              <ManualBookingRow
                colSpan={16}
                defaultTripId={tripId}
                defaultBusId={busId}
                onClose={() => setManualOpen(false)}
                onSaved={() => {
                  setManualOpen(false);
                  qcInner.invalidateQueries({ queryKey: ["admin-bookings"] });
                }}
              />
            )}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={16} className="text-center py-10 text-muted-foreground">
                  لا توجد حجوزات مطابقة.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((b) => (
              <TableRow key={b.id} className={b.deleted_at ? "opacity-60" : ""}>
                <TableCell className="font-bold" dir="ltr">
                  {b.booking_code}
                </TableCell>
                <TableCell className="text-xs">{b.booking_source ?? "-"}</TableCell>
                <TableCell className="text-xs">{b.booking_type === "individual" ? "أفراد" : "عائلة"}</TableCell>
                <TableCell>{b.passenger_count}</TableCell>
                <TableCell>{b.customer_name}</TableCell>
                <TableCell dir="ltr">{b.contact_phone}</TableCell>
                <TableCell className="text-xs">{b.packages?.name ?? "بدون"}</TableCell>
                <TableCell className="text-xs">{ROOM_LABEL[(b.room_type ?? "5") as RoomType] ?? "-"}</TableCell>
                <TableCell className="text-xs">{b.trips?.name ?? "-"}</TableCell>
                <TableCell className="text-xs">{b.actual_return_day ?? b.trips?.return_day ?? "-"}</TableCell>
                <TableCell className="text-xs">{b.buses?.bus_number ?? "-"}</TableCell>
                <TableCell className="text-xs">{b.seat_numbers.join(", ")}</TableCell>
                <TableCell className="font-bold text-primary">{sar(Number(b.total_price))}</TableCell>
                <TableCell>
                  <Badge>{b.status === "confirmed" ? "مؤكَّد" : b.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(b.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Link to="/ticket/$code" params={{ code: b.booking_code }} title="عرض">
                      <Button size="sm" variant="outline">
                        <Ticket className="h-3 w-3" />
                      </Button>
                    </Link>
                    <Link to="/admin-bookings" title="تعديل">
                      <Button size="sm" variant="outline">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </Link>
                    {b.whatsapp_phone && (
                      <a
                        href={`https://wa.me/${b.whatsapp_phone.replace(/\D/g, "")}?text=${encodeURIComponent(`مرحباً ${b.customer_name}، بخصوص حجزك ${b.booking_code}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="واتساب"
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10"
                        >
                          <MessageCircle className="h-3 w-3" />
                        </Button>
                      </a>
                    )}
                    {b.id_image_url && (
                      <Button size="sm" variant="outline" title="تنزيل الهوية" onClick={() => downloadIdImage(b)}>
                        <IdCard className="h-3 w-3" />
                      </Button>
                    )}
                    {!b.deleted_at && (
                      <Button
                        size="sm"
                        variant="outline"
                        title={b.status === "confirmed" ? "إلغاء التأكيد" : "تأكيد الحجز"}
                        onClick={() => setBookingStatus(b.id, b.status === "confirmed" ? "pending" : "confirmed")}
                      >
                        {b.status === "confirmed" ? <XCircle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      </Button>
                    )}
                    {!b.deleted_at && (
                      <Button size="sm" variant="outline" title="أرشفة" onClick={() => archiveBooking(b.id)}>
                        <Archive className="h-3 w-3" />
                      </Button>
                    )}
                    {b.deleted_at && (
                      <Button size="sm" variant="outline" title="استرجاع" onClick={() => restoreBooking(b.id)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      title="حذف نهائي"
                      onClick={() => permanentDelete(b.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof CalendarCheck;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="mt-2 flex items-end gap-2 flex-wrap">
        <p className="text-2xl font-extrabold text-[color:var(--color-navy)]">{value}</p>
        {sub && <p className="text-[11px] leading-tight text-muted-foreground pb-1">{sub}</p>}
      </div>
    </div>
  );
}

// ================== HOTELS (was Packages) ==================
interface PackageRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  image_url: string;
  tier: string;
  base_price: number;
  active: boolean;
  display_order: number;
  stars: number | null;
  extension_price?: number;
}
function PackagesTab() {
  const qc = useQueryClient();
  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("packages" as never)
        .select("*")
        .order("display_order");
      return (data as unknown as PackageRow[]) ?? [];
    },
  });

  async function save(p: PackageRow) {
    const { error } = await supabase
      .from("packages" as never)
      .update({
        name: p.name,
        description: p.description,
        image_url: p.image_url,
        tier: p.tier,
        active: p.active,
        display_order: p.display_order,
        stars: p.stars,
      } as never)
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  async function addPackage() {
    const slug = prompt("معرّف الفندق (لاتيني):");
    if (!slug) return;
    const { error } = await supabase.from("packages" as never).insert({
      slug,
      name: "فندق جديد",
      description: "",
      base_price: 0,
      tier: "standard",
      display_order: 99,
    } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
  }

  async function del(id: string) {
    if (!confirm("حذف الفندق؟")) return;
    await supabase
      .from("packages" as never)
      .delete()
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
  }

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold">إدارة الفنادق</h2>
        <Button onClick={addPackage} className="rounded-full">
          <Plus className="h-4 w-4 ml-1" /> إضافة فندق
        </Button>
      </div>
      <div className="space-y-4">
        {packages.map((p) => (
          <PackageEditor key={p.id} pkg={p} onSave={save} onDelete={() => del(p.id)} />
        ))}
      </div>
    </div>
  );
}

function PackageEditor({
  pkg,
  onSave,
  onDelete,
}: {
  pkg: PackageRow;
  onSave: (p: PackageRow) => void;
  onDelete: () => void;
}) {
  const [local, setLocal] = useState(pkg);
  useEffect(() => setLocal(pkg), [pkg]);
  return (
    <div className="border-2 border-border rounded-2xl p-4 grid md:grid-cols-6 gap-3">
      <div className="md:col-span-2 md:row-span-2">
        <AssetField
          label="صورة الفندق"
          value={local.image_url}
          onChange={async (url) => {
            setLocal({ ...local, image_url: url ?? "" });
            if (url) await trackAssetUsage(url, "hotel", local.id);
          }}
        />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs">الاسم</Label>
        <Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} />
      </div>
      <div className="md:col-span-2">
        <Label className="text-xs">تصنيف النجوم (اختياري)</Label>
        <div className="flex gap-1 mt-2 items-center">
          <button
            type="button"
            onClick={() => setLocal({ ...local, stars: null })}
            className="text-[10px] text-muted-foreground underline"
          >
            لا يوجد
          </button>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setLocal({ ...local, stars: n })}
              className={`text-lg ${(local.stars ?? 0) >= n ? "text-amber-400" : "text-muted-foreground/40"}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div className="md:col-span-4">
        <Label className="text-xs">الوصف</Label>
        <Input value={local.description} onChange={(e) => setLocal({ ...local, description: e.target.value })} />
      </div>
      <div className="flex items-center gap-2 md:col-span-6">
        <div className="flex items-center gap-2">
          <Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} />
          <span className="text-xs">مفعّل</span>
        </div>
        <div className="ms-auto flex gap-1">
          <Button size="sm" onClick={() => onSave(local)} className="rounded-full">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} className="rounded-full">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="md:col-span-6 text-xs text-muted-foreground">
        💡 الصور تُدار من مكتبة الوسائط المركزية. الأسعار من تبويب <strong>الأسعار</strong>.
      </p>
    </div>
  );
}

// ================== BOOKINGS BY BUS ==================
interface TripOpt {
  id: string;
  name: string;
}
interface BusOption {
  id: string;
  name: string | null;
  bus_number: number;
  capacity: number;
  trip_id: string | null;
}
interface BusBooking {
  id: string;
  booking_code: string;
  customer_name: string;
  contact_phone: string;
  passenger_count: number;
  seat_numbers: string[];
  total_price: number;
  status: string;
}
function ByBusTab() {
  const [tripId, setTripId] = useState<string>("");
  const [busId, setBusId] = useState<string>("");

  const { data: trips = [] } = useQuery({
    queryKey: ["hier-trips"],
    queryFn: async () =>
      ((await supabase.from("trips").select("id,name").eq("active", true).order("display_order")).data as TripOpt[]) ??
      [],
  });
  const { data: buses = [] } = useQuery({
    queryKey: ["hier-buses", tripId],
    enabled: !!tripId,
    queryFn: async () =>
      ((
        await supabase
          .from("buses")
          .select("id,name,bus_number,capacity,trip_id")
          .eq("trip_id", tripId)
          .order("bus_number")
      ).data as BusOption[]) ?? [],
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["hier-bookings", busId],
    enabled: !!busId,
    queryFn: async () =>
      ((
        await supabase
          .from("bookings")
          .select("id,booking_code,customer_name,contact_phone,passenger_count,seat_numbers,total_price,status")
          .eq("bus_id", busId)
          .neq("status", "cancelled")
      ).data as BusBooking[]) ?? [],
  });

  const bus = buses.find((b) => b.id === busId);
  const occupied = bookings.reduce((s, b) => s + (b.seat_numbers?.length ?? 0), 0);
  const capacity = bus?.capacity ?? 0;
  const free = Math.max(0, capacity - occupied);
  const pct = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;

  function exportExcel() {
    if (!bus) return;
    const rows = bookings.map((b) => ({
      "رقم الحجز": b.booking_code,
      الاسم: b.customer_name,
      الجوال: b.contact_phone,
      الأفراد: b.passenger_count,
      المقاعد: b.seat_numbers.join(", "),
      الإجمالي: Number(b.total_price),
      الحالة: b.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Passengers");
    XLSX.writeFile(wb, `bus-${bus.name || bus.bus_number}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function exportPDF() {
    if (!bus) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Bus: ${bus.name || `#${bus.bus_number}`} — ${occupied}/${capacity} (${pct}%)`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Code", "Name", "Phone", "Pax", "Seats", "Total", "Status"]],
      body: bookings.map((b) => [
        b.booking_code,
        b.customer_name,
        b.contact_phone,
        String(b.passenger_count),
        b.seat_numbers.join(", "),
        String(b.total_price),
        b.status,
      ]),
      styles: { fontSize: 9 },
    });
    doc.save(`bus-${bus.name || bus.bus_number}.pdf`);
  }

  return (
    <div className="surface-card p-6 space-y-4">
      <h2 className="text-lg font-extrabold">تصفية الحجوزات: رحلة ← حافلة ← ركاب</h2>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs mb-1 block">1) اختر الرحلة</Label>
          <select
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value);
              setBusId("");
            }}
            className="h-10 w-full rounded-md border px-3 text-sm"
          >
            <option value="">— اختر رحلة —</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">2) اختر الحافلة</Label>
          <select
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            disabled={!tripId}
            className="h-10 w-full rounded-md border px-3 text-sm disabled:opacity-50"
          >
            <option value="">{tripId ? "— اختر حافلة —" : "اختر رحلة أولاً"}</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}
              </option>
            ))}
          </select>
        </div>
      </div>

      {bus && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Bus} label="الحافلة" value={bus.name || `#${bus.bus_number}`} />
            <StatCard icon={Users} label="المحجوز" value={`${occupied}/${capacity}`} />
            <StatCard icon={CalendarCheck} label="المتاح" value={String(free)} />
            <StatCard icon={DollarSign} label="نسبة الإشغال" value={`${pct}%`} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={exportPDF} className="rounded-full">
              <FileText className="h-4 w-4 ml-1" /> PDF
            </Button>
            <Button onClick={exportExcel} className="rounded-full">
              <Download className="h-4 w-4 ml-1" /> Excel
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الحجز</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>الجوال</TableHead>
                  <TableHead>الأفراد</TableHead>
                  <TableHead>المقاعد</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      لا يوجد ركاب لهذه الحافلة.
                    </TableCell>
                  </TableRow>
                )}
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-bold" dir="ltr">
                      {b.booking_code}
                    </TableCell>
                    <TableCell>{b.customer_name}</TableCell>
                    <TableCell dir="ltr">{b.contact_phone}</TableCell>
                    <TableCell>{b.passenger_count}</TableCell>
                    <TableCell className="text-xs">{b.seat_numbers.join(", ")}</TableCell>
                    <TableCell className="font-bold text-primary">{sar(Number(b.total_price))}</TableCell>
                    <TableCell>
                      <Badge>{b.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

// ================== SOCIAL MEDIA ==================
interface SocialRow {
  id: number;
  whatsapp: string;
  telegram_url: string;
  facebook_url: string;
  instagram_url: string;
  twitter_url: string;
  snapchat_url: string;
  tiktok_url: string;
  youtube_url: string;
  maps_url: string;
}
function SocialTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-social"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select(
          "id,whatsapp,telegram_url,facebook_url,instagram_url,twitter_url,snapchat_url,tiktok_url,youtube_url,maps_url",
        )
        .eq("id", 1)
        .maybeSingle();
      return data as unknown as SocialRow;
    },
  });
  const [local, setLocal] = useState<SocialRow | null>(null);
  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);
  if (!local) return null;

  async function save() {
    if (!local) return;
    const { id, ...rest } = local;
    const { error } = await supabase
      .from("app_settings")
      .update(rest as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ روابط التواصل");
    qc.invalidateQueries({ queryKey: ["admin-social"] });
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  const fields: { key: keyof SocialRow; label: string }[] = [
    { key: "whatsapp", label: "واتساب (رقم)" },
    { key: "telegram_url", label: "تيليغرام" },
    { key: "facebook_url", label: "فيسبوك" },
    { key: "instagram_url", label: "إنستغرام" },
    { key: "twitter_url", label: "X (تويتر)" },
    { key: "snapchat_url", label: "سناب شات" },
    { key: "tiktok_url", label: "تيك توك" },
    { key: "youtube_url", label: "يوتيوب" },
    { key: "maps_url", label: "خرائط جوجل" },
  ];

  return (
    <div className="surface-card p-6 space-y-4">
      <h2 className="text-lg font-extrabold">روابط التواصل الاجتماعي</h2>
      <p className="text-sm text-muted-foreground">تُستخدم هذه الروابط تلقائياً في صفحة "تواصل معنا".</p>
      <div className="grid md:grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <Input
              dir="ltr"
              value={(local[f.key] as string) ?? ""}
              onChange={(e) => setLocal({ ...local, [f.key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <Button onClick={save} className="btn-primary-glow rounded-full">
        <Save className="h-4 w-4 ml-1" /> حفظ
      </Button>
    </div>
  );
}

// ================== PRICING MATRIX ==================
// Each package (hotel) has 5 price cells, one per room-size column (1..5).
// The column number IS the room_type — it must be written into room_type on
// every save so the booking-page pricing lookup (which reads by room_type)
// finds the correct cell. passenger_count is kept in sync with the column
// only for backwards-compatible record-keeping; it is not used for lookups.
interface PricingRow {
  id: string;
  package_id: string;
  room_type: string;
  passenger_count: number;
  price: number;
  active: boolean;
}
function PricingTab() {
  const qc = useQueryClient();
  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("packages" as never)
        .select("*")
        .order("display_order");
      return (data as unknown as PackageRow[]) ?? [];
    },
  });
  const { data: pricing = [] } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: async () => {
      const { data } = await supabase.from("pricing_matrix" as never).select("*");
      return (data as unknown as PricingRow[]) ?? [];
    },
  });

  async function updateCell(pkgId: string, room: number, price: number) {
    const roomKey = String(room);
    const existing = pricing.find((p) => p.package_id === pkgId && p.room_type === roomKey);
    if (existing) {
      await supabase
        .from("pricing_matrix" as never)
        .update({ price, active: true } as never)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("pricing_matrix" as never)
        .insert({ package_id: pkgId, room_type: roomKey, passenger_count: room, price, active: true } as never);
    }
    toast.success("تم تحديث السعر");
    qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    qc.invalidateQueries({ queryKey: ["pricing_matrix"] });
  }

  // Extension price is stored per hotel (packages.extension_price) = cost of ONE extra night.
  async function updateExtension(pkgId: string, price: number) {
    await supabase
      .from("packages" as never)
      .update({ extension_price: price } as never)
      .eq("id", pkgId);
    toast.success("تم تحديث سعر التمديد");
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-extrabold mb-4">مصفوفة الأسعار</h2>
      <p className="text-sm text-muted-foreground mb-4">
        حدّد سعر الفرد لكل فندق حسب عدد الأفراد في الغرفة، وسعر ليلة التمديد الواحدة.
      </p>
      <div className="space-y-6">
        {packages.map((p) => (
          <div key={p.id} className="border-2 border-border rounded-2xl p-4">
            <h3 className="font-bold mb-3">{p.name}</h3>
            <div className="grid grid-cols-7 gap-2 text-sm items-center">
              <div className="font-bold text-muted-foreground">عدد الأفراد →</div>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="font-bold text-center">
                  {n}
                </div>
              ))}
              <div className="font-bold text-center">التمديد</div>
              <div className="font-bold text-muted-foreground">السعر (ر.س)</div>
              {[1, 2, 3, 4, 5].map((n) => {
                const cell = pricing.find((c) => c.package_id === p.id && c.room_type === String(n));
                return <PriceInput key={n} value={cell?.price ?? 0} onSave={(v) => updateCell(p.id, n, v)} />;
              })}
              <PriceInput value={Number(p.extension_price ?? 0)} onSave={(v) => updateExtension(p.id, v)} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">التمديد = سعر ليلة واحدة، يُضرب في عدد ليال التمديد.</p>
          </div>
        ))}
      </div>
    </div>
  );
}
function PriceInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      type="number"
      value={v}
      onChange={(e) => setV(Number(e.target.value))}
      onBlur={() => v !== value && onSave(v)}
      className="h-9 text-center"
    />
  );
}

// ================== WHEEL ==================
interface WheelSegRow {
  id: string;
  label: string;
  color: string;
  prize_type: string;
  prize_value: number;
  probability_weight: number;
  display_order: number;
  active: boolean;
}
interface WheelCfg {
  enabled: boolean;
  spin_cooldown_days: number;
  coupon_expiry_hours: number;
  title: string;
  subtitle: string;
}
function WheelTab() {
  const qc = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["admin-wheel-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wheel_config" as never)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return data as unknown as WheelCfg;
    },
  });
  const { data: segments = [] } = useQuery({
    queryKey: ["admin-wheel-segments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wheel_segments" as never)
        .select("*")
        .order("display_order");
      return (data as unknown as WheelSegRow[]) ?? [];
    },
  });
  const [cfg, setCfg] = useState<WheelCfg | null>(null);
  useEffect(() => {
    if (config) setCfg(config);
  }, [config]);

  async function saveCfg() {
    if (!cfg) return;
    const { error } = await supabase
      .from("wheel_config" as never)
      .update(cfg as never)
      .eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["wheel_config"] });
  }

  async function saveSeg(s: WheelSegRow) {
    const { error } = await supabase
      .from("wheel_segments" as never)
      .update({
        label: s.label,
        color: s.color,
        prize_type: s.prize_type,
        prize_value: s.prize_value,
        probability_weight: s.probability_weight,
        display_order: s.display_order,
        active: s.active,
      } as never)
      .eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["wheel_segments"] });
    qc.invalidateQueries({ queryKey: ["admin-wheel-segments"] });
  }
  async function addSeg() {
    await supabase
      .from("wheel_segments" as never)
      .insert({
        label: "جائزة جديدة",
        color: "#c8102e",
        prize_type: "percent",
        prize_value: 5,
        probability_weight: 10,
        display_order: segments.length + 1,
      } as never);
    qc.invalidateQueries({ queryKey: ["admin-wheel-segments"] });
  }
  async function delSeg(id: string) {
    if (!confirm("حذف الشريحة؟")) return;
    await supabase
      .from("wheel_segments" as never)
      .delete()
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-wheel-segments"] });
  }

  return (
    <div className="space-y-4">
      <div className="surface-card p-6">
        <h2 className="text-lg font-extrabold mb-4">إعدادات العجلة</h2>
        {cfg && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} />
              <Label>تفعيل السحب</Label>
            </div>
            <div>
              <Label>عدد أيام التبريد</Label>
              <Input
                type="number"
                value={cfg.spin_cooldown_days}
                onChange={(e) => setCfg({ ...cfg, spin_cooldown_days: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>صلاحية الكوبون (ساعات)</Label>
              <Input
                type="number"
                value={cfg.coupon_expiry_hours}
                onChange={(e) => setCfg({ ...cfg, coupon_expiry_hours: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>العنوان</Label>
              <Input value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>العنوان الفرعي</Label>
              <Input value={cfg.subtitle} onChange={(e) => setCfg({ ...cfg, subtitle: e.target.value })} />
            </div>
            <Button onClick={saveCfg} className="btn-primary-glow rounded-full">
              <Save className="h-4 w-4 ml-1" /> حفظ
            </Button>
          </div>
        )}
      </div>

      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">شرائح العجلة</h2>
          <Button onClick={addSeg} className="rounded-full">
            <Plus className="h-4 w-4 ml-1" /> إضافة
          </Button>
        </div>
        <div className="space-y-3">
          {segments.map((s) => (
            <SegEditor key={s.id} seg={s} onSave={saveSeg} onDelete={() => delSeg(s.id)} />
          ))}
        </div>
      </div>

      <SpinsLog />
    </div>
  );
}

interface SpinRow {
  id: string;
  phone: string;
  ip: string | null;
  device_id: string | null;
  spun_at: string;
  wheel_segments: { label: string; prize_type: string; prize_value: number } | null;
  coupons: { code: string; used: boolean } | null;
}

function SpinsLog() {
  const [search, setSearch] = useState("");
  const { data: spins = [] } = useQuery({
    queryKey: ["admin-wheel-spins"],
    queryFn: async () => {
      const { data } = await supabase
        .from("wheel_spins" as never)
        .select("id,phone,ip,device_id,spun_at,wheel_segments(label,prize_type,prize_value),coupons(code,used)")
        .order("spun_at", { ascending: false })
        .limit(500);
      return (data as unknown as SpinRow[]) ?? [];
    },
  });

  const filtered = spins.filter((s) =>
    search ? `${s.phone} ${s.coupons?.code ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );
  const wins = filtered.filter((s) => !!s.coupons).length;
  const redeemed = filtered.filter((s) => s.coupons?.used).length;

  function exportSpins() {
    const rows = filtered.map((s) => ({
      التاريخ: new Date(s.spun_at).toLocaleString("ar"),
      الجوال: s.phone,
      الجائزة: s.wheel_segments?.label ?? "-",
      الكوبون: s.coupons?.code ?? "-",
      "تم الاستخدام": s.coupons?.used ? "نعم" : "لا",
      IP: s.ip ?? "-",
      الجهاز: s.device_id ?? "-",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Spins");
    XLSX.writeFile(wb, `wheel-spins-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="surface-card p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-extrabold">سجل عمليات السحب</h2>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="بحث بالجوال أو الكوبون..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
          <Button onClick={exportSpins} className="rounded-full">
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Sparkles} label="عدد السحوبات" value={String(filtered.length)} />
        <StatCard icon={Ticket} label="كوبونات فائزة" value={String(wins)} />
        <StatCard icon={CalendarCheck} label="كوبونات مستخدمة" value={String(redeemed)} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>الجائزة</TableHead>
              <TableHead>الكوبون</TableHead>
              <TableHead>الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  لا توجد عمليات سحب.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs">{new Date(s.spun_at).toLocaleString("ar")}</TableCell>
                <TableCell dir="ltr" className="text-xs">
                  {s.phone}
                </TableCell>
                <TableCell>{s.wheel_segments?.label ?? "-"}</TableCell>
                <TableCell dir="ltr" className="font-bold text-xs">
                  {s.coupons?.code ?? "-"}
                </TableCell>
                <TableCell>
                  {s.coupons ? (
                    <Badge variant={s.coupons.used ? "secondary" : "default"}>
                      {s.coupons.used ? "مستخدم" : "متاح"}
                    </Badge>
                  ) : (
                    <Badge variant="outline">بدون جائزة</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
function SegEditor({
  seg,
  onSave,
  onDelete,
}: {
  seg: WheelSegRow;
  onSave: (s: WheelSegRow) => void;
  onDelete: () => void;
}) {
  const [s, setS] = useState(seg);
  useEffect(() => setS(seg), [seg]);
  return (
    <div className="border-2 border-border rounded-2xl p-3 grid md:grid-cols-7 gap-2 items-end">
      <div className="md:col-span-2">
        <Label className="text-xs">النص</Label>
        <Input value={s.label} onChange={(e) => setS({ ...s, label: e.target.value })} />
      </div>
      <div>
        <Label className="text-xs">اللون</Label>
        <Input
          type="color"
          value={s.color}
          onChange={(e) => setS({ ...s, color: e.target.value })}
          className="h-10 p-1"
        />
      </div>
      <div>
        <Label className="text-xs">النوع</Label>
        <select
          value={s.prize_type}
          onChange={(e) => setS({ ...s, prize_type: e.target.value })}
          className="h-10 w-full rounded-md border border-input px-2 text-sm"
        >
          <option value="lose">خسارة</option>
          <option value="percent">نسبة %</option>
          <option value="fixed">مبلغ ثابت</option>
        </select>
      </div>
      <div>
        <Label className="text-xs">القيمة</Label>
        <Input
          type="number"
          value={s.prize_value}
          onChange={(e) => setS({ ...s, prize_value: Number(e.target.value) })}
        />
      </div>
      <div>
        <Label className="text-xs">الاحتمالية</Label>
        <Input
          type="number"
          value={s.probability_weight}
          onChange={(e) => setS({ ...s, probability_weight: Number(e.target.value) })}
        />
      </div>
      <div className="flex gap-1">
        <Button size="sm" onClick={() => onSave(s)}>
          <Save className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ================== COUPONS ==================
interface CouponRow {
  id: string;
  code: string;
  phone: string | null;
  prize_type: string;
  prize_value: number;
  used: boolean;
  expiry_date: string;
  issue_date: string;
  used_in_booking_id: string | null;
  active: boolean;
  max_uses: number | null;
  usage_count: number;
  source: string;
  label: string | null;
  start_date?: string | null;
  min_booking_amount?: number | null;
  per_user_limit?: number | null;
  qr_url?: string | null;
}

type FilterMode = "all" | "active" | "disabled" | "used" | "expired";

function CouponsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [editing, setEditing] = useState<Partial<CouponRow> | null>(null);

  const { data: coupons = [] } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data } = await supabase
        .from("coupons" as never)
        .select("*")
        .order("issue_date", { ascending: false })
        .limit(500);
      return (data as unknown as CouponRow[]) ?? [];
    },
  });

  const now = Date.now();
  const filtered = coupons.filter((c) => {
    if (search) {
      const q = search.trim().toLowerCase();
      if (!c.code.toLowerCase().includes(q) && !(c.phone ?? "").toLowerCase().includes(q)) return false;
    }
    const expired = new Date(c.expiry_date).getTime() < now;
    switch (filter) {
      case "active":
        return c.active && !c.used && !expired;
      case "disabled":
        return !c.active;
      case "used":
        return c.used;
      case "expired":
        return expired;
      default:
        return true;
    }
  });

  async function toggleActive(c: CouponRow) {
    const { error } = await supabase
      .from("coupons" as never)
      .update({ active: !c.active } as never)
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(c.active ? "تم تعطيل الكوبون" : "تم تفعيل الكوبون");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  }

  async function deleteCoupon(id: string) {
    if (!confirm("حذف الكوبون نهائياً؟")) return;
    const { error } = await supabase
      .from("coupons" as never)
      .delete()
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الكوبون");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  }

  async function shareCoupon(c: CouponRow) {
    const url = `${window.location.origin}/booking?coupon=${encodeURIComponent(c.code)}`;
    const qr = c.qr_url || (await makeQr(c.code));
    if (qr) {
      const a = document.createElement("a");
      a.href = qr;
      a.download = `coupon-${c.code}.png`;
      a.click();
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط الكوبون وتنزيل رمز QR");
    } catch {
      toast.success("تم تنزيل رمز QR");
    }
  }

  function newCoupon() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    setEditing({
      code: `ZT-${s}`,
      phone: null,
      prize_type: "percent",
      prize_value: 10,
      expiry_date: expiry,
      active: true,
      max_uses: 1,
      source: "manual",
      label: "",
    });
  }

  return (
    <div className="surface-card p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">كوبونات الخصم</h2>
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="بحث بالكود أو الجوال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
            className="h-9 rounded-md border border-input px-2 text-sm"
          >
            <option value="all">الكل</option>
            <option value="active">نشط</option>
            <option value="disabled">معطّل</option>
            <option value="used">مستخدم</option>
            <option value="expired">منتهي</option>
          </select>
          <Button size="sm" onClick={newCoupon} className="btn-primary-glow rounded-full">
            <Plus className="h-4 w-4 ml-1" /> كوبون جديد
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الكود</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>القيمة</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>المصدر</TableHead>
              <TableHead>الاستخدام</TableHead>
              <TableHead>الانتهاء</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                  لا توجد كوبونات.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((c) => {
              const expired = new Date(c.expiry_date).getTime() < now;
              const statusLabel = !c.active ? "معطّل" : c.used ? "مستخدم" : expired ? "منتهي" : "نشط";
              const statusVariant: "default" | "secondary" | "destructive" = !c.active
                ? "secondary"
                : c.used
                  ? "secondary"
                  : expired
                    ? "destructive"
                    : "default";
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-bold" dir="ltr">
                    {c.code}
                  </TableCell>
                  <TableCell>{c.prize_type === "percent" ? "نسبة" : c.prize_type === "fixed" ? "مبلغ" : "-"}</TableCell>
                  <TableCell>{c.prize_type === "percent" ? `${c.prize_value}%` : `${c.prize_value} ر.س`}</TableCell>
                  <TableCell dir="ltr" className="text-xs">
                    {c.phone ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.source === "manual" ? "يدوي" : "سحب"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {c.usage_count}
                    {c.max_uses ? ` / ${c.max_uses}` : ""}
                  </TableCell>
                  <TableCell className="text-xs">{formatDate(c.expiry_date)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant}>{statusLabel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                        تعديل
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(c)}>
                        {c.active ? "تعطيل" : "تفعيل"}
                      </Button>
                      <Button size="sm" variant="outline" title="QR / مشاركة" onClick={() => shareCoupon(c)}>
                        <Share2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteCoupon(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <CouponEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-coupons"] });
          }}
        />
      )}
    </div>
  );
}

async function makeQr(code: string): Promise<string | null> {
  try {
    const url = `${window.location.origin}/booking?coupon=${encodeURIComponent(code)}`;
    return await QRCode.toDataURL(url, { width: 320, margin: 1 });
  } catch {
    return null;
  }
}

function CouponEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<CouponRow>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [c, setC] = useState<Partial<CouponRow>>(initial);
  const isNew = !initial.id;

  async function save() {
    if (!c.code || !c.code.trim()) return toast.error("الكود مطلوب");
    if (!c.expiry_date) return toast.error("تاريخ الانتهاء مطلوب");
    const payload = {
      code: c.code.trim().toUpperCase(),
      phone: c.phone?.trim() || null,
      prize_type: c.prize_type ?? "percent",
      prize_value: Number(c.prize_value ?? 0),
      expiry_date: c.expiry_date,
      active: c.active ?? true,
      max_uses: c.max_uses ? Number(c.max_uses) : null,
      source: c.source ?? "manual",
      label: c.label ?? null,
      start_date: c.start_date || null,
      min_booking_amount: Number(c.min_booking_amount ?? 0),
      per_user_limit: c.per_user_limit ? Number(c.per_user_limit) : null,
      qr_url: await makeQr(c.code.trim().toUpperCase()),
    };
    if (isNew) {
      const { error } = await supabase.from("coupons" as never).insert(payload as never);
      if (error) return toast.error(error.message);
      toast.success("تم إنشاء الكوبون");
    } else {
      const { error } = await supabase
        .from("coupons" as never)
        .update(payload as never)
        .eq("id", initial.id!);
      if (error) return toast.error(error.message);
      toast.success("تم حفظ التعديلات");
    }
    onSaved();
  }

  const expiryLocal = c.expiry_date ? new Date(c.expiry_date).toISOString().slice(0, 10) : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-extrabold">{isNew ? "كوبون جديد" : "تعديل الكوبون"}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">الكود</Label>
            <Input dir="ltr" value={c.code ?? ""} onChange={(e) => setC({ ...c, code: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">نوع الخصم</Label>
            <select
              value={c.prize_type ?? "percent"}
              onChange={(e) => setC({ ...c, prize_type: e.target.value })}
              className="h-10 w-full rounded-md border border-input px-2 text-sm"
            >
              <option value="percent">نسبة %</option>
              <option value="fixed">مبلغ ثابت</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">قيمة الخصم</Label>
            <Input
              type="number"
              value={c.prize_value ?? 0}
              onChange={(e) => setC({ ...c, prize_value: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">تاريخ الانتهاء</Label>
            <Input
              type="date"
              value={expiryLocal}
              onChange={(e) => setC({ ...c, expiry_date: new Date(e.target.value).toISOString() })}
            />
          </div>
          <div>
            <Label className="text-xs">أقصى عدد استخدامات</Label>
            <Input
              type="number"
              value={c.max_uses ?? ""}
              placeholder="بدون حد"
              onChange={(e) => setC({ ...c, max_uses: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div>
            <Label className="text-xs">تاريخ البداية (اختياري)</Label>
            <Input
              type="date"
              value={c.start_date ? new Date(c.start_date).toISOString().slice(0, 10) : ""}
              onChange={(e) =>
                setC({ ...c, start_date: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
            />
          </div>
          <div>
            <Label className="text-xs">أقل مبلغ حجز</Label>
            <Input
              type="number"
              min={0}
              value={c.min_booking_amount ?? 0}
              onChange={(e) => setC({ ...c, min_booking_amount: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">حد الاستخدام لكل مستخدم</Label>
            <Input
              type="number"
              min={1}
              value={c.per_user_limit ?? ""}
              placeholder="بدون حد"
              onChange={(e) => setC({ ...c, per_user_limit: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">جوال العميل (اختياري)</Label>
            <Input
              dir="ltr"
              value={c.phone ?? ""}
              onChange={(e) => setC({ ...c, phone: e.target.value })}
              placeholder="اتركه فارغاً للكوبون العام"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">وصف (اختياري)</Label>
            <Input value={c.label ?? ""} onChange={(e) => setC({ ...c, label: e.target.value })} />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <Switch checked={c.active ?? true} onCheckedChange={(v) => setC({ ...c, active: v })} />
            <span className="text-sm">مُفعّل</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={save} className="btn-primary-glow">
            <Save className="h-4 w-4 ml-1" /> حفظ
          </Button>
        </div>
      </div>
    </div>
  );
}

// ================== SETTINGS ==================
interface SettingsRow {
  id: number;
  company_name: string;
  email: string;
  national_number: string;
  whatsapp: string;
  phone: string;
  instagram_url: string;
  snapchat_url: string;
  maps_url: string;
  logo_url: string;
  hero_title: string;
  hero_subtitle: string;
  hero_cta: string;
  terms_text: string;
}
function SiteTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      return data as unknown as SettingsRow;
    },
  });
  const [local, setLocal] = useState<SettingsRow | null>(null);
  useEffect(() => {
    if (settings) setLocal(settings);
  }, [settings]);

  async function save() {
    if (!local) return;
    const { id, ...rest } = local;
    const { error } = await supabase.from("app_settings").update(rest).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  return (
    <div className="space-y-4">
      {/* Homepage builder callout */}
      <div className="surface-card p-6 flex flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-primary/5 to-transparent">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <Layout className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-extrabold">محرر أقسام الرئيسية</h3>
            <p className="text-xs text-muted-foreground">أعد ترتيب وتحرير أقسام الصفحة الرئيسية.</p>
          </div>
        </div>
        <Link to="/admin-homepage">
          <Button className="rounded-full">
            <Pencil className="h-4 w-4 ml-1" /> فتح المحرر
          </Button>
        </Link>
      </div>

      <div className="surface-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-extrabold">إعدادات الموقع</h2>
          <p className="text-xs text-muted-foreground">بيانات المؤسسة، الشعار، ونصوص الواجهة.</p>
        </div>
        {local && (
          <>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>اسم المؤسسة</Label>
                <Input
                  value={local.company_name}
                  onChange={(e) => setLocal({ ...local, company_name: e.target.value })}
                />
              </div>
              <div>
                <Label>البريد</Label>
                <Input value={local.email} onChange={(e) => setLocal({ ...local, email: e.target.value })} />
              </div>
              <div>
                <Label>الرقم الموحد</Label>
                <Input
                  value={local.national_number}
                  onChange={(e) => setLocal({ ...local, national_number: e.target.value })}
                />
              </div>
              <div>
                <Label>واتساب</Label>
                <Input
                  dir="ltr"
                  value={local.whatsapp}
                  onChange={(e) => setLocal({ ...local, whatsapp: e.target.value })}
                />
              </div>
              <div>
                <Label>الجوال</Label>
                <Input dir="ltr" value={local.phone} onChange={(e) => setLocal({ ...local, phone: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <AssetField
                  label="الشعار"
                  value={local.logo_url}
                  onChange={(url) => setLocal({ ...local, logo_url: url ?? "" })}
                />
              </div>
              <div>
                <Label>عنوان الواجهة</Label>
                <Input value={local.hero_title} onChange={(e) => setLocal({ ...local, hero_title: e.target.value })} />
              </div>
              <div>
                <Label>عنوان فرعي</Label>
                <Input
                  value={local.hero_subtitle}
                  onChange={(e) => setLocal({ ...local, hero_subtitle: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>الشروط والأحكام</Label>
                <Textarea
                  rows={4}
                  value={local.terms_text ?? ""}
                  onChange={(e) => setLocal({ ...local, terms_text: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={save} className="btn-primary-glow rounded-full">
              <Save className="h-4 w-4 ml-1" /> حفظ الإعدادات
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
