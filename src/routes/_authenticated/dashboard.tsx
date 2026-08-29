import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  FileDown,
} from "lucide-react";
import { LayoutSeatMap, mirrorLayout, type LayoutJson } from "@/components/booking/LayoutSeatMap";
import { ManualBookingRow } from "@/components/admin/ManualBookingRow";
import { TripSheetTab } from "@/components/admin/TripSheetTab";
import { ExportSheetDialog, type ExportPayload } from "@/components/admin/ExportSheetDialog";
import { ROOM_LABEL, roomDisplayLabel } from "@/lib/booking/pricing";
import type { RoomType } from "@/lib/booking/types";
import {
  buildDefaultLayout,
  downloadSeatChartPdf,
  downloadSeatChartPng,
  renderSeatChartPages,
  twoPartName,

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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { departureDisplay, returnActualDisplay, tripWithDate } from "@/lib/return-display";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Logo";
import { BRAND } from "@/lib/brand";
import { sar, formatDate } from "@/lib/format";
import { DEFAULT_BOOKING_UNAVAILABLE_MESSAGE } from "@/lib/booking-availability";
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
  extension_nights?: number | null;
  trip_mode?: string | null;
  bus_id?: string | null;
  trip_id?: string | null;
  package_id?: string | null;
  packages?: { name: string } | null;
  departure_date?: string | null;
  return_date?: string | null;
  trips?: { name: string; departure_day: string | null; return_day: string | null; departure_date?: string | null; return_date?: string | null } | null;
  buses?: {
    id: string;
    name: string | null;
    bus_number: number;
    expenses: number | null;
    driver_phone?: string | null;
    driver_id_number?: string | null;
  } | null;
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
          "id,booking_code,customer_name,contact_phone,whatsapp_phone,id_number,id_image_url,passenger_count,total_price,status,created_at,seat_numbers,room_type,booking_type,male_count,female_count,seat_genders,discount_amount,coupon_code,deleted_at,notes,actual_return_day,nationality,booking_source,extension_nights,trip_mode,departure_date,return_date,bus_id,trip_id,package_id,packages(name),trips(name,departure_day,return_day,departure_date,return_date),buses(id,name,bus_number,expenses,driver_phone,driver_id_number)",
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
      الغرفة: roomDisplayLabel((b.room_type ?? "5") as RoomType, (b.booking_type as "individual" | "family" | null) ?? null, !!b.package_id),
      الرحلة: tripWithDate(b.trips?.name, b.departure_date ?? b.trips?.departure_date, b.trips?.departure_day),
      الباص: b.buses?.bus_number ?? "-",
      المقاعد: b.seat_numbers.join(", "),
      الذكور: Number(b.male_count ?? 0),
      الإناث: Number(b.female_count ?? 0),
      "العودة الفعلية": returnActualDisplay(b.return_date ?? b.trips?.return_date, b.actual_return_day || b.trips?.return_day, b.extension_nights, b.trip_mode, "-"),
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
            <TabsTrigger value="bookingctl" className="rounded-xl">
              <CalendarCheck className="h-4 w-4 ml-1" /> التحكم في الحجز
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
          <TabsContent value="bookingctl" className="mt-4">
            <BookingControlTab />
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
  driver_name?: string | null;
  plate?: string | null;
  driver_phone?: string | null;
  driver_id_number?: string | null;
}

