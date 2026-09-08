// «تصدير شعار الرحلة» — يبني نص شعار العودة من بيانات قاعدة البيانات الفعلية
// (رحلة العودة، الحافلة المختارة، حجوزات هذه الحافلة فقط) مع نسخ ومشاركة نصية.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Share2, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SloganBus { id: string; name: string | null; bus_number: number; plate?: string | null }

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** اليوم بالعربية من تاريخ ISO. */
function arabicDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return AR_DAYS[d.getUTCDay()] ?? "";
}

/** التاريخ بصيغة 2026/9/7 كما طلب المستخدم. */
function slashDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
}

interface SloganBooking {
  id: string;
  customer_name: string | null;
  booking_code: string;
  passenger_count: number;
  booking_source: string | null;
  rep_name: string | null;
  hotel_id: string | null;
  trip_id: string | null;
}

export function ReturnSloganDialog({ date, tripName, buses }: {
  date: string;
  tripName?: string | null;
  buses: SloganBus[];
}) {
  const [open, setOpen] = useState(false);
  const [busId, setBusId] = useState<string>(buses[0]?.id ?? "");
  const selected = buses.find((b) => b.id === (busId || buses[0]?.id));

  // بيانات كاملة للحافلة المختارة (اللوحة غير محمّلة في القوائم العامة)
  const busDetail = useQuery({
    queryKey: ["slogan-bus", selected?.id],
    enabled: open && !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("buses").select("id,name,bus_number,plate").eq("id", selected!.id).maybeSingle();
      if (error) throw error;
      return data as SloganBus | null;
    },
  });

  const bookings = useQuery({
    queryKey: ["slogan-bookings", date, selected?.id],
    enabled: open && !!selected?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id,customer_name,booking_code,passenger_count,booking_source,rep_name,hotel_id,trip_id")
        .eq("actual_return_date", date)
        .eq("return_bus_id", selected!.id)
        .is("deleted_at", null)
        .neq("status", "cancelled")
        .eq("no_show", false)
        .order("created_at");
      if (error) throw error;
      return (data as unknown as SloganBooking[]) ?? [];
    },
  });

  const hotelIds = useMemo(
    () => Array.from(new Set((bookings.data ?? []).map((b) => b.hotel_id).filter(Boolean) as string[])),
    [bookings.data],
  );

  const hotels = useQuery({
    queryKey: ["slogan-hotels", hotelIds.join(",")],
    enabled: open && hotelIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("hotels").select("id,name,is_no_hotel").in("id", hotelIds);
      if (error) throw error;
      return (data as { id: string; name: string; is_no_hotel: boolean }[]) ?? [];
    },
  });

  // رحلات الذهاب التي جاء منها هؤلاء العملاء
  const tripIds = useMemo(
    () => Array.from(new Set((bookings.data ?? []).map((b) => b.trip_id).filter(Boolean) as string[])),
    [bookings.data],
  );

  const trips = useQuery({
    queryKey: ["slogan-trips", tripIds.join(",")],
    enabled: open && tripIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("id,name").in("id", tripIds);
      if (error) throw error;
      return (data as { id: string; name: string }[]) ?? [];
    },
  });

  const { text, missing } = useMemo(() => {
    const bus = busDetail.data ?? selected;
    const rows = bookings.data ?? [];
    const gaps: string[] = [];

    // الفنادق: نتجاهل من لا فندق له، ونعرض أسماء الفنادق الفعلية فقط
    const hotelNames = hotelIds
      .map((id) => (hotels.data ?? []).find((h) => h.id === id))
      .filter((h): h is { id: string; name: string; is_no_hotel: boolean } => !!h && !h.is_no_hotel)
      .map((h) => h.name);

    const tripNames = tripIds
      .map((id) => (trips.data ?? []).find((t) => t.id === id)?.name)
      .filter((n): n is string => !!n);
    if (!bus?.name) gaps.push("اسم الباص غير مسجّل");
    if (!bus?.bus_number) gaps.push("رقم الباص غير مسجّل");
    if (!bus?.plate) gaps.push("رقم اللوحة غير مسجّل لهذه الحافلة");
    if (rows.length === 0) gaps.push("لا توجد عودات مسندة لهذه الحافلة");

    const lines = rows.map((r) => {
      const name = (r.customer_name || r.booking_code || "").trim();
      const source = (r.booking_source || r.rep_name || "").trim();
      if (!name) gaps.push("حجز بدون اسم صاحب الحجز");
      if (!source) gaps.push("حجز بدون مصدر رحلة");
      return [name, `/${r.passenger_count || 1}`, source ? `/${source}` : ""].filter(Boolean).join(" ");
    });

    const body = [
      "▪️بيانات العـوده",
      "",
      `العودات من فندق: ${hotelNames.length ? hotelNames.join(" - ") : "—"}`,
      "",
      `عودات من رحلة: ${tripName?.trim() || arabicDay(date)}`,
      "",
      `* اليوم : ${arabicDay(date)}`,
      "",
      `* التاريخ : ${slashDate(date)}`,
      "",
      `* الباص : ${bus?.name || "—"}`,
      "",
      `* رقم الباص : ${bus?.bus_number ? bus.bus_number : "—"}`,
      "",
      `* رقم اللوحة : ${bus?.plate || "—"}`,
      "",
      "💢 🚨 تنبيـ هام ــات",
      "________",
      "",
      "* تسليم مفتاح غرفتك للمشرف",
      "",
      "* الرجاء الالتزام بتعليمات المشرف لا سيما التي تتعلق بتنظيم المقاعد",
      "",
      "* التواجد في الإستقبال الساعة 1ظهراً",
      "",
      "* التجمع في الباص  1:30م للتحرك",
      "",
      ...lines,
    ].join("\n");

    return { text: body, missing: Array.from(new Set(gaps)) };
  }, [busDetail.data, selected, bookings.data, hotels.data, hotelIds, date, tripName]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("تم نسخ شعار الرحلة بنجاح");
    } catch {
      toast.error("تعذّر النسخ من هذا المتصفح");
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch { /* المستخدم ألغى المشاركة */ }
      return;
    }
    await copy();
    toast.message("المشاركة المباشرة غير مدعومة على هذا الجهاز، تم نسخ الشعار ويمكنك لصقه في التطبيق المطلوب.");
  }

  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4 ml-1" /> تصدير شعار الرحلة
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تصدير شعار الرحلة</DialogTitle></DialogHeader>

          {buses.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد حافلات مرتبطة برحلة العودة في هذا التاريخ.</p>
          ) : (
            <div className="space-y-3">
              {buses.length > 1 ? (
                <div>
                  <Label className="text-xs">الحافلة</Label>
                  <Select value={busId || buses[0].id} onValueChange={setBusId}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {buses.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          حافلة {b.bus_number || "—"}{b.name ? ` - ${b.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="text-sm font-bold">
                  الحافلة: حافلة {buses[0].bus_number || "—"}{buses[0].name ? ` - ${buses[0].name}` : ""}
                </div>
              )}

              {missing.length > 0 && (
                <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> بيانات ناقصة</div>
                  {missing.map((m) => <div key={m}>• {m}</div>)}
                </div>
              )}

              <pre className="max-h-72 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-wrap font-sans leading-6">
                {bookings.isLoading ? "جارٍ التحميل…" : text}
              </pre>

              <div className="flex gap-2">
                <Button className="flex-1 rounded-xl font-bold" onClick={copy}><Copy className="h-4 w-4 ml-1" /> 📋 نسخ الشعار</Button>
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={share}><Share2 className="h-4 w-4 ml-1" /> 📤 مشاركة</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
