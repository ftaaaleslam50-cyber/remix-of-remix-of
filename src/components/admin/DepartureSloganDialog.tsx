// «تصدير شعار رحلة الذهاب» — يبني نص إشعار الذهاب من بيانات الرحلة/الحافلة/الحجوزات
// المفلترة حاليًا في تبويب الذهاب، مع نسخ ومشاركة نصية.
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Share2, AlertTriangle, FileText } from "lucide-react";
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

  const { text, missing } = useMemo(() => {
    const gaps: string[] = [];

    // تاريخ الرحلة: الفعلي من الحجز ثم تاريخ الرحلة المسجّل
    const dateIso =
      bookings.find((b) => b.departure_date)?.departure_date ??
      bookings.find((b) => b.trips?.departure_date)?.trips?.departure_date ??
      null;

    if (!bus?.name) gaps.push("اسم الباص غير مسجّل");
    if (!bus?.bus_number) gaps.push("رقم الباص غير مسجّل");
    if (!bus?.plate) gaps.push("رقم لوحة الباص غير مسجّل");
    if (!dateIso) gaps.push("تاريخ المغادرة غير معروف — حدّد رحلة لها تاريخ مغادرة");
    if (bookings.length === 0) gaps.push("لا يوجد ركاب في التحديد الحالي");

    const lines = bookings.map((r, i) => {
      const name = (r.customer_name || r.booking_code || "").trim();
      const source = (r.booking_source || "").trim();
      if (!name) gaps.push("حجز بدون اسم صاحب الحجز");
      return `${i + 1}- ${[name, `/${r.passenger_count || 1}`, source ? `/${source}` : ""].filter(Boolean).join(" ")}`;
    });

    const body = [
      "▪️*إشعار رحله الذهاب*",
      "",
      "",
      `* اليوم : ${dateIso ? `عشاء ${arabicDay(dateIso)}` : "—"}`,
      "",
      `* التاريخ : ${dateIso ? slashDate(dateIso) : "—"}.`,
      "",
      tripName?.trim() ? `* الرحلة : ${tripName.trim()}` : null,
      "",
      `* الباص : ${bus?.name || "—"}`,
      "",
      `* رقم الباص : ${bus?.bus_number ? bus.bus_number : "—"}`,
      "",
      `* رقم لوحة الباص : ${bus?.plate || "—"}`,
      "",
      "",
      "*💢 🚨 تنبيـ هام ــات*",
      "",
      "_________",
      "",
      "* المعتمر يأتي مرتدياً إحرامه",
      "",
      "* التواجد بمسجد قباء قبل الأذآن",
      "",
      "* الرجاء الالتزام بمخطط الباص والمقاعد",
      "",
      "* الإعتذار قبل الرحلة بـ 8 ساعات",
      "",
      "",
      "*مسجد قباء - الساحة الجنوبية*",
      "*📍موقع مواقف الباصات*",
      "",
      "https://maps.app.goo.gl/6bXfTdJRgwQbXTbH8?g_st=iwb",
      "",
      "",
      "الركاب:",
      "",
      ...lines,
    ].filter((l): l is string => l !== null).join("\n");

    return { text: body, missing: Array.from(new Set(gaps)) };
  }, [bookings, tripName, bus]);

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
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader><DialogTitle>تصدير شعار رحلة الذهاب</DialogTitle></DialogHeader>

          <div className="space-y-3">
            {missing.length > 0 && (
              <div className="rounded-xl border border-warning/50 bg-warning/10 p-3 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> بيانات ناقصة</div>
                {missing.map((m) => <div key={m}>• {m}</div>)}
              </div>
            )}

            <pre className="max-h-96 overflow-auto rounded-xl border bg-muted/40 p-3 text-xs whitespace-pre-wrap font-sans leading-6">
              {text}
            </pre>

            <div className="flex gap-2">
              <Button className="flex-1 rounded-xl font-bold" onClick={copy}><Copy className="h-4 w-4 ml-1" /> 📋 نسخ الشعار</Button>
              <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={share}><Share2 className="h-4 w-4 ml-1" /> 📤 مشاركة</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