interface ImportBookingDraft {
  approved: boolean;
  customer_name: string;
  contact_phone: string;
  whatsapp_phone: string;
  id_number: string;
  nationality: string;
  passenger_count: number;
  seat_numbers: string[];
  booking_source: string;
  hotel: string;
  roomType: string;
  returnDay: string;
  extension_nights: number;
  total_price: number;
  notes: string;
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
  const [editId, setEditId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [importRows, setImportRows] = useState<ImportBookingDraft[]>([]);
  const [importing, setImporting] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const importInputRef = useRef<HTMLInputElement | null>(null);

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
      // Only buses flagged active-for-booking are shown/counted.
      const COLS =
        "id,name,bus_number,capacity,trip_id,layout,layout_id,plate,driver_name,driver_phone,driver_id_number";
      if (tripId) {
        const { data: links } = await supabase.from("trip_buses").select("bus_id").eq("trip_id", tripId);
        const ids = (links ?? []).map((x: { bus_id: string }) => x.bus_id);
        let q = supabase
          .from("buses")
          .select(COLS)
          .eq("is_active_booking", true)
          .order("bus_number");
        if (ids.length > 0) {
          q = q.or(`id.in.(${ids.join(",")}),trip_id.eq.${tripId}`);
        } else {
          q = q.eq("trip_id", tripId);
        }
        return ((await q).data as UBBusOpt[]) ?? [];
      }
      return (
        ((await supabase.from("buses").select(COLS).eq("is_active_booking", true).order("bus_number"))
          .data as UBBusOpt[]) ?? []
      );
    },
  });

  // Distinct booking sources actually present in the loaded bookings.
  const sourceOptions: string[] = [
    ...new Set(bookings.map((b) => (b.booking_source ?? "").trim() || "الموقع")),
  ].sort((a, z) => a.localeCompare(z, "ar"));

  const { data: importHotels = [] } = useQuery({
    queryKey: ["ub-import-hotels"],
    queryFn: async () =>
      ((await supabase.from("packages").select("id,name").eq("active", true).order("display_order")).data ?? []) as Array<{
        id: string;
        name: string;
      }>,
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
  const busLayoutId = bus?.layout_id ?? null;
  const { data: busLayout } = useQuery({
    queryKey: ["ub-bus-layout", busLayoutId],
    enabled: !!busLayoutId,
    queryFn: async () => {
      if (!busLayoutId) return null;
      return (await supabase.from("bus_layouts").select("layout_json").eq("id", busLayoutId).maybeSingle()).data as {
        layout_json: LayoutJson;
      } | null;
    },
  });

  const activeSeatBookings = filtered.filter((b) => !b.deleted_at && b.status !== "cancelled" && (b.seat_numbers?.length ?? 0) > 0);
  const liveSeatNumbers = activeSeatBookings.flatMap((b) => b.seat_numbers ?? []);
  const liveSeatGenders = activeSeatBookings.reduce<Record<string, "male" | "female">>((acc, b) => {
    const explicit = (b.seat_genders ?? {}) as Record<string, "male" | "female">;
    for (const [idx, seat] of (b.seat_numbers ?? []).entries()) {
      acc[seat] = explicit[seat] ?? (idx < Number(b.male_count ?? 0) ? "male" : "female");
    }
    return acc;
  }, {});
  const liveSeatNames = activeSeatBookings.reduce<Record<string, string>>((acc, b) => {
    for (const seat of b.seat_numbers ?? []) acc[seat] = twoPartName(b.customer_name ?? "");
    return acc;
  }, {});
  const liveLayout = bus ? busLayout?.layout_json ?? buildDefaultLayout(bus.layout === "B" ? "B" : "A") : null;

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
    return renderSeatChartPages(layout, occupants, {
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
      "نوع الغرفة": roomDisplayLabel((b.room_type ?? "5") as RoomType, (b.booking_type as "individual" | "family" | null) ?? null, !!b.package_id),
      الذكور: Number(b.male_count ?? 0),
      الإناث: Number(b.female_count ?? 0),
      المقاعد: (b.seat_numbers ?? []).join(", "),
      "اسم الفندق": b.packages?.name ?? "-",
      الذهاب: departureDisplay(b.departure_date ?? b.trips?.departure_date, b.trips?.departure_day, "-", b.trip_mode),
      العودة: departureDisplay(b.return_date ?? b.trips?.return_date, b.trips?.return_day, "-"),
      "العودة الفعلية": returnActualDisplay(b.return_date ?? b.trips?.return_date, b.actual_return_day || b.trips?.return_day, b.extension_nights, b.trip_mode, "-"),
      "إجمالي المبلغ": Number(b.total_price),
      ملاحظات: b.notes ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    const busLabel = bus?.name || `bus-${bus?.bus_number ?? busId}`;
    XLSX.utils.book_append_sheet(wb, ws, "Bookings");
    XLSX.writeFile(wb, `${busLabel}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function normalizeImportText(v: unknown): string {
    return String(v ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function importNumber(v: unknown): number {
    const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function roomTypeFromLabel(label: string): RoomType {
    if (label.includes("فرد")) return "1";
    if (label.includes("ثن")) return "2";
    if (label.includes("ثلاث")) return "3";
    if (label.includes("ربع")) return "4";
    return "5";
  }

  function findColumn(headers: string[], aliases: string[]): number {
    return headers.findIndex((h) => aliases.some((a) => h.includes(a)));
  }

  function downloadImportTemplate() {
    const headers = [
      "العميل",
      "الجوال",
      "واتساب",
      "الهوية",
      "الجنسية",
      "العدد",
      "المقاعد",
      "المندوب",
      "الفندق",
      "نوع الغرفة",
      "العودة",
      "ليالي التمديد",
      "إجمالي",
      "ملاحظات",
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "كشف ركاب");
    XLSX.writeFile(wb, "نموذج_كشف_الركاب.xlsx");
  }

  async function handleImportFile(file: File | null | undefined) {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = sheetName ? wb.Sheets[sheetName] : null;
      if (!sheet) throw new Error("تعذر قراءة الملف");
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const headerIndex = aoa.findIndex((row) => {
        const text = row.map(normalizeImportText).join(" ");
        return text.includes("العميل") && text.includes("العدد");
      });
      if (headerIndex < 0) throw new Error("لم يتم العثور على رأس جدول الركاب في الملف");

      const headers = aoa[headerIndex].map(normalizeImportText);
      const idx = {
        customer: findColumn(headers, ["العميل", "الاسم"]),
        phone: findColumn(headers, ["الجوال", "رقم الجوال", "الهاتف", "تليفون"]),
        whatsapp: findColumn(headers, ["واتساب", "whatsapp"]),
        id: findColumn(headers, ["الهوية", "الجواز"]),
        nationality: findColumn(headers, ["جنسية", "الجنسية"]),
        count: findColumn(headers, ["العدد", "الأفراد"]),
        seats: findColumn(headers, ["المقاعد", "المقعد"]),
        rep: findColumn(headers, ["المندوب", "مصدر"]),
        hotel: findColumn(headers, ["الفندق"]),
        room: findColumn(headers, ["نوع الغرفه", "نوع الغرفة", "الغرفة"]),
        returnDay: findColumn(headers, ["العوده", "العودة"]),
        extension: findColumn(headers, ["ليالي التمديد", "التمديد"]),
        total: findColumn(headers, ["إجمالي", "اجمالي", "السعر"]),
        notes: findColumn(headers, ["ملاحظات", "ملاحظة"]),
      };

      const parsed = aoa.slice(headerIndex + 1).flatMap((row): ImportBookingDraft[] => {
        const at = (i: number) => (i >= 0 ? row[i] : "");
        const customer = normalizeImportText(at(idx.customer));
        const count = Math.max(1, importNumber(at(idx.count)) || 1);
        const phone = normalizeImportText(at(idx.phone));
        const seats = normalizeImportText(at(idx.seats))
          .split(/[,،\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const hasUsefulData = customer || phone || seats.length > 0;
        if (!hasUsefulData) return [];
        return [
          {
            approved: true,
            customer_name: customer,
            contact_phone: phone,
            whatsapp_phone: normalizeImportText(at(idx.whatsapp)) || phone,
            id_number: normalizeImportText(at(idx.id)),
            nationality: normalizeImportText(at(idx.nationality)),
            passenger_count: count,
            seat_numbers: seats,
            booking_source: normalizeImportText(at(idx.rep)) || "Admin",
            hotel: normalizeImportText(at(idx.hotel)),
            roomType: normalizeImportText(at(idx.room)),
            returnDay: normalizeImportText(at(idx.returnDay)),
            extension_nights: Math.max(0, importNumber(at(idx.extension))),
            total_price: importNumber(at(idx.total)),
            notes: normalizeImportText(at(idx.notes)),
          },
        ];
      });

      if (parsed.length === 0) throw new Error("لم يتم العثور على حجوزات قابلة للاستيراد");
      setImportRows(parsed);
      setImportOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر قراءة ملف الكشف");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function approveImportedBookings() {
    const rows = importRows.filter((r) => r.approved);
    if (rows.length === 0) return toast.error("حدد حجزًا واحدًا على الأقل");
    const invalid = rows.find((r) => !r.customer_name.trim() || !r.contact_phone.trim());
    if (invalid) return toast.error("كل حجز معتمد يحتاج اسم العميل ورقم الجوال");

    setImporting(true);
    const stamp = Date.now();
    const payloads = rows.map((r, i) => {
      const hotel = importHotels.find((h) => h.name.trim() === r.hotel.trim());
      const noHotel = !hotel;
      const passengerCount = Math.max(1, Number(r.passenger_count) || 1);
      const totalPrice = Math.max(0, Number(r.total_price) || 0);
      const source = r.booking_source.trim() || "Admin";
      return {
        booking_code: `IMP-${stamp}-${i + 1}`,
        booking_type: r.roomType.includes("مشترك") || noHotel ? "individual" : "family",
        passenger_count: passengerCount,
        male_count: passengerCount,
        female_count: 0,
        seat_genders: Object.fromEntries((r.seat_numbers ?? []).map((seat) => [seat, "male"])),
        room_type: roomTypeFromLabel(r.roomType),
        package_id: hotel?.id ?? null,
        extension_nights: noHotel ? 0 : Math.max(0, Number(r.extension_nights) || 0),
        trip_id: tripId || null,
        bus_id: busId || null,
        trip_mode: "round",
        seat_numbers: r.seat_numbers ?? [],
        no_hotel: noHotel,
        no_bus: !busId,
        customer_name: r.customer_name.trim(),
        id_number: r.id_number.trim(),
        id_image_url: null,
        nationality: r.nationality.trim() || null,
        booking_source: source,
        contact_phone: r.contact_phone.trim(),
        whatsapp_phone: (r.whatsapp_phone || r.contact_phone).trim(),
        rep_name: source === "Admin" || source === "الموقع" ? null : source,
        rep_phone: null,
        rep_whatsapp: null,
        price_per_person: Math.round(totalPrice / passengerCount),
        total_price: totalPrice,
        coupon_code: null,
        discount_amount: 0,
        status: "confirmed",
        notes: r.notes.trim() || null,
        actual_return_day: r.returnDay.trim() || null,
      };
    });

    const { error } = await supabase.from("bookings").insert(payloads as never);
    setImporting(false);
    if (error) return toast.error(error.message);
    toast.success(`تم استيراد ${payloads.length} حجز`);
    setImportOpen(false);
    setImportRows([]);
    qcInner.invalidateQueries({ queryKey: ["admin-bookings"] });
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
        departureDate: departureDisplay(info?.departure_date, info?.departure_day, ""),
        returnDate: departureDisplay(info?.return_date, info?.return_day, ""),
        capacity: bus?.capacity,
        busNumber: bus ? bus.bus_number : "",
        driverName: bus?.driver_name ?? "",
        plate: bus?.plate ?? "",
        driverId: bus?.driver_id_number ?? "",
        driverPhone: bus?.driver_phone ?? "",
        passengersTotal: totalPax,
        seatsRemaining: bus ? Math.max(0, (bus.capacity ?? 0) - totalPax) : undefined,
      },
      rows: filtered.map((b) => ({
        rep: b.booking_source || "الموقع",
        customer: b.customer_name ?? "",
        idNumber: b.id_number ?? "",
        nationality: b.nationality ?? "",
        count: b.passenger_count || 0,
        returnDay: returnActualDisplay(b.return_date ?? b.trips?.return_date, b.actual_return_day || b.trips?.return_day, b.extension_nights, b.trip_mode, ""),
        hotel: b.packages?.name ?? "بدون فندق",
        roomType: roomDisplayLabel((b.room_type ?? "5") as RoomType, (b.booking_type as "individual" | "family" | null) ?? null, !!b.package_id) ?? String(b.room_type ?? ""),
        packageTotal: Number(b.total_price || 0),
        extensionNights: Number(b.extension_nights ?? 0),
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
        let noHotelPeople = 0;
        let noHotelBookings = 0;
        for (const b of filtered) {
          const hotel = b.packages?.name;
          if (!hotel) {
            noHotelPeople += b.passenger_count || 0;
            noHotelBookings += 1;
            continue;
          }
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
            <div className="col-span-2 md:col-span-4 lg:col-span-6 flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="rounded-full h-8 px-4 text-xs"
                onClick={() => {
                  const lines = [
                    `الحجوزات: ${filtered.length}`,
                    `المعتمرون: ${passengers}`,
                    `الإيرادات (مؤكد): ${sar(revenue)}`,
                    `حجوزات اليوم: ${todayCount}`,
                    ...(tripId ? [`مواعيد العودة: ${returnCount}`] : []),
                    `${tripId ? "حافلات الرحلة" : "إجمالي الحافلات"}: ${busesInScope}`,
                    `الغرف: ${rooms}${sharedPeople > 0 ? ` (+ ${sharedPeople} أفراد مشترك)` : ""}`,
                    ...hotelStats.map(
                      (h) =>
                        `${h.hotel}: ${h.total} غرفة — ${h.lines.join("، ")}${h.shared > 0 ? ` — + ${h.shared} أفراد مشترك` : ""}`,
                    ),
                    `بدون فندق: ${noHotelPeople} فرد (${noHotelBookings} حجز)`,
                  ];
                  navigator.clipboard
                    .writeText(lines.join("\n"))
                    .then(() => toast.success("تم نسخ جميع العدادات"))
                    .catch(() => toast.error("تعذر النسخ"));
                }}
              >
                نسخ جميع العدادات
              </Button>
            </div>

            <StatCard icon={CalendarCheck} label="الحجوزات" value={String(filtered.length)} />
            <StatCard icon={Users} label="المعتمرون" value={String(passengers)} />
            <StatCard icon={DollarSign} label="الإيرادات (مؤكد)" value={sar(revenue)} />
            <StatCard icon={CalendarClock} label="حجوزات اليوم" value={String(todayCount)} />
            {tripId && <StatCard icon={CalendarCheck} label="مواعيد العودة" value={String(returnCount)} />}
            <StatCard icon={Bus} label={tripId ? "حافلات الرحلة" : "إجمالي الحافلات"} value={String(busesInScope)} />

            {bus && liveLayout && (
              <div className="surface-card p-4 space-y-3 col-span-2 md:col-span-4 lg:col-span-6">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-extrabold flex items-center gap-2">
                    <Bus className="h-4 w-4 text-primary" /> مخطط الحافلة الحي
                  </h3>
                  <span className="text-xs text-muted-foreground">{liveSeatNumbers.length} مقعد مشغول</span>
                </div>
                <div className="pointer-events-none" style={{ direction: "ltr" }}>
                  <LayoutSeatMap
                    layout={mirrorLayout(liveLayout)}
                    selected={liveSeatNumbers}
                    reserved={[]}
                    maxSelectable={liveSeatNumbers.length}
                    genders={liveSeatGenders}
                    names={liveSeatNames}
                    large
                    onChange={() => undefined}
                  />
                </div>

                {/* Detailed occupancy: seat → passenger name → representative */}
                {activeSeatBookings.length > 0 && (
                  <div className="rounded-2xl border overflow-hidden">
                    <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] gap-2 bg-muted px-3 py-2 text-[11px] font-extrabold text-muted-foreground">
                      <span>المقعد</span>
                      <span>الاسم</span>
                      <span>المندوب</span>
                    </div>
                    <div className="max-h-72 overflow-auto divide-y">
                      {activeSeatBookings
                        .flatMap((b) => (b.seat_numbers ?? []).map((seat) => ({ seat, b })))
                        .sort((a, z) => a.seat.localeCompare(z.seat, "en", { numeric: true }))
                        .map(({ seat, b }) => (
                          <div
                            key={`${b.id}-${seat}`}
                            className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-3 py-2 text-xs"
                          >
                            <span className="shrink-0 rounded-full bg-[color:var(--color-navy)] px-2 py-0.5 font-extrabold text-white">
                              {seat}
                            </span>
                            <span className="truncate text-sm font-extrabold text-[color:var(--color-navy)]">{twoPartName(b.customer_name)}</span>
                            <span className="truncate text-muted-foreground">{b.booking_source || "الموقع"}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>

            )}


            {/* Independent bus-number card */}
            <div className="surface-card p-5 col-span-2 md:col-span-4 lg:col-span-6">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">رقم الحافلة</span>
                <Bus className="h-5 w-5 text-primary" />
              </div>
              {bus ? (
                <p className="mt-1 text-3xl font-extrabold text-[color:var(--color-navy)]">#{bus.bus_number}</p>
              ) : buses.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">لا توجد حافلات.</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {buses.map((bb) => (
                    <span
                      key={bb.id}
                      className="rounded-full border bg-white px-3 py-1 text-sm font-extrabold text-[color:var(--color-navy)]"
                    >
                      #{bb.bus_number}
                      {bb.name ? <span className="text-[11px] font-semibold text-muted-foreground"> — {bb.name}</span> : null}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Wide rooms counter: overall total + a mini counter per hotel (hotels only) */}
            <div className="surface-card p-5 col-span-2 md:col-span-4 lg:col-span-6">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">الغرف</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full h-7 px-3 text-xs"
                    onClick={() => {
                      const lines = [
                        `الغرف: ${rooms}${sharedPeople > 0 ? ` (+ ${sharedPeople} أفراد مشترك)` : ""}`,
                        ...hotelStats.map(
                          (h) =>
                            `${h.hotel}: ${h.total} غرفة — ${h.lines.join("، ")}${h.shared > 0 ? ` — + ${h.shared} أفراد مشترك` : ""}`,
                        ),
                      ];
                      navigator.clipboard
                        .writeText(lines.join("\n"))
                        .then(() => toast.success("تم نسخ بيان الغرف"))
                        .catch(() => toast.error("تعذر النسخ"));
                    }}
                  >
                    نسخ المعلومات
                  </Button>
                  <HotelIcon className="h-5 w-5 text-primary" />
                </div>
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

            {/* Standalone: no-hotel bookings are seats only, independent of room math */}
            {noHotelPeople > 0 && (
              <div className="surface-card p-5 col-span-2 md:col-span-4 lg:col-span-6 border-2 border-dashed">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">بدون فندق (مقاعد فقط)</span>
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-1 flex items-end gap-3 flex-wrap">
                  <p className="text-3xl font-extrabold text-[color:var(--color-navy)]">
                    {noHotelPeople} <span className="text-xs font-semibold">فرد</span>
                  </p>
                  <p className="text-xs text-muted-foreground pb-1">{noHotelBookings} حجز</p>
                </div>
              </div>
            )}

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

      <div className="flex justify-end gap-2 flex-wrap">
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.xlsm"
          className="hidden"
          onChange={(e) => handleImportFile(e.target.files?.[0])}
        />
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => importInputRef.current?.click()}>
          <Download className="h-3 w-3 ml-1" /> رفع كشف
        </Button>
        <Button size="sm" variant="outline" className="rounded-full" onClick={downloadImportTemplate}>
          <FileDown className="h-3 w-3 ml-1" /> تنزيل النموذج
        </Button>
        <Button size="sm" className="rounded-full" onClick={() => setManualOpen((v) => !v)}>
          <Plus className="h-3 w-3 ml-1" />
          حجز يدوي
        </Button>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>مراجعة الحجوزات المستوردة</DialogTitle>
            <DialogDescription>راجع الحجوزات المقروءة من الكشف، وعدّل الاسم أو الجوال عند الحاجة قبل الاعتماد.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-muted">
                <tr>
                  <th className="border p-2">اعتماد</th>
                  <th className="border p-2">الاسم</th>
                  <th className="border p-2">الجوال</th>
                  <th className="border p-2">الأفراد</th>
                  <th className="border p-2">المقاعد</th>
                  <th className="border p-2">الفندق</th>
                  <th className="border p-2">الغرفة</th>
                  <th className="border p-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((r, i) => (
                  <tr key={`${r.customer_name}-${i}`}>
                    <td className="border p-2 text-center">
                      <input
                        type="checkbox"
                        checked={r.approved}
                        onChange={(e) =>
                          setImportRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, approved: e.target.checked } : x)))
                        }
                      />
                    </td>
                    <td className="border p-1 min-w-44">
                      <Input
                        className="h-8 text-xs"
                        value={r.customer_name}
                        onChange={(e) =>
                          setImportRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, customer_name: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="border p-1 min-w-36">
                      <Input
                        dir="ltr"
                        className="h-8 text-xs"
                        value={r.contact_phone}
                        onChange={(e) =>
                          setImportRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, contact_phone: e.target.value } : x)))
                        }
                      />
                    </td>
                    <td className="border p-2 text-center">{r.passenger_count}</td>
                    <td className="border p-2 text-center font-mono">{r.seat_numbers.join(", ") || "—"}</td>
                    <td className="border p-2 text-center">{r.hotel || "بدون فندق"}</td>
                    <td className="border p-2 text-center">{r.roomType || "—"}</td>
                    <td className="border p-2 text-center font-bold">{sar(r.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => setImportOpen(false)}>
              إلغاء
            </Button>
            <Button className="rounded-full" disabled={importing} onClick={approveImportedBookings}>
              {importing ? "جاري الاستيراد..." : "اعتماد الحجوزات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                colSpan={17}
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
                <TableCell colSpan={17} className="text-center py-10 text-muted-foreground">
                  لا توجد حجوزات مطابقة.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((b) =>
              editId === b.id ? (
                <ManualBookingRow
                  key={b.id}
                  colSpan={17}
                  initial={{
                    id: b.id,
                    booking_code: b.booking_code,
                    customer_name: b.customer_name ?? "",
                    contact_phone: b.contact_phone ?? "",
                    whatsapp_phone: b.whatsapp_phone ?? "",
                    id_number: b.id_number ?? "",
                    id_image_url: b.id_image_url ?? "",
                    nationality: b.nationality ?? "",
                    booking_source: b.booking_source ?? "Admin",
                    booking_type: (b.booking_type as "individual" | "family") ?? "family",
                    passenger_count: b.passenger_count ?? 1,
                    male_count: b.male_count ?? b.passenger_count ?? 1,
                    female_count: b.female_count ?? 0,
                    room_type: ((b.room_type ?? "1") as RoomType),
                    package_id: b.package_id ?? null,
                    extension_nights: Number(b.extension_nights ?? 0),
                    trip_id: b.trip_id ?? null,
                    bus_id: b.bus_id ?? null,
                    trip_mode: ((b.trip_mode ?? "round") as "round" | "outbound" | "return"),
                    seat_numbers: b.seat_numbers ?? [],
                    actual_return_day: b.actual_return_day ?? "",
                    coupon_code: b.coupon_code ?? "",
                    discount_amount: Number(b.discount_amount ?? 0),
                    notes: b.notes ?? "",
                    status: b.status ?? "confirmed",
                    total_price: Number(b.total_price),
                  }}
                  onClose={() => setEditId(null)}
                  onSaved={() => {
                    setEditId(null);
                    qcInner.invalidateQueries({ queryKey: ["admin-bookings"] });
                  }}
                />
              ) : (
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
                <TableCell className="text-xs">{roomDisplayLabel((b.room_type ?? "5") as RoomType, (b.booking_type as "individual" | "family" | null) ?? null, !!b.package_id) ?? "-"}</TableCell>
                <TableCell className="text-xs">{(b.extension_nights ?? 0) > 0 ? `${b.extension_nights} ليلة` : "بدون"}</TableCell>
                <TableCell className="text-xs">{tripWithDate(b.trips?.name, b.departure_date ?? b.trips?.departure_date, b.trips?.departure_day)}</TableCell>
                <TableCell className="text-xs">{returnActualDisplay(b.return_date ?? b.trips?.return_date, b.actual_return_day ?? b.trips?.return_day, b.extension_nights, b.trip_mode, "-")}</TableCell>
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
                    <Button
                      size="sm"
                      variant="outline"
                      title="تعديل سريع"
                      onClick={() => {
                        setManualOpen(false);
                        setEditId(b.id);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
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
              ),
            )}

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

// ================== BOOKING AVAILABILITY CONTROL ==================
interface BookingCtlRow {
  booking_enabled: boolean;
  booking_block_guest: boolean;
  booking_block_customer: boolean;
  booking_block_representative: boolean;
  booking_schedule_enabled: boolean;
  booking_open_time: string;
  booking_close_time: string;
  booking_unavailable_message: string;
}

const BOOKING_CTL_FIELDS =
  "booking_enabled,booking_block_guest,booking_block_customer,booking_block_representative,booking_schedule_enabled,booking_open_time,booking_close_time,booking_unavailable_message";

function BookingControlTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["booking-control"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select(BOOKING_CTL_FIELDS).eq("id", 1).maybeSingle();
      return data as unknown as BookingCtlRow;
    },
  });
  const [local, setLocal] = useState<BookingCtlRow | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) setLocal(data);
  }, [data]);

  async function save() {
    if (!local) return;
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        ...local,
        booking_unavailable_message:
          local.booking_unavailable_message?.trim() || DEFAULT_BOOKING_UNAVAILABLE_MESSAGE,
      } as never)
      .eq("id", 1);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ إعدادات التحكم في الحجز");
    qc.invalidateQueries({ queryKey: ["booking-control"] });
    qc.invalidateQueries({ queryKey: ["booking-availability"] });
  }

  if (!local) return <div className="surface-card p-10 text-center text-sm text-muted-foreground">جارٍ التحميل…</div>;

  // `inverted` = the stored column is a "block_*" flag, so the switch shows the opposite.
  const onoff = (k: keyof BookingCtlRow, label: string, hint: string | undefined, inverted: boolean) => {
    const on = inverted ? !local[k] : Boolean(local[k]);
    return (
      <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={on}
          onChange={(e) => setLocal({ ...local, [k]: inverted ? !e.target.checked : e.target.checked })}
        />
        <span>
          <span className="block text-sm font-bold">
            {label} — <span className={on ? "text-green-600" : "text-destructive"}>{on ? "مفعّل" : "متوقف"}</span>
          </span>
          {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
        </span>
      </label>
    );
  };


  return (
    <div className="space-y-4">
      <div className="surface-card p-6 space-y-4">
        <div>
          <h2 className="text-lg font-extrabold">التحكم الأساسي في الحجز</h2>
          <p className="text-xs text-muted-foreground">
            تحكم يدوي مستقل تمامًا عن الجدولة. المسؤولون والمديرون غير متأثرين.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {onoff("booking_enabled", "الحجز للجميع", "عند إيقافه يتوقف إنشاء وتعديل الحجوزات لجميع الفئات غير الإدارية.", false)}
          {onoff("booking_block_representative", "الحجز للمندوبين", undefined, true)}
          {onoff("booking_block_customer", "الحجز للعملاء", undefined, true)}
          {onoff("booking_block_guest", "الحجز للزوار غير المسجلين", undefined, true)}
        </div>

        <div className="space-y-2">
          <Label>رسالة الإيقاف الأساسية</Label>
          <p className="text-xs text-muted-foreground">تظهر عند المنع بسبب الإيقاف اليدوي.</p>
          <Textarea
            rows={4}
            value={local.booking_unavailable_message ?? ""}
            placeholder={DEFAULT_BOOKING_UNAVAILABLE_MESSAGE}
            onChange={(e) => setLocal({ ...local, booking_unavailable_message: e.target.value })}
          />
        </div>

        <Button onClick={save} disabled={saving} className="btn-primary-glow rounded-full">
          <Save className="h-4 w-4 ml-1" /> حفظ التحكم الأساسي
        </Button>
      </div>

      <BookingSchedulesCard />
    </div>
  );
}

// ================== BOOKING SCHEDULES ==================
interface BookingSchedule {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  enabled: boolean;
  block_representative: boolean;
  block_customer: boolean;
  block_guest: boolean;
  message: string;
  display_order: number;
}

function BookingSchedulesCard() {
  const qc = useQueryClient();
  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["booking-schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_schedules" as never)
        .select("*")
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as BookingSchedule[];
    },
  });
  const [drafts, setDrafts] = useState<Record<string, BookingSchedule>>({});

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["booking-schedules"] });
    qc.invalidateQueries({ queryKey: ["booking-availability"] });
  };

  async function addSchedule() {
    const { error } = await supabase.from("booking_schedules" as never).insert({
      name: "جدولة جديدة",
      start_time: "23:00",
      end_time: "08:00",
      enabled: false,
      block_representative: false,
      block_customer: false,
      block_guest: false,
      message: DEFAULT_BOOKING_UNAVAILABLE_MESSAGE,
      display_order: schedules.length,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("تمت إضافة جدولة");
    refresh();
  }

  async function saveSchedule(s: BookingSchedule) {
    const { id, ...rest } = s;
    const { error } = await supabase
      .from("booking_schedules" as never)
      .update({ ...rest, message: rest.message?.trim() || DEFAULT_BOOKING_UNAVAILABLE_MESSAGE } as never)
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الجدولة");
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    refresh();
  }

  async function toggleSchedule(s: BookingSchedule, enabled: boolean) {
    const { error } = await supabase.from("booking_schedules" as never).update({ enabled } as never).eq("id", s.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function removeSchedule(s: BookingSchedule) {
    if (!confirm(`حذف الجدولة "${s.name}"؟`)) return;
    const { error } = await supabase.from("booking_schedules" as never).delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الجدولة");
    refresh();
  }

  const value = (s: BookingSchedule) => drafts[s.id] ?? s;
  const patch = (s: BookingSchedule, p: Partial<BookingSchedule>) =>
    setDrafts((d) => ({ ...d, [s.id]: { ...(d[s.id] ?? s), ...p } }));

  return (
    <div className="surface-card p-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-extrabold">جدولة الحجز</h2>
          <p className="text-xs text-muted-foreground">
            منع مؤقت خلال الفترة المحددة فقط (بتوقيت الرياض)، ولا يغيّر التحكم الأساسي.
          </p>
        </div>
        <Button onClick={addSchedule} className="rounded-full" variant="outline">
          + إضافة جدولة
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : schedules.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد جداول بعد.</p>
      ) : (
        <div className="space-y-4">
          {schedules.map((row) => {
            const s = value(row);
            const dirty = !!drafts[row.id];
            return (
              <div key={row.id} className="rounded-xl border p-4 space-y-3">
                <div className="grid md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <Label>اسم الجدولة</Label>
                    <Input value={s.name} onChange={(e) => patch(row, { name: e.target.value })} />
                  </div>
                  <div>
                    <Label>وقت البداية</Label>
                    <Input
                      type="time"
                      dir="ltr"
                      value={(s.start_time ?? "23:00").slice(0, 5)}
                      onChange={(e) => patch(row, { start_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>وقت النهاية</Label>
                    <Input
                      type="time"
                      dir="ltr"
                      value={(s.end_time ?? "08:00").slice(0, 5)}
                      onChange={(e) => patch(row, { end_time: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-3">
                  {([
                    ["block_representative", "المندوبون"],
                    ["block_customer", "العملاء"],
                    ["block_guest", "الزوار غير المسجلين"],
                  ] as const).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 rounded-xl border p-3 cursor-pointer text-sm font-bold">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={Boolean(s[k])}
                        onChange={(e) => patch(row, { [k]: e.target.checked } as Partial<BookingSchedule>)}
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <div>
                  <Label>رسالة الجدولة</Label>
                  <Textarea rows={3} value={s.message ?? ""} onChange={(e) => patch(row, { message: e.target.value })} />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <label className="flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer text-sm font-bold">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={row.enabled}
                      onChange={(e) => toggleSchedule(row, e.target.checked)}
                    />
                    {row.enabled ? "الجدولة مفعّلة" : "الجدولة متوقفة"}
                  </label>
                  <Button onClick={() => saveSchedule(s)} disabled={!dirty} className="btn-primary-glow rounded-full">
                    <Save className="h-4 w-4 ml-1" /> حفظ
                  </Button>
                  <Button variant="outline" className="rounded-full text-destructive" onClick={() => removeSchedule(row)}>
                    حذف
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

