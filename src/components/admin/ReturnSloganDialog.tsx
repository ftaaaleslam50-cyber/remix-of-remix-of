// إشعار العودة وقائمة ركاب الحافلة منفصلان؛ صورة الباص للإشعار فقط.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Share2, AlertTriangle, FileText, Download, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadBusTemplate, renderBusImage } from "@/lib/bus-image";
import { copyTripText, shareTripText } from "@/lib/share-trip-notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface SloganBus { id: string; name: string | null; bus_number: number; plate?: string | null; supervisor_name?: string | null }

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
  package_id: string | null;
  no_hotel: boolean | null;
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
      const { data, error } = await supabase.from("buses").select("id,name,bus_number,plate,supervisor_name").eq("id", selected!.id).maybeSingle();
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
        .select("id,customer_name,booking_code,passenger_count,booking_source,rep_name,hotel_id,package_id,no_hotel,trip_id")
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

  // الفنادق مسجّلة كباقات في جدول packages وتُربط عبر package_id (مع hotel_id احتياطاً)
  const hotelIds = useMemo(
    () => Array.from(new Set((bookings.data ?? []).map((b) => b.hotel_id).filter(Boolean) as string[])),
    [bookings.data],
  );
  const packageIds = useMemo(
    () => Array.from(new Set((bookings.data ?? []).map((b) => b.package_id).filter(Boolean) as string[])),
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

  const packagesQ = useQuery({
    queryKey: ["slogan-packages", packageIds.join(",")],
    enabled: open && packageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("id,name").in("id", packageIds);
      if (error) throw error;
      return (data as { id: string; name: string }[]) ?? [];
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
      const { data, error } = await supabase.from("trips").select("id,name,display_order").in("id", tripIds);
      if (error) throw error;
      return (data as { id: string; name: string; display_order: number }[]) ?? [];
    },
  });

  const bus = busDetail.data ?? selected;
  const imageKey = `${selected?.id ?? ""}|${bus?.bus_number ?? ""}|${bus?.plate ?? ""}`;
  const [img, setImg] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [imgNote, setImgNote] = useState("");
  useEffect(() => {
    if (!open || !selected?.id || busDetail.isLoading) return;
    let alive = true;
    let made = "";
    setImg(null);
    setImgNote("");
    (async () => {
      try {
        const template = await loadBusTemplate();
        if (!template) { if (alive) setImgNote("لم يتم إعداد قالب صورة الباص بعد."); return; }
        if (!bus?.bus_number && !bus?.plate) { if (alive) setImgNote("لا توجد بيانات لإنشاء صورة الباص."); return; }
        const blob = await renderBusImage(template, { bus_number: bus?.bus_number, plate: bus?.plate });
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setImg({ key: imageKey, url: made, blob });
      } catch (error) {
        if (alive) setImgNote(error instanceof Error ? error.message : "تعذّر إنشاء صورة الباص");
      }
    })();
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [open, imageKey, busDetail.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
  const busImg = img?.key === imageKey ? img : null;
  const fileName = `bus-${bus?.bus_number || "x"}.jpg`;

  const { noticeText, passengerText, missing } = useMemo(() => {
    const rows = bookings.data ?? [];
    const gaps: string[] = [];

    // الفنادق: نتجاهل من لا فندق له، ونعرض أسماء الفنادق الفعلية فقط
    const hotelOf = (r: SloganBooking): string | undefined => {
      if (r.no_hotel) return undefined;
      if (r.package_id) return (packagesQ.data ?? []).find((p) => p.id === r.package_id)?.name;
      if (r.hotel_id) {
        const h = (hotels.data ?? []).find((x) => x.id === r.hotel_id);
        return h && !h.is_no_hotel ? h.name : undefined;
      }
      return undefined;
    };
    const hotelNames = Array.from(
      new Set(rows.map(hotelOf).filter((n): n is string => !!n)),
    );

    const tripNames = tripIds
      .map((id) => (trips.data ?? []).find((t) => t.id === id)?.name)
      .filter((n): n is string => !!n);
    if (!bus?.name) gaps.push("اسم الباص غير مسجّل");
    if (!bus?.bus_number) gaps.push("رقم الباص غير مسجّل");
    if (!bus?.plate) gaps.push("رقم اللوحة غير مسجّل لهذه الحافلة");
    if (!bus?.supervisor_name) gaps.push("اسم المشرف غير مسجّل لهذه الحافلة");
    if (rows.length === 0) gaps.push("لا توجد عودات مسندة لهذه الحافلة");

    // لوحة أسماء الركاب: سطر لكل راكب بصيغة (الاسم \ العدد \ المصدر \ الفندق)،
    // مجمّعة تحت عنوان رحلة الذهاب التي جاء منها الركاب.
    const tripById = new Map((trips.data ?? []).map((t) => [t.id, t]));
    const groups = new Map<string, { label: string; order: number; lines: string[] }>();
    for (const r of rows) {
      const name = (r.customer_name || r.booking_code || "").trim();
      const source = (r.booking_source || r.rep_name || "").trim();
      const hotel = hotelOf(r);
      if (!name) gaps.push("حجز بدون اسم صاحب الحجز");
      if (!source) gaps.push("حجز بدون مصدر رحلة");
      const line = [name, `${r.passenger_count || 1}`, source, hotel].filter((p) => p !== "" && p !== undefined).join(" \\ ");
      const trip = r.trip_id ? tripById.get(r.trip_id) : undefined;
      const key = trip?.id ?? "none";
      if (!groups.has(key)) {
        groups.set(key, {
          label: trip?.name || tripName?.trim() || "",
          order: trip?.display_order ?? Number.MAX_SAFE_INTEGER,
          lines: [],
        });
      }
      groups.get(key)!.lines.push(line);
    }
    const orderedGroups = Array.from(groups.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ar"));
    const passengerBlocks = orderedGroups.map((g) => [`من رحلة ${g.label || "غير محددة"}`, ...g.lines].join("\n"));

    const noticeText = [
      "▪️بيانات العـوده",
      "",
      `العودات من فندق: ${hotelNames.length ? hotelNames.join("، ") : "—"}`,
      "",
      `عودات من رحلة: ${tripNames.length ? tripNames.join("، ") : tripName?.trim() || arabicDay(date)}`,
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
      `* اسم المشرف : ${bus?.supervisor_name || "—"}`,
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
    ].join("\n");

    const passengerText = [`أسماء ركاب الحافلة رقم (${bus?.bus_number || "—"})`, "", ...passengerBlocks].join("\n\n");
    return { noticeText, passengerText, missing: Array.from(new Set(gaps)) };
  }, [bus, bookings.data, hotels.data, hotelIds, trips.data, tripIds, date, tripName]);

  async function copy(kind: "notice" | "passengers") {
    try {
      const result = await copyTripText(kind === "notice" ? noticeText : passengerText, kind === "notice" ? busImg?.blob : null);
      toast.success(kind === "passengers" ? "تم نسخ أسماء الركاب" : result === "text-and-image" ? "تم نسخ الإشعار وصورة الباص" : "تم نسخ الإشعار نصيًا؛ حمّل صورة الباص بشكل منفصل");
    } catch {
      toast.error("تعذّر النسخ من هذا المتصفح");
    }
  }

  async function share(kind: "notice" | "passengers") {
    try {
      const result = await shareTripText(kind === "notice" ? noticeText : passengerText, kind === "notice" ? busImg?.blob : null, fileName);
      if (result === "copied") toast.message(kind === "notice" ? "المشاركة غير مدعومة؛ نُسخ الإشعار، ويمكن تحميل الصورة منفصلة" : "المشاركة غير مدعومة؛ نُسخت أسماء الركاب");
      if (result === "shared-text") toast.message("هذا الجهاز لا يدعم مشاركة الصورة؛ تمت مشاركة نص الإشعار فقط");
    } catch {
      toast.error("تعذّرت المشاركة");
    }
  }

  function downloadImg() {
    if (!busImg) return;
    const anchor = document.createElement("a");
    anchor.href = busImg.url;
    anchor.download = fileName;
    anchor.click();
  }

  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4 ml-1" /> تصدير شعار الرحلة
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" dir="rtl">
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

              {busImg ? (
                <img src={busImg.url} alt={`صورة الباص رقم ${bus?.bus_number ?? ""}`} className="w-full max-h-72 object-contain rounded-xl border bg-muted/40" />
              ) : imgNote ? (
                <div className="rounded-xl border border-warning/50 bg-warning/10 p-2 text-xs">{imgNote}</div>
              ) : (
                <div className="rounded-xl border p-4 text-center text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline ml-1" /> جارِ إنشاء صورة الباص…</div>
              )}
              <div className="text-sm font-bold">إشعار الرحلة</div>
              <pre className="max-h-72 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-wrap font-sans leading-6">
                {bookings.isLoading ? "جارٍ التحميل…" : noticeText}
              </pre>

              <div className="grid grid-cols-2 gap-2">
                <Button className="min-w-0 font-bold" disabled={bookings.isLoading || (!busImg && !imgNote)} onClick={() => copy("notice")}><Copy className="h-4 w-4 ml-1 shrink-0" /> نسخ الإشعار</Button>
                <Button variant="outline" className="min-w-0 font-bold" disabled={bookings.isLoading || (!busImg && !imgNote)} onClick={() => share("notice")}><Share2 className="h-4 w-4 ml-1 shrink-0" /> مشاركة الإشعار</Button>
              </div>
              <Button variant="outline" className="w-full" disabled={!busImg} onClick={downloadImg}><Download className="h-4 w-4 ml-1" /> تحميل صورة الباص</Button>

              <div className="border-t pt-3 text-sm font-bold">أسماء الركاب</div>
              <pre className="max-h-72 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-wrap font-sans leading-6">{bookings.isLoading ? "جارٍ التحميل…" : passengerText}</pre>
              <div className="grid grid-cols-2 gap-2">
                <Button className="min-w-0 font-bold" disabled={bookings.isLoading} onClick={() => copy("passengers")}><Copy className="h-4 w-4 ml-1 shrink-0" /> نسخ الأسماء</Button>
                <Button variant="outline" className="min-w-0 font-bold" disabled={bookings.isLoading} onClick={() => share("passengers")}><Share2 className="h-4 w-4 ml-1 shrink-0" /> مشاركة الأسماء</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
