// إشعار الذهاب وقائمة الركاب منفصلان؛ صورة الباص للإشعار فقط.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, AlertTriangle, FileText, Download, Loader2 } from "lucide-react";
import { loadBusTemplate, renderBusImage } from "@/lib/bus-image";
import { copyTripText, shareTripText } from "@/lib/share-trip-notice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface DepartureSloganBooking {
  customer_name: string | null;
  booking_code: string;
  passenger_count: number;
  booking_source?: string | null;
  departure_date?: string | null;
  trips?: { departure_date?: string | null } | null;
}

export interface DepartureSloganBus {
  name: string | null;
  bus_number: number;
  plate?: string | null;
  supervisor_name?: string | null;
}

const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function arabicDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return AR_DAYS[d.getUTCDay()] ?? "";
}

/** التاريخ بصيغة 2026/9/7 كما في النموذج. */
function slashDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
}

export function DepartureSloganDialog({ bookings, tripName, bus, disabled, disabledReason }: {
  bookings: DepartureSloganBooking[];
  tripName?: string | null;
  bus?: DepartureSloganBus | null;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);

  const { noticeText, passengerText, missing } = useMemo(() => {
    const gaps: string[] = [];

    // تاريخ الرحلة: الفعلي من الحجز ثم تاريخ الرحلة المسجّل
    const dateIso =
      bookings.find((b) => b.departure_date)?.departure_date ??
      bookings.find((b) => b.trips?.departure_date)?.trips?.departure_date ??
      null;

    if (!bus?.name) gaps.push("اسم الباص غير مسجّل");
    if (!bus?.bus_number) gaps.push("رقم الباص غير مسجّل");
    if (!bus?.plate) gaps.push("رقم لوحة الباص غير مسجّل");
    if (!bus?.supervisor_name) gaps.push("اسم المشرف غير مسجّل");
    if (!dateIso) gaps.push("تاريخ المغادرة غير معروف — حدّد رحلة لها تاريخ مغادرة");
    if (bookings.length === 0) gaps.push("لا يوجد ركاب في التحديد الحالي");

    const lines = bookings.map((r, i) => {
      const name = (r.customer_name || r.booking_code || "").trim();
      const source = (r.booking_source || "").trim();
      if (!name) gaps.push("حجز بدون اسم صاحب الحجز");
      return `${i + 1}- ${[name, `/${r.passenger_count || 1}`, source ? `/${source}` : ""].filter(Boolean).join(" ")}`;
    });

    const noticeText = [
      "▪️*إشعار رحله الذهاب*",
      "",
      `* اليوم : ${dateIso ? arabicDay(dateIso) : "—"}`,
      `* التاريخ : ${dateIso ? slashDate(dateIso) : "—"}.`,
      tripName?.trim() ? `* الرحلة : ${tripName.trim()}` : null,
      `* الباص : ${bus?.name || "—"}`,
      `* رقم الباص : ${bus?.bus_number ? bus.bus_number : "—"}`,
      `* رقم لوحة الباص : ${bus?.plate || "—"}`,
      "",
      `* اسم المشرف : ${bus?.supervisor_name || "—"}`,
      "",
      "*💢 🚨 تنبيـ هام ــات*",
      "_________",
      "* المعتمر يأتي مرتدياً إحرامه",
      "* التواجد بمسجد قباء قبل الأذآن",
      "* الرجاء الالتزام بمخطط الباص والمقاعد",
      "* الإعتذار قبل الرحلة بـ 8 ساعات",
      "",
      "*مسجد قباء - الساحة الجنوبية*",
      "",
      "*📍موقع مواقف الباصات*https://maps.app.goo.gl/6bXfTdJRgwQbXTbH8?g_st=iwb",
    ].filter((l): l is string => l !== null).join("\n");

    const passengerText = [`أسماء ركاب الحافلة رقم (${bus?.bus_number || "—"})`, ...lines].join("\n");
    return { noticeText, passengerText, missing: Array.from(new Set(gaps)) };
  }, [bookings, tripName, bus]);

  // صورة الباص: تُولَّد من جديد لكل فتح/تغيير باص، ولا يُعاد استخدام صورة باص سابق.
  const [img, setImg] = useState<{ key: string; url: string; blob: Blob } | null>(null);
  const [imgNote, setImgNote] = useState<string>("");
  const busKey = `${bus?.bus_number ?? ""}|${bus?.plate ?? ""}`;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made = "";
    setImg(null);
    setImgNote("");
    (async () => {
      try {
        const t = await loadBusTemplate();
        if (!t) { if (alive) setImgNote("لم يتم إعداد قالب صورة الباص بعد."); return; }
        if (!bus?.bus_number && !bus?.plate) { if (alive) setImgNote("لا توجد بيانات رقم باص أو لوحة لإنشاء صورة الباص."); return; }
        const blob = await renderBusImage(t, { bus_number: bus?.bus_number, plate: bus?.plate });
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setImg({ key: busKey, url: made, blob });
      } catch (e) {
        if (alive) setImgNote((e as Error).message || "تعذّر إنشاء صورة الباص");
      }
    })();
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [open, busKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const busImg = img && img.key === busKey ? img : null;
  const fileName = `bus-${bus?.bus_number || "x"}.jpg`;

  function downloadImg() {
    if (!busImg) return;
    const a = document.createElement("a");
    a.href = busImg.url;
    a.download = fileName;
    a.click();
  }

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

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={disabled}
        title={disabled ? disabledReason : ""}
        onClick={() => setOpen(true)}
      >
        <FileText className="h-4 w-4 ml-1" /> تصدير شعار الرحلة
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>تصدير شعار رحلة الذهاب</DialogTitle></DialogHeader>

          <div className="space-y-3">
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
              {noticeText}
            </pre>

            <div className="grid grid-cols-2 gap-2">
              <Button className="min-w-0 font-bold" disabled={!busImg && !imgNote} onClick={() => copy("notice")}><Copy className="h-4 w-4 ml-1 shrink-0" /> نسخ الإشعار</Button>
              <Button variant="outline" className="min-w-0 font-bold" disabled={!busImg && !imgNote} onClick={() => share("notice")}><Share2 className="h-4 w-4 ml-1 shrink-0" /> مشاركة الإشعار</Button>
            </div>
            <Button variant="outline" className="w-full" disabled={!busImg} onClick={downloadImg}><Download className="h-4 w-4 ml-1" /> تحميل صورة الباص</Button>

            <div className="border-t pt-3 text-sm font-bold">أسماء الركاب</div>
            <pre className="max-h-72 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-wrap font-sans leading-6">{passengerText}</pre>
            <div className="grid grid-cols-2 gap-2">
              <Button className="min-w-0 font-bold" onClick={() => copy("passengers")}><Copy className="h-4 w-4 ml-1 shrink-0" /> نسخ الأسماء</Button>
              <Button variant="outline" className="min-w-0 font-bold" onClick={() => share("passengers")}><Share2 className="h-4 w-4 ml-1 shrink-0" /> مشاركة الأسماء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
