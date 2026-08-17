import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Printer, MessageCircle, Copy, Check, Loader2, FileImage, Home, Pencil } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { BRAND, whatsappLink } from "@/lib/brand";
import { sar, formatDate } from "@/lib/format";
import { returnDisplay } from "@/lib/return-display";
import { ROOM_LABEL } from "@/lib/booking/pricing";
import type { RoomType } from "@/lib/booking/types";
import type { LayoutCell, LayoutJson } from "@/components/booking/LayoutSeatMap";

export const Route = createFileRoute("/ticket/$code")({
  head: () => ({
    meta: [{ title: `تذكرة حجز | ${BRAND.name}` }, { name: "robots", content: "noindex" }],
  }),
  component: TicketPage,
});

interface Booking {
  booking_code: string;
  booking_type: "individual" | "family";
  passenger_count: number;
  room_type: string;
  customer_name: string;
  id_number: string;
  contact_phone: string;
  whatsapp_phone: string;
  seat_numbers: string[];
  price_per_person: number;
  total_price: number;
  discount_amount?: number;
  coupon_code?: string | null;
  id_image_url?: string | null;
  created_at: string;
  notes?: string | null;
  actual_return_day?: string | null;
  extension_nights?: number | null;
  packages?: { name: string } | null;
  hotels?: { name: string } | null;
  trips?: { name: string; departure_day: string; return_day: string } | null;
  buses?: { bus_number: number; name?: string | null; plate?: string | null; layout_id?: string | null } | null;
}

