import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CalendarCheck, DollarSign, Bus, LogOut, Users, Hotel as HotelIcon, Ticket, Sparkles, Download, Save, Trash2, Plus, Archive, RotateCcw, IdCard, MessageCircle, CalendarClock, Layout, Images, FileText, Share2, Pencil, Search } from "lucide-react";
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
  id: string; booking_code: string; customer_name: string; contact_phone: string;
  whatsapp_phone: string; id_number: string; id_image_url?: string | null; passenger_count: number; total_price: number;
  status: string; created_at: string; seat_numbers: string[]; room_type: string;
  discount_amount?: number; coupon_code?: string | null; deleted_at?: string | null;
  packages?: { name: string } | null; trips?: { name: string } | null; buses?: { bus_number: number } | null;
}

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? "");
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, []);

  // Realtime: refresh bookings list & stats when anything changes server-side
  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase.channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-bookings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin, qc]);

  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-bookings", showArchived],
    enabled: isAdmin === true,
    queryFn: async () => {
      let q = supabase.from("bookings")
        .select("id,booking_code,customer_name,contact_phone,whatsapp_phone,id_number,id_image_url,passenger_count,total_price,status,created_at,seat_numbers,room_type,discount_amount,coupon_code,deleted_at,packages(name),trips(name),buses(bus_number)")
        .order("created_at", { ascending: false })
        .limit(500);
      q = showArchived ? q.not("deleted_at", "is", null) : q.is("deleted_at", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as BookingRow[];
    },
  });

  async function archiveBooking(id: string) {
    if (!confirm("أرشفة الحجز؟")) return;
    const { error } = await supabase.from("bookings").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تمت الأرشفة");
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
  }
  async function restoreBooking(id: string) {
    const { error } = await supabase.from("bookings").update({ deleted_at: null }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم الاسترجاع");
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

  async function signOut() { await supabase.auth.signOut(); navigate({ to: "/auth" }); }

  const totalRevenue = bookings.filter((b) => b.status === "confirmed").reduce((s, b) => s + Number(b.total_price), 0);
  const totalPassengers = bookings.reduce((s, b) => s + b.passenger_count, 0);

  function exportBookingsExcel() {
    const rows = bookings.map((b) => ({
      "رقم الحجز": b.booking_code,
      "الاسم": b.customer_name,
      "الهوية": b.id_number,
      "الجوال": b.contact_phone,
      "واتساب": b.whatsapp_phone,
      "الفندق": b.packages?.name ?? "-",
      "الغرفة": b.room_type,
      "الرحلة": b.trips?.name ?? "-",
      "الباص": b.buses?.bus_number ?? "-",
      "المقاعد": b.seat_numbers.join(", "),
      "الخصم": Number(b.discount_amount ?? 0),
      "الكود": b.coupon_code ?? "",
      "السعر": Number(b.total_price),
      "الحالة": b.status,
      "التاريخ": formatDate(b.created_at),
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
          <div className="flex items-center gap-3"><Logo size={42} withText light /></div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="hidden md:inline text-sm text-white/70">{email}</span>
            {isAdmin && <NotificationBell />}
            {isAdmin && <Link to="/audit"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">السجل</Button></Link>}
            {isAdmin && <Link to="/admin-buses"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><Bus className="h-4 w-4 ml-1" /> الأسطول</Button></Link>}
            

            {isAdmin && <Link to="/admin-trips"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><CalendarClock className="h-4 w-4 ml-1" /> الرحلات</Button></Link>}
            {isAdmin && <Link to="/admin-gallery"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><Images className="h-4 w-4 ml-1" /> المعرض</Button></Link>}
            {isAdmin && <Link to="/admin-packages"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><Images className="h-4 w-4 ml-1" /> الباقات</Button></Link>}
            {isAdmin && <Link to="/admin-users"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><Users className="h-4 w-4 ml-1" /> المستخدمون</Button></Link>}
            {isAdmin && <Link to="/admin-assets"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><Images className="h-4 w-4 ml-1" /> مكتبة الوسائط</Button></Link>}
            <Link to="/" className="text-sm text-white/80 hover:text-white">الموقع</Link>
            <Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" onClick={signOut}>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={CalendarCheck} label="إجمالي الحجوزات" value={String(bookings.length)} />
          <StatCard icon={Users} label="عدد المعتمرين" value={String(totalPassengers)} />
          <StatCard icon={DollarSign} label="الإيرادات" value={sar(totalRevenue)} />
          <StatCard icon={Bus} label="حجوزات اليوم" value={String(bookings.filter((b) => new Date(b.created_at).toDateString() === new Date().toDateString()).length)} />
        </div>

        <Tabs defaultValue="bookings" className="w-full">
          <TabsList className="w-full flex flex-wrap h-auto justify-start bg-white rounded-2xl p-1.5">
            <TabsTrigger value="bookings" className="rounded-xl"><CalendarCheck className="h-4 w-4 ml-1" /> إدارة الحجوزات</TabsTrigger>
            <TabsTrigger value="packages" className="rounded-xl"><HotelIcon className="h-4 w-4 ml-1" /> الفنادق</TabsTrigger>
            <TabsTrigger value="pricing" className="rounded-xl"><DollarSign className="h-4 w-4 ml-1" /> الأسعار</TabsTrigger>
            <TabsTrigger value="wheel" className="rounded-xl"><Sparkles className="h-4 w-4 ml-1" /> السحب</TabsTrigger>
            <TabsTrigger value="coupons" className="rounded-xl"><Ticket className="h-4 w-4 ml-1" /> الكوبونات</TabsTrigger>
            <TabsTrigger value="social" className="rounded-xl"><Share2 className="h-4 w-4 ml-1" /> التواصل</TabsTrigger>
            <TabsTrigger value="site" className="rounded-xl"><Layout className="h-4 w-4 ml-1" /> إعدادات الموقع</TabsTrigger>
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
              downloadIdImage={downloadIdImage}
            />
          </TabsContent>

          <TabsContent value="packages" className="mt-4"><PackagesTab /></TabsContent>
          <TabsContent value="pricing" className="mt-4"><PricingTab /></TabsContent>
          <TabsContent value="wheel" className="mt-4"><WheelTab /></TabsContent>
          <TabsContent value="coupons" className="mt-4"><CouponsTab /></TabsContent>
          <TabsContent value="social" className="mt-4"><SocialTab /></TabsContent>
          <TabsContent value="site" className="mt-4"><SiteTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}



// ================== UNIFIED BOOKINGS (merges: main list + trip/bus filter + editor entry) ==================
interface UBTripOpt { id: string; name: string; }
interface UBBusOpt { id: string; name: string | null; bus_number: number; capacity: number; trip_id: string | null; }

function UnifiedBookingsTab(props: {
  bookings: BookingRow[];
  showArchived: boolean;
  setShowArchived: (v: boolean | ((p: boolean) => boolean)) => void;
  exportBookingsExcel: () => void;
  archiveBooking: (id: string) => void;
  restoreBooking: (id: string) => void;
  permanentDelete: (id: string) => void;
  downloadIdImage: (b: BookingRow) => void;
}) {
  const { bookings, showArchived, setShowArchived, exportBookingsExcel, archiveBooking, restoreBooking, permanentDelete, downloadIdImage } = props;
  const [tripId, setTripId] = useState<string>("");
  const [busId, setBusId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState<string>("");

  const { data: trips = [] } = useQuery({
    queryKey: ["ub-trips"],
    queryFn: async () => (await supabase.from("trips").select("id,name").eq("active", true).order("display_order")).data as UBTripOpt[] ?? [],
  });
  const { data: buses = [] } = useQuery({
    queryKey: ["ub-buses", tripId],
    enabled: !!tripId,
    queryFn: async () => (await supabase.from("buses").select("id,name,bus_number,capacity,trip_id").eq("trip_id", tripId).order("bus_number")).data as UBBusOpt[] ?? [],
  });

  // Cross-reference bookings against filters. Trip / bus data live on joined
  // tables in the row shape, but bus/trip ids are not selected here, so we
  // filter by names to keep the request compact.
  const tripName = trips.find((t) => t.id === tripId)?.name ?? "";
  const busNumber = buses.find((b) => b.id === busId)?.bus_number;

  const filtered = bookings.filter((b) => {
    if (status && b.status !== status) return false;
    if (tripName && (b.trips?.name ?? "") !== tripName) return false;
    if (busNumber !== undefined && (b.buses?.bus_number ?? -1) !== busNumber) return false;
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

  return (
    <div className="surface-card p-6 space-y-4">
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
            <Button variant="outline" className="rounded-full"><Pencil className="h-4 w-4 ml-1" /> محرر تفصيلي</Button>
          </Link>
          <Button onClick={exportBookingsExcel} className="rounded-full"><Download className="h-4 w-4 ml-1" /> Excel</Button>
        </div>
      </div>

      {/* Professional filter bar */}
      <div className="grid gap-3 md:grid-cols-4 rounded-2xl border-2 border-dashed border-border p-3 bg-muted/40">
        <div>
          <Label className="text-xs mb-1 block">الرحلة</Label>
          <select value={tripId} onChange={(e) => { setTripId(e.target.value); setBusId(""); }} className="h-10 w-full rounded-md border px-3 text-sm bg-white">
            <option value="">— كل الرحلات —</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">الحافلة</Label>
          <select value={busId} onChange={(e) => setBusId(e.target.value)} disabled={!tripId} className="h-10 w-full rounded-md border px-3 text-sm disabled:opacity-50 bg-white">
            <option value="">{tripId ? "— كل الحافلات —" : "اختر رحلة أولاً"}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">الحالة</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 w-full rounded-md border px-3 text-sm bg-white">
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
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الحجز، الاسم، الجوال..." className="ps-9" />
          </div>
        </div>
      </div>

      {bus && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Bus} label="الحافلة" value={bus.name || `#${bus.bus_number}`} />
          <StatCard icon={Users} label="المحجوز" value={`${occupied}/${capacity}`} />
          <StatCard icon={CalendarCheck} label="المتاح" value={String(Math.max(0, capacity - occupied))} />
          <StatCard icon={DollarSign} label="نسبة الإشغال" value={`${capacity ? Math.round((occupied / capacity) * 100) : 0}%`} />
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>رقم الحجز</TableHead><TableHead>الاسم</TableHead><TableHead>الجوال</TableHead>
            <TableHead>الرحلة</TableHead><TableHead>الحافلة</TableHead>
            <TableHead>الأفراد</TableHead><TableHead>المقاعد</TableHead><TableHead>الإجمالي</TableHead>
            <TableHead>الحالة</TableHead><TableHead>التاريخ</TableHead><TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-10 text-muted-foreground">لا توجد حجوزات مطابقة.</TableCell></TableRow>}
            {filtered.map((b) => (
              <TableRow key={b.id} className={b.deleted_at ? "opacity-60" : ""}>
                <TableCell className="font-bold" dir="ltr">{b.booking_code}</TableCell>
                <TableCell>{b.customer_name}</TableCell>
                <TableCell dir="ltr">{b.contact_phone}</TableCell>
                <TableCell className="text-xs">{b.trips?.name ?? "-"}</TableCell>
                <TableCell className="text-xs">{b.buses?.bus_number ?? "-"}</TableCell>
                <TableCell>{b.passenger_count}</TableCell>
                <TableCell className="text-xs">{b.seat_numbers.join(", ")}</TableCell>
                <TableCell className="font-bold text-primary">{sar(Number(b.total_price))}</TableCell>
                <TableCell><Badge>{b.status === "confirmed" ? "مؤكَّد" : b.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(b.created_at)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Link to="/ticket/$code" params={{ code: b.booking_code }} title="عرض"><Button size="sm" variant="outline"><Ticket className="h-3 w-3" /></Button></Link>
                    <Link to="/admin-bookings" title="تعديل"><Button size="sm" variant="outline"><Pencil className="h-3 w-3" /></Button></Link>
                    {b.whatsapp_phone && (
                      <a href={`https://wa.me/${b.whatsapp_phone.replace(/\D/g,'')}?text=${encodeURIComponent(`مرحباً ${b.customer_name}، بخصوص حجزك ${b.booking_code}`)}`} target="_blank" rel="noopener noreferrer" title="واتساب">
                        <Button size="sm" variant="outline" className="text-[#25D366] border-[#25D366]/40 hover:bg-[#25D366]/10"><MessageCircle className="h-3 w-3" /></Button>
                      </a>
                    )}
                    {b.id_image_url && <Button size="sm" variant="outline" title="تنزيل الهوية" onClick={() => downloadIdImage(b)}><IdCard className="h-3 w-3" /></Button>}
                    {!b.deleted_at && <Button size="sm" variant="outline" title="أرشفة" onClick={() => archiveBooking(b.id)}><Archive className="h-3 w-3" /></Button>}
                    {b.deleted_at && <Button size="sm" variant="outline" title="استرجاع" onClick={() => restoreBooking(b.id)}><RotateCcw className="h-3 w-3" /></Button>}
                    {b.deleted_at && <Button size="sm" variant="outline" title="حذف نهائي" onClick={() => permanentDelete(b.id)}><Trash2 className="h-3 w-3" /></Button>}
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

function StatCard({ icon: Icon, label, value }: { icon: typeof CalendarCheck; label: string; value: string }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">{label}</span><Icon className="h-5 w-5 text-primary" /></div>
      <p className="mt-2 text-2xl font-extrabold text-[color:var(--color-navy)]">{value}</p>
    </div>
  );
}

// ================== HOTELS (was Packages) ==================
interface PackageRow {
  id: string; slug: string; name: string; description: string; image_url: string;
  tier: string; base_price: number; active: boolean; display_order: number; stars: number | null;
}
function PackagesTab() {
  const qc = useQueryClient();
  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data } = await supabase.from("packages" as never).select("*").order("display_order");
      return ((data as unknown as PackageRow[]) ?? []);
    },
  });

  async function save(p: PackageRow) {
    const { error } = await supabase.from("packages" as never).update({
      name: p.name, description: p.description, image_url: p.image_url,
      tier: p.tier, active: p.active, display_order: p.display_order,
      stars: p.stars,
    } as never).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
    qc.invalidateQueries({ queryKey: ["packages"] });
  }

  async function addPackage() {
    const slug = prompt("معرّف الفندق (لاتيني):");
    if (!slug) return;
    const { error } = await supabase.from("packages" as never).insert({
      slug, name: "فندق جديد", description: "", base_price: 0, tier: "standard", display_order: 99,
    } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
  }

  async function del(id: string) {
    if (!confirm("حذف الفندق؟")) return;
    await supabase.from("packages" as never).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-packages"] });
  }

  return (
    <div className="surface-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-extrabold">إدارة الفنادق</h2>
        <Button onClick={addPackage} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة فندق</Button>
      </div>
      <div className="space-y-4">
        {packages.map((p) => <PackageEditor key={p.id} pkg={p} onSave={save} onDelete={() => del(p.id)} />)}
      </div>
    </div>
  );
}

function PackageEditor({ pkg, onSave, onDelete }: { pkg: PackageRow; onSave: (p: PackageRow) => void; onDelete: () => void }) {
  const [local, setLocal] = useState(pkg);
  useEffect(() => setLocal(pkg), [pkg]);
  return (
    <div className="border-2 border-border rounded-2xl p-4 grid md:grid-cols-6 gap-3">
      <div><Label className="text-xs">الاسم</Label><Input value={local.name} onChange={(e) => setLocal({ ...local, name: e.target.value })} /></div>
      <div className="md:col-span-2"><Label className="text-xs">الوصف</Label><Input value={local.description} onChange={(e) => setLocal({ ...local, description: e.target.value })} /></div>
      <div className="md:col-span-2"><Label className="text-xs">صورة (URL)</Label><Input value={local.image_url} onChange={(e) => setLocal({ ...local, image_url: e.target.value })} /></div>
      <div>
        <Label className="text-xs">تصنيف النجوم (اختياري)</Label>
        <div className="flex gap-1 mt-2 items-center">
          <button type="button" onClick={() => setLocal({ ...local, stars: null })} className="text-[10px] text-muted-foreground underline">لا يوجد</button>
          {[1,2,3,4,5].map((n) => (
            <button key={n} type="button" onClick={() => setLocal({ ...local, stars: n })} className={`text-lg ${(local.stars ?? 0) >= n ? "text-amber-400" : "text-muted-foreground/40"}`}>★</button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 md:col-span-6">
        <div className="flex items-center gap-2"><Switch checked={local.active} onCheckedChange={(v) => setLocal({ ...local, active: v })} /><span className="text-xs">مفعّل</span></div>
        <div className="ms-auto flex gap-1">
          <Button size="sm" onClick={() => onSave(local)} className="rounded-full"><Save className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" onClick={onDelete} className="rounded-full"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <p className="md:col-span-6 text-xs text-muted-foreground">💡 الأسعار تُدار من تبويب <strong>مصفوفة الأسعار</strong> (لا سعر داخل الفندق).</p>
    </div>
  );
}

// ================== BOOKINGS BY BUS ==================
interface TripOpt { id: string; name: string; }
interface BusOption { id: string; name: string | null; bus_number: number; capacity: number; trip_id: string | null; }
interface BusBooking {
  id: string; booking_code: string; customer_name: string; contact_phone: string;
  passenger_count: number; seat_numbers: string[]; total_price: number; status: string;
}
function ByBusTab() {
  const [tripId, setTripId] = useState<string>("");
  const [busId, setBusId] = useState<string>("");

  const { data: trips = [] } = useQuery({
    queryKey: ["hier-trips"],
    queryFn: async () => (await supabase.from("trips").select("id,name").eq("active", true).order("display_order")).data as TripOpt[] ?? [],
  });
  const { data: buses = [] } = useQuery({
    queryKey: ["hier-buses", tripId],
    enabled: !!tripId,
    queryFn: async () => (await supabase.from("buses").select("id,name,bus_number,capacity,trip_id").eq("trip_id", tripId).order("bus_number")).data as BusOption[] ?? [],
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["hier-bookings", busId],
    enabled: !!busId,
    queryFn: async () => (await supabase.from("bookings")
      .select("id,booking_code,customer_name,contact_phone,passenger_count,seat_numbers,total_price,status")
      .eq("bus_id", busId).neq("status", "cancelled")).data as BusBooking[] ?? [],
  });

  const bus = buses.find((b) => b.id === busId);
  const occupied = bookings.reduce((s, b) => s + (b.seat_numbers?.length ?? 0), 0);
  const capacity = bus?.capacity ?? 0;
  const free = Math.max(0, capacity - occupied);
  const pct = capacity > 0 ? Math.round((occupied / capacity) * 100) : 0;

  function exportExcel() {
    if (!bus) return;
    const rows = bookings.map((b) => ({
      "رقم الحجز": b.booking_code, "الاسم": b.customer_name, "الجوال": b.contact_phone,
      "الأفراد": b.passenger_count, "المقاعد": b.seat_numbers.join(", "),
      "الإجمالي": Number(b.total_price), "الحالة": b.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Passengers");
    XLSX.writeFile(wb, `bus-${bus.name || bus.bus_number}-${new Date().toISOString().slice(0,10)}.xlsx`);
  }
  function exportPDF() {
    if (!bus) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(`Bus: ${bus.name || `#${bus.bus_number}`} — ${occupied}/${capacity} (${pct}%)`, 14, 16);
    autoTable(doc, {
      startY: 22,
      head: [["Code","Name","Phone","Pax","Seats","Total","Status"]],
      body: bookings.map((b) => [b.booking_code, b.customer_name, b.contact_phone, String(b.passenger_count), b.seat_numbers.join(", "), String(b.total_price), b.status]),
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
          <select value={tripId} onChange={(e) => { setTripId(e.target.value); setBusId(""); }} className="h-10 w-full rounded-md border px-3 text-sm">
            <option value="">— اختر رحلة —</option>
            {trips.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">2) اختر الحافلة</Label>
          <select value={busId} onChange={(e) => setBusId(e.target.value)} disabled={!tripId} className="h-10 w-full rounded-md border px-3 text-sm disabled:opacity-50">
            <option value="">{tripId ? "— اختر حافلة —" : "اختر رحلة أولاً"}</option>
            {buses.map((b) => <option key={b.id} value={b.id}>{b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}</option>)}
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
            <Button variant="outline" onClick={exportPDF} className="rounded-full"><FileText className="h-4 w-4 ml-1" /> PDF</Button>
            <Button onClick={exportExcel} className="rounded-full"><Download className="h-4 w-4 ml-1" /> Excel</Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>رقم الحجز</TableHead><TableHead>الاسم</TableHead><TableHead>الجوال</TableHead>
                <TableHead>الأفراد</TableHead><TableHead>المقاعد</TableHead><TableHead>الإجمالي</TableHead><TableHead>الحالة</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bookings.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">لا يوجد ركاب لهذه الحافلة.</TableCell></TableRow>}
                {bookings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-bold" dir="ltr">{b.booking_code}</TableCell>
                    <TableCell>{b.customer_name}</TableCell>
                    <TableCell dir="ltr">{b.contact_phone}</TableCell>
                    <TableCell>{b.passenger_count}</TableCell>
                    <TableCell className="text-xs">{b.seat_numbers.join(", ")}</TableCell>
                    <TableCell className="font-bold text-primary">{sar(Number(b.total_price))}</TableCell>
                    <TableCell><Badge>{b.status}</Badge></TableCell>
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
  whatsapp: string; telegram_url: string; facebook_url: string;
  instagram_url: string; twitter_url: string; snapchat_url: string;
  tiktok_url: string; youtube_url: string; maps_url: string;
}
function SocialTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin-social"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("id,whatsapp,telegram_url,facebook_url,instagram_url,twitter_url,snapchat_url,tiktok_url,youtube_url,maps_url").eq("id", 1).maybeSingle();
      return data as unknown as SocialRow;
    },
  });
  const [local, setLocal] = useState<SocialRow | null>(null);
  useEffect(() => { if (data) setLocal(data); }, [data]);
  if (!local) return null;

  async function save() {
    if (!local) return;
    const { id, ...rest } = local;
    const { error } = await supabase.from("app_settings").update(rest as never).eq("id", id);
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
            <Input dir="ltr" value={(local[f.key] as string) ?? ""} onChange={(e) => setLocal({ ...local, [f.key]: e.target.value })} />
          </div>
        ))}
      </div>
      <Button onClick={save} className="btn-primary-glow rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ</Button>
    </div>
  );
}




// ================== PRICING MATRIX ==================
interface PricingRow { id: string; package_id: string; room_type: string; passenger_count: number; price: number; active: boolean; }
function PricingTab() {
  const qc = useQueryClient();
  const { data: packages = [] } = useQuery({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const { data } = await supabase.from("packages" as never).select("*").order("display_order");
      return ((data as unknown as PackageRow[]) ?? []);
    },
  });
  const { data: pricing = [] } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: async () => {
      const { data } = await supabase.from("pricing_matrix" as never).select("*");
      return ((data as unknown as PricingRow[]) ?? []);
    },
  });

  async function updateCell(pkgId: string, pax: number, price: number) {
    const existing = pricing.find((p) => p.package_id === pkgId && p.passenger_count === pax);
    if (existing) {
      await supabase.from("pricing_matrix" as never).update({ price, active: true } as never).eq("id", existing.id);
    } else {
      await supabase.from("pricing_matrix" as never).insert({ package_id: pkgId, room_type: "5", passenger_count: pax, price, active: true } as never);
    }
    toast.success("تم تحديث السعر");
    qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    qc.invalidateQueries({ queryKey: ["pricing_matrix"] });
  }

  return (
    <div className="surface-card p-6">
      <h2 className="text-lg font-extrabold mb-4">مصفوفة الأسعار</h2>
      <p className="text-sm text-muted-foreground mb-4">حدّد سعر الفرد لكل فندق حسب عدد الأفراد في الغرفة.</p>
      <div className="space-y-6">
        {packages.map((p) => (
          <div key={p.id} className="border-2 border-border rounded-2xl p-4">
            <h3 className="font-bold mb-3">{p.name}</h3>
            <div className="grid grid-cols-6 gap-2 text-sm items-center">
              <div className="font-bold text-muted-foreground">عدد الأفراد →</div>
              {[1, 2, 3, 4, 5].map((n) => <div key={n} className="font-bold text-center">{n}</div>)}
              <div className="font-bold text-muted-foreground">السعر (ر.س)</div>
              {[1, 2, 3, 4, 5].map((n) => {
                const cell = pricing.find((c) => c.package_id === p.id && c.passenger_count === n);
                return (
                  <PriceInput key={n} value={cell?.price ?? 0} onSave={(v) => updateCell(p.id, n, v)} />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
function PriceInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <Input type="number" value={v} onChange={(e) => setV(Number(e.target.value))} onBlur={() => v !== value && onSave(v)} className="h-9 text-center" />;
}

// ================== WHEEL ==================
interface WheelSegRow { id: string; label: string; color: string; prize_type: string; prize_value: number; probability_weight: number; display_order: number; active: boolean; }
interface WheelCfg { enabled: boolean; spin_cooldown_days: number; coupon_expiry_hours: number; title: string; subtitle: string; }
function WheelTab() {
  const qc = useQueryClient();
  const { data: config } = useQuery({
    queryKey: ["admin-wheel-config"],
    queryFn: async () => {
      const { data } = await supabase.from("wheel_config" as never).select("*").eq("id", 1).maybeSingle();
      return data as unknown as WheelCfg;
    },
  });
  const { data: segments = [] } = useQuery({
    queryKey: ["admin-wheel-segments"],
    queryFn: async () => {
      const { data } = await supabase.from("wheel_segments" as never).select("*").order("display_order");
      return (data as unknown as WheelSegRow[]) ?? [];
    },
  });
  const [cfg, setCfg] = useState<WheelCfg | null>(null);
  useEffect(() => { if (config) setCfg(config); }, [config]);

  async function saveCfg() {
    if (!cfg) return;
    const { error } = await supabase.from("wheel_config" as never).update(cfg as never).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["wheel_config"] });
  }

  async function saveSeg(s: WheelSegRow) {
    const { error } = await supabase.from("wheel_segments" as never).update({
      label: s.label, color: s.color, prize_type: s.prize_type, prize_value: s.prize_value,
      probability_weight: s.probability_weight, display_order: s.display_order, active: s.active,
    } as never).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["wheel_segments"] });
    qc.invalidateQueries({ queryKey: ["admin-wheel-segments"] });
  }
  async function addSeg() {
    await supabase.from("wheel_segments" as never).insert({ label: "جائزة جديدة", color: "#c8102e", prize_type: "percent", prize_value: 5, probability_weight: 10, display_order: segments.length + 1 } as never);
    qc.invalidateQueries({ queryKey: ["admin-wheel-segments"] });
  }
  async function delSeg(id: string) {
    if (!confirm("حذف الشريحة؟")) return;
    await supabase.from("wheel_segments" as never).delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-wheel-segments"] });
  }

  return (
    <div className="space-y-4">
      <div className="surface-card p-6">
        <h2 className="text-lg font-extrabold mb-4">إعدادات العجلة</h2>
        {cfg && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3"><Switch checked={cfg.enabled} onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })} /><Label>تفعيل السحب</Label></div>
            <div><Label>عدد أيام التبريد</Label><Input type="number" value={cfg.spin_cooldown_days} onChange={(e) => setCfg({ ...cfg, spin_cooldown_days: Number(e.target.value) })} /></div>
            <div><Label>صلاحية الكوبون (ساعات)</Label><Input type="number" value={cfg.coupon_expiry_hours} onChange={(e) => setCfg({ ...cfg, coupon_expiry_hours: Number(e.target.value) })} /></div>
            <div><Label>العنوان</Label><Input value={cfg.title} onChange={(e) => setCfg({ ...cfg, title: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>العنوان الفرعي</Label><Input value={cfg.subtitle} onChange={(e) => setCfg({ ...cfg, subtitle: e.target.value })} /></div>
            <Button onClick={saveCfg} className="btn-primary-glow rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ</Button>
          </div>
        )}
      </div>

      <div className="surface-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold">شرائح العجلة</h2>
          <Button onClick={addSeg} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة</Button>
        </div>
        <div className="space-y-3">
          {segments.map((s) => <SegEditor key={s.id} seg={s} onSave={saveSeg} onDelete={() => delSeg(s.id)} />)}
        </div>
      </div>
    </div>
  );
}
function SegEditor({ seg, onSave, onDelete }: { seg: WheelSegRow; onSave: (s: WheelSegRow) => void; onDelete: () => void }) {
  const [s, setS] = useState(seg);
  useEffect(() => setS(seg), [seg]);
  return (
    <div className="border-2 border-border rounded-2xl p-3 grid md:grid-cols-7 gap-2 items-end">
      <div className="md:col-span-2"><Label className="text-xs">النص</Label><Input value={s.label} onChange={(e) => setS({ ...s, label: e.target.value })} /></div>
      <div><Label className="text-xs">اللون</Label><Input type="color" value={s.color} onChange={(e) => setS({ ...s, color: e.target.value })} className="h-10 p-1" /></div>
      <div><Label className="text-xs">النوع</Label>
        <select value={s.prize_type} onChange={(e) => setS({ ...s, prize_type: e.target.value })} className="h-10 w-full rounded-md border border-input px-2 text-sm">
          <option value="lose">خسارة</option><option value="percent">نسبة %</option><option value="fixed">مبلغ ثابت</option>
        </select>
      </div>
      <div><Label className="text-xs">القيمة</Label><Input type="number" value={s.prize_value} onChange={(e) => setS({ ...s, prize_value: Number(e.target.value) })} /></div>
      <div><Label className="text-xs">الاحتمالية</Label><Input type="number" value={s.probability_weight} onChange={(e) => setS({ ...s, probability_weight: Number(e.target.value) })} /></div>
      <div className="flex gap-1">
        <Button size="sm" onClick={() => onSave(s)}><Save className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

// ================== COUPONS ==================
interface CouponRow {
  id: string; code: string; phone: string | null; prize_type: string; prize_value: number;
  used: boolean; expiry_date: string; issue_date: string; used_in_booking_id: string | null;
  active: boolean; max_uses: number | null; usage_count: number; source: string; label: string | null;
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
      const { data } = await supabase.from("coupons" as never).select("*").order("issue_date", { ascending: false }).limit(500);
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
      case "active": return c.active && !c.used && !expired;
      case "disabled": return !c.active;
      case "used": return c.used;
      case "expired": return expired;
      default: return true;
    }
  });

  async function toggleActive(c: CouponRow) {
    const { error } = await supabase.from("coupons" as never).update({ active: !c.active } as never).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(c.active ? "تم تعطيل الكوبون" : "تم تفعيل الكوبون");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  }

  async function deleteCoupon(id: string) {
    if (!confirm("حذف الكوبون نهائياً؟")) return;
    const { error } = await supabase.from("coupons" as never).delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم حذف الكوبون");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
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
          <Input placeholder="بحث بالكود أو الجوال..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as FilterMode)} className="h-9 rounded-md border border-input px-2 text-sm">
            <option value="all">الكل</option>
            <option value="active">نشط</option>
            <option value="disabled">معطّل</option>
            <option value="used">مستخدم</option>
            <option value="expired">منتهي</option>
          </select>
          <Button size="sm" onClick={newCoupon} className="btn-primary-glow rounded-full"><Plus className="h-4 w-4 ml-1" /> كوبون جديد</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>الكود</TableHead>
            <TableHead>النوع</TableHead>
            <TableHead>القيمة</TableHead>
            <TableHead>الجوال</TableHead>
            <TableHead>المصدر</TableHead>
            <TableHead>الاستخدام</TableHead>
            <TableHead>الانتهاء</TableHead>
            <TableHead>الحالة</TableHead>
            <TableHead>إجراءات</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">لا توجد كوبونات.</TableCell></TableRow>}
            {filtered.map((c) => {
              const expired = new Date(c.expiry_date).getTime() < now;
              const statusLabel = !c.active ? "معطّل" : c.used ? "مستخدم" : expired ? "منتهي" : "نشط";
              const statusVariant: "default" | "secondary" | "destructive" =
                !c.active ? "secondary" : c.used ? "secondary" : expired ? "destructive" : "default";
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-bold" dir="ltr">{c.code}</TableCell>
                  <TableCell>{c.prize_type === "percent" ? "نسبة" : c.prize_type === "fixed" ? "مبلغ" : "-"}</TableCell>
                  <TableCell>{c.prize_type === "percent" ? `${c.prize_value}%` : `${c.prize_value} ر.س`}</TableCell>
                  <TableCell dir="ltr" className="text-xs">{c.phone ?? "-"}</TableCell>
                  <TableCell><Badge variant="outline">{c.source === "manual" ? "يدوي" : "سحب"}</Badge></TableCell>
                  <TableCell className="text-xs">{c.usage_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</TableCell>
                  <TableCell className="text-xs">{formatDate(c.expiry_date)}</TableCell>
                  <TableCell><Badge variant={statusVariant}>{statusLabel}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)}>تعديل</Button>
                      <Button size="sm" variant="outline" onClick={() => toggleActive(c)}>{c.active ? "تعطيل" : "تفعيل"}</Button>
                      <Button size="sm" variant="outline" onClick={() => deleteCoupon(c.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {editing && <CouponEditor initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); }} />}
    </div>
  );
}

function CouponEditor({ initial, onClose, onSaved }: { initial: Partial<CouponRow>; onClose: () => void; onSaved: () => void }) {
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
    };
    if (isNew) {
      const { error } = await supabase.from("coupons" as never).insert(payload as never);
      if (error) return toast.error(error.message);
      toast.success("تم إنشاء الكوبون");
    } else {
      const { error } = await supabase.from("coupons" as never).update(payload as never).eq("id", initial.id!);
      if (error) return toast.error(error.message);
      toast.success("تم حفظ التعديلات");
    }
    onSaved();
  }

  const expiryLocal = c.expiry_date ? new Date(c.expiry_date).toISOString().slice(0, 10) : "";

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-extrabold">{isNew ? "كوبون جديد" : "تعديل الكوبون"}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label className="text-xs">الكود</Label><Input dir="ltr" value={c.code ?? ""} onChange={(e) => setC({ ...c, code: e.target.value })} /></div>
          <div>
            <Label className="text-xs">نوع الخصم</Label>
            <select value={c.prize_type ?? "percent"} onChange={(e) => setC({ ...c, prize_type: e.target.value })} className="h-10 w-full rounded-md border border-input px-2 text-sm">
              <option value="percent">نسبة %</option>
              <option value="fixed">مبلغ ثابت</option>
            </select>
          </div>
          <div><Label className="text-xs">قيمة الخصم</Label><Input type="number" value={c.prize_value ?? 0} onChange={(e) => setC({ ...c, prize_value: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">تاريخ الانتهاء</Label><Input type="date" value={expiryLocal} onChange={(e) => setC({ ...c, expiry_date: new Date(e.target.value).toISOString() })} /></div>
          <div><Label className="text-xs">أقصى عدد استخدامات</Label><Input type="number" value={c.max_uses ?? ""} placeholder="بدون حد" onChange={(e) => setC({ ...c, max_uses: e.target.value ? Number(e.target.value) : null })} /></div>
          <div className="col-span-2"><Label className="text-xs">جوال العميل (اختياري)</Label><Input dir="ltr" value={c.phone ?? ""} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="اتركه فارغاً للكوبون العام" /></div>
          <div className="col-span-2"><Label className="text-xs">وصف (اختياري)</Label><Input value={c.label ?? ""} onChange={(e) => setC({ ...c, label: e.target.value })} /></div>
          <div className="col-span-2 flex items-center gap-2">
            <Switch checked={c.active ?? true} onCheckedChange={(v) => setC({ ...c, active: v })} />
            <span className="text-sm">مُفعّل</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} className="btn-primary-glow"><Save className="h-4 w-4 ml-1" /> حفظ</Button>
        </div>
      </div>
    </div>
  );
}

// ================== SETTINGS ==================
interface SettingsRow {
  id: number; company_name: string; email: string; national_number: string; whatsapp: string;
  phone: string; instagram_url: string; snapchat_url: string; maps_url: string; logo_url: string;
  hero_title: string; hero_subtitle: string; hero_cta: string; terms_text: string;
}
function SettingsTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
      return data as unknown as SettingsRow;
    },
  });
  const [local, setLocal] = useState<SettingsRow | null>(null);
  useEffect(() => { if (settings) setLocal(settings); }, [settings]);
  if (!local) return null;

  async function save() {
    if (!local) return;
    const { id, ...rest } = local;
    const { error } = await supabase.from("app_settings").update(rest).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الإعدادات");
    qc.invalidateQueries({ queryKey: ["app_settings"] });
  }

  return (
    <div className="surface-card p-6 space-y-4">
      <h2 className="text-lg font-extrabold">إعدادات الموقع</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div><Label>اسم المؤسسة</Label><Input value={local.company_name} onChange={(e) => setLocal({ ...local, company_name: e.target.value })} /></div>
        <div><Label>البريد</Label><Input value={local.email} onChange={(e) => setLocal({ ...local, email: e.target.value })} /></div>
        <div><Label>الرقم الموحد</Label><Input value={local.national_number} onChange={(e) => setLocal({ ...local, national_number: e.target.value })} /></div>
        <div><Label>واتساب</Label><Input dir="ltr" value={local.whatsapp} onChange={(e) => setLocal({ ...local, whatsapp: e.target.value })} /></div>
        <div><Label>الجوال</Label><Input dir="ltr" value={local.phone} onChange={(e) => setLocal({ ...local, phone: e.target.value })} /></div>
        <div><Label>الشعار (URL)</Label><Input value={local.logo_url} onChange={(e) => setLocal({ ...local, logo_url: e.target.value })} /></div>
        <div><Label>عنوان الواجهة</Label><Input value={local.hero_title} onChange={(e) => setLocal({ ...local, hero_title: e.target.value })} /></div>
        <div><Label>عنوان فرعي</Label><Input value={local.hero_subtitle} onChange={(e) => setLocal({ ...local, hero_subtitle: e.target.value })} /></div>
        <div className="md:col-span-2"><Label>الشروط والأحكام</Label><Textarea rows={4} value={local.terms_text ?? ""} onChange={(e) => setLocal({ ...local, terms_text: e.target.value })} /></div>
      </div>
      <Button onClick={save} className="btn-primary-glow rounded-full"><Save className="h-4 w-4 ml-1" /> حفظ الإعدادات</Button>
    </div>
  );
}