function TicketPage() {
  const { code } = useParams({ from: "/ticket/$code" });
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [qr, setQr] = useState<string>("");
  const [idImageUrl, setIdImageUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<LayoutJson | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "booking_code,booking_type,passenger_count,room_type,customer_name,id_number,contact_phone,whatsapp_phone,seat_numbers,price_per_person,total_price,discount_amount,coupon_code,id_image_url,created_at,notes,actual_return_day,extension_nights,packages(name),hotels(name),trips(name,departure_day,return_day),buses(bus_number,name,plate,layout_id)",
        )
        .eq("booking_code", code)
        .maybeSingle();
      if (error || !data) {
        const cached = typeof window !== "undefined" ? localStorage.getItem(`booking:${code}`) : null;
        if (cached) setBooking(JSON.parse(cached));
      } else {
        setBooking(data as unknown as Booking);
      }
      setLoading(false);
    })();
  }, [code]);

  useEffect(() => {
    QRCode.toDataURL(`ZT-TICKET:${code}`, { margin: 1, width: 240 })
      .then(setQr)
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    (async () => {
      if (!booking?.id_image_url) return;
      const { data } = await supabase.storage
        .from("id-uploads")
        .createSignedUrl(booking.id_image_url, 60 * 60 * 24 * 7);
      if (data?.signedUrl) setIdImageUrl(data.signedUrl);
    })();
  }, [booking?.id_image_url]);

  // Bus seat layout for the ticket's second (printable) page.
  useEffect(() => {
    (async () => {
      const layoutId = booking?.buses?.layout_id;
      if (!layoutId) {
        if (booking?.buses) setLayout(defaultTicketLayout());
        return;
      }
      const { data } = await supabase
        .from("bus_layouts")
        .select("layout_json")
        .eq("id", layoutId)
        .maybeSingle();
      const lj = (data as { layout_json: LayoutJson } | null)?.layout_json;
      setLayout(lj ?? defaultTicketLayout());
    })();
  }, [booking?.buses?.layout_id, booking?.buses]);


  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-extrabold">تعذر العثور على الحجز</h1>
          <p className="text-muted-foreground mt-2">رقم الحجز: {code}</p>
        </div>
      </div>
    );
  }

  function shareWhatsApp() {
    const busLine = `رقم الباص: ${booking!.buses?.bus_number ?? 1}${booking!.buses?.name ? ` (${booking!.buses.name})` : ""}${booking!.buses?.plate ? ` — لوحة ${booking!.buses.plate}` : ""}`;
    const text = `تم تأكيد حجز رحلة العمرة 🌹\nرقم الحجز: ${booking!.booking_code}\nالرحلة: ${booking!.trips?.name ?? "-"}\n${busLine}\nالمقاعد: ${booking!.seat_numbers.join(", ")}\nالإجمالي: ${sar(Number(booking!.total_price))}\nيرجى الاحتفاظ بالتذكرة عند الصعود للباص.`;
    window.open(whatsappLink(text), "_blank");
  }

  function copyDetails() {
    const text = `حجز ${booking!.booking_code} | ${booking!.customer_name} | ${booking!.trips?.name} | مقاعد ${booking!.seat_numbers.join(", ")} | ${sar(Number(booking!.total_price))}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("تم نسخ بيانات الحجز");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-muted py-10 print:bg-white print:py-0">
      <div className="no-print container-luxe mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">تذكرة حجز رحلة العمرة</h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => window.print()} className="btn-primary-glow rounded-full">
            <Printer className="h-4 w-4 ml-2" /> تحميل التذكرة PDF
          </Button>

          <Button
            onClick={shareWhatsApp}
            variant="outline"
            className="rounded-full bg-[#25D366] text-white border-0 hover:bg-[#25D366]/90 hover:text-white"
          >
            <MessageCircle className="h-4 w-4 ml-2" /> مشاركة عبر واتساب
          </Button>
          <Button onClick={copyDetails} variant="outline" className="rounded-full">
            {copied ? <Check className="h-4 w-4 ml-2" /> : <Copy className="h-4 w-4 ml-2" />} نسخ البيانات
          </Button>
          <Button
            onClick={() => {
              try {
                localStorage.setItem("edit_booking_code", booking!.booking_code);
              } catch {
                /* ignore */
              }
              navigate({ to: "/booking" });
            }}
            variant="outline"
            className="rounded-full"
          >
            <Pencil className="h-4 w-4 ml-2" /> تعديل الحجز
          </Button>
          <Button onClick={() => navigate({ to: "/" })} variant="outline" className="rounded-full">
            <Home className="h-4 w-4 ml-2" /> العودة للرئيسية
          </Button>
        </div>
      </div>

      <div ref={printRef} className="container-luxe max-w-3xl">
        <div className="print-page bg-white rounded-[28px] overflow-hidden shadow-[var(--shadow-elegant)] print:rounded-none print:shadow-none">
          <div className="px-8 py-6 text-white flex items-center gap-4" style={{ background: "var(--gradient-navy)" }}>
            <img src={BRAND.logoUrl} alt="logo" className="h-16 w-16 rounded-full bg-white p-1" />
            <div className="flex-1">
              <h2 className="text-xl font-extrabold">{BRAND.name}</h2>
              <p className="text-xs text-white/70">الرقم الموحد: {BRAND.nationalNumber}</p>
            </div>
            <div className="rounded-full bg-[color:var(--color-gold)]/90 text-[color:var(--color-navy)] text-xs font-extrabold px-3 py-1.5">
              مؤكَّد
            </div>
          </div>

          <div className="px-8 py-6 border-b border-dashed border-border flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">رقم الحجز</p>
              <p className="text-3xl font-extrabold tracking-wide text-primary" dir="ltr">
                {booking.booking_code}
              </p>
            </div>
            {qr && <img src={qr} alt="QR" className="h-24 w-24" />}
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-4 px-8 py-6 text-sm">
            <TicketRow label="الاسم" value={booking.customer_name} />
            <TicketRow label="رقم الهوية" value={booking.id_number} />
            <TicketRow label="جوال التواصل" value={booking.contact_phone} ltr />
            <TicketRow label="جوال الواتساب" value={booking.whatsapp_phone} ltr />
            <TicketRow label="الرحلة" value={booking.trips?.name ?? "-"} />
            <TicketRow label="الفندق" value={booking.packages?.name ?? booking.hotels?.name ?? "-"} />
            {Number(booking.extension_nights ?? 0) > 0 && (
              <TicketRow label="عدد ليال التمديد" value={String(booking.extension_nights)} />
            )}
            <TicketRow label="نوع الحجز" value={booking.booking_type === "individual" ? "أفراد" : "عوائل"} />
            <TicketRow label="نوع الغرفة" value={ROOM_LABEL[booking.room_type as RoomType]} />
            <TicketRow label="عدد الأفراد" value={String(booking.passenger_count)} />
            <TicketRow label="رقم الباص" value={String(booking.buses?.bus_number ?? 1)} />
            {booking.buses?.name && <TicketRow label="اسم الباص" value={booking.buses.name} />}
            {booking.buses?.plate && <TicketRow label="لوحة الباص" value={booking.buses.plate} ltr />}
            <TicketRow label="المقاعد" value={booking.seat_numbers.join(", ")} />
            {booking.trips?.departure_day && <TicketRow label="الذهاب" value={booking.trips.departure_day} />}
            {booking.trips?.return_day && (
              <TicketRow label="العودة" value={returnDisplay(booking.trips.return_day, booking.extension_nights)} />
            )}
            {Number(booking.extension_nights ?? 0) === 0 && booking.actual_return_day && (
              <TicketRow label="العودة الفعلية" value={booking.actual_return_day} />
            )}
            <TicketRow label="تاريخ الحجز" value={formatDate(booking.created_at)} />
          </div>

          {booking.notes && (
            <div className="px-8 py-4 border-t border-dashed border-border">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-sm whitespace-pre-wrap">{booking.notes}</p>
            </div>
          )}

          {idImageUrl && (
            <div className="px-8 py-5 border-t border-dashed border-border">
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <FileImage className="h-3.5 w-3.5" /> صورة الهوية
              </p>
              <img src={idImageUrl} alt="صورة الهوية" className="max-h-64 rounded-xl border border-border" />
            </div>
          )}

          <div className="bg-muted px-8 py-6 grid grid-cols-2 gap-4 border-t border-dashed border-border">
            <div>
              <p className="text-xs text-muted-foreground">سعر الفرد</p>
              <p className="text-lg font-extrabold">{sar(Number(booking.price_per_person))}</p>
              {booking.coupon_code && (
                <p className="text-xs text-success mt-1">
                  كود الخصم: <span dir="ltr">{booking.coupon_code}</span>
                </p>
              )}
            </div>
            <div className="text-left">
              {Number(booking.discount_amount ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">خصم: −{sar(Number(booking.discount_amount))}</p>
              )}
              <p className="text-xs text-muted-foreground">الإجمالي</p>
              <p className="text-2xl font-extrabold text-primary">{sar(Number(booking.total_price))}</p>
            </div>
          </div>

          <div className="px-8 py-5 text-center text-xs text-muted-foreground">
            يرجى إبراز التذكرة عند الصعود للباص. شكراً لاختياركم {BRAND.name}.
          </div>
        </div>
      </div>

      {layout && (
        <div className="container-luxe max-w-3xl mt-6 print-break">
          <div className="print-page bg-white rounded-[28px] overflow-hidden shadow-[var(--shadow-elegant)] print:rounded-none print:shadow-none">
            <div className="px-8 py-5 text-white flex items-center gap-3" style={{ background: "var(--gradient-navy)" }}>
              <img src={BRAND.logoUrl} alt="logo" className="h-12 w-12 rounded-full bg-white p-1" />
              <div>
                <h2 className="text-lg font-extrabold">مخطط الحافلة</h2>
                <p className="text-xs text-white/70">
                  {booking.customer_name} — مقاعد: <span dir="ltr">{booking.seat_numbers.join(", ")}</span>
                </p>
              </div>
            </div>
            <div className="px-6 py-6">
              <TicketSeatMap layout={layout} seats={booking.seat_numbers} name={booking.customer_name} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function defaultTicketLayout(): LayoutJson {
  const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
  const cells: LayoutCell[] = [];
  rows.forEach((r, i) => {
    const row = i + 1;
    cells.push({ row, col: 1, kind: "seat", label: `${r}1` });
    cells.push({ row, col: 2, kind: "seat", label: `${r}2` });
    cells.push({ row, col: 4, kind: "seat", label: `${r}3` });
    cells.push({ row, col: 5, kind: "seat", label: `${r}4` });
  });
  const mRow = rows.length + 1;
  for (let c = 1; c <= 5; c++) cells.push({ row: mRow, col: c, kind: "seat", label: `M${c}` });
  return { rows: mRow, cols: 5, cells };
}

/** Read-only seat map: only this booking's seats are coloured. */
function TicketSeatMap({ layout, seats, name }: { layout: LayoutJson; seats: string[]; name: string }) {
  const rows = Math.max(1, layout.rows || 1);
  const cols = Math.max(1, layout.cols || 1);
  const map = new Map<string, LayoutCell>();
  for (const c of layout.cells) map.set(`${c.row}:${c.col}`, c);
  const mine = new Set(seats);

  return (
    <div>
      <div
        className="grid gap-1.5 mx-auto"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, maxWidth: cols * 64 }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => {
          const r = Math.floor(i / cols) + 1;
          const c = (i % cols) + 1;
          const cell = map.get(`${r}:${c}`);
          if (!cell || cell.kind === "empty") return <div key={i} className="aspect-square" />;
          if (cell.kind !== "seat") {
            const t = cell.kind === "driver" ? "السائق" : cell.kind === "door" ? "باب" : "دورة مياه";
            return (
              <div
                key={i}
                className="aspect-square rounded-lg border-2 border-border bg-muted text-[9px] font-bold text-muted-foreground flex items-center justify-center"
              >
                {cell.label || t}
              </div>
            );
          }
          const id = cell.label && cell.label.trim() ? cell.label : `${cell.row}-${cell.col}`;
          const isMine = mine.has(id);
          return (
            <div
              key={i}
              className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center leading-tight ${
                isMine
                  ? "bg-primary text-primary-foreground border-primary font-extrabold"
                  : "bg-white text-muted-foreground border-border"
              }`}
            >
              <span className="text-[10px]">{id}</span>
              {isMine && <span className="text-[7px] px-0.5 truncate max-w-full">{name.split(" ")[0]}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-primary inline-block" /> مقاعدك ({name})
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded border-2 border-border bg-white inline-block" /> مقاعد أخرى
        </span>
      </div>
    </div>
  );
}

function TicketRow({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-bold ${ltr ? "text-right" : ""}`} dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  );
}
