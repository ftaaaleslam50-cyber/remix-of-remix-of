// Server-side ticket PDF generation (Cloudflare Worker friendly).
// Arabic support: text is reshaped to presentation forms and drawn with an
// embedded Amiri TTF (no HTML/browser print). pdf-lib reverses the whole
// string for RTL text, so embedded Latin/digit runs are pre-reversed here.
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import ArabicReshaper from "arabic-reshaper";
import QRCode from "qrcode";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { returnDisplay } from "@/lib/return-display";
import { roomDisplayLabel } from "@/lib/booking/pricing";
import type { RoomType } from "@/lib/booking/types";

const ARABIC_RE = /[\u0600-\u06FF\uFB50-\uFEFF]/;
const LTR_RUN_RE = /[A-Za-z0-9][A-Za-z0-9\-_.:/+٫,()]*/g;

/** Reshape Arabic to presentation forms and keep Latin/digit runs readable. */
function shape(input: string): string {
  const text = String(input ?? "");
  if (!text) return "";
  if (!ARABIC_RE.test(text)) return text;
  const reshaped = ArabicReshaper.convertArabic(text);
  // pdf-lib reverses the full string when drawing RTL text; reversing each
  // Latin/digit run beforehand keeps "180" and "ZT-2026-1234" in order.
  const withRuns = reshaped.replace(LTR_RUN_RE, (run: string) => Array.from(run).reverse().join(""));
  // Brackets are mirrored by the RTL reversal, so pre-swap them.
  return withRuns.replace(/[()[\]]/g, (c: string) => (c === "(" ? ")" : c === ")" ? "(" : c === "[" ? "]" : "["));
}


const NAVY = rgb(0.05, 0.13, 0.26);
const GOLD = rgb(0.78, 0.63, 0.29);
const GREY = rgb(0.45, 0.47, 0.52);
const DARK = rgb(0.1, 0.11, 0.13);
const LIGHT = rgb(0.95, 0.96, 0.97);
const BORDER = rgb(0.85, 0.86, 0.88);

let fontCache: Uint8Array | null = null;
async function loadArabicFont(): Promise<Uint8Array> {
  if (fontCache) return fontCache;
  const { data, error } = await supabaseAdmin.storage.from("fonts").download("Amiri-Regular.ttf");
  if (error || !data) throw new Error(`font download failed: ${error?.message ?? "no data"}`);
  fontCache = new Uint8Array(await data.arrayBuffer());
  return fontCache;
}

let notesCache: Uint8Array | null = null;
/** Third ticket page: "تنبيهات هامة" infographic stored in the fonts bucket. */
async function loadNotesImage(): Promise<Uint8Array | null> {
  if (notesCache) return notesCache;
  const { data, error } = await supabaseAdmin.storage.from("fonts").download("ticket-notes.jpg");
  if (error || !data) return null;
  notesCache = new Uint8Array(await data.arrayBuffer());
  return notesCache;
}

export interface TicketBooking {
  booking_code: string;
  booking_type: string;
  passenger_count: number;
  room_type: string;
  customer_name: string;
  id_number?: string | null;
  contact_phone?: string | null;
  whatsapp_phone?: string | null;
  seat_numbers?: string[] | null;
  price_per_person: number;
  total_price: number;
  discount_amount?: number | null;
  coupon_code?: string | null;
  created_at: string;
  notes?: string | null;
  actual_return_day?: string | null;
  extension_nights?: number | null;
  trip_mode?: string | null;
  packages?: { name: string } | null;
  hotels?: { name: string } | null;
  trips?: { name: string; departure_day: string; return_day: string } | null;
  buses?: { bus_number: number; name?: string | null; plate?: string | null; layout_id?: string | null } | null;
  layout_json?: LayoutJson | null;
}

interface LayoutCell {
  row: number;
  col: number;
  kind: string;
  label?: string;
}
export interface LayoutJson {
  rows: number;
  cols: number;
  cells: LayoutCell[];
}

/** Fetch the freshest booking data for a ticket code. */
export async function fetchTicket(code: string): Promise<TicketBooking | null> {
  const rpc = await supabaseAdmin.rpc("get_ticket" as never, { _code: code } as never);
  const t = rpc.data as unknown as TicketBooking | null;
  if (t && t.booking_code) return t;

  const { data } = await supabaseAdmin
    .from("bookings")
    .select(
      "booking_code,booking_type,passenger_count,room_type,customer_name,id_number,contact_phone,whatsapp_phone,seat_numbers,price_per_person,total_price,discount_amount,coupon_code,created_at,notes,actual_return_day,extension_nights,trip_mode,packages(name),hotels(name),trips(name,departure_day,return_day),buses(bus_number,name,plate,layout_id)",
    )
    .eq("booking_code", code)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;
  const booking = data as unknown as TicketBooking;
  const layoutId = booking.buses?.layout_id;
  if (layoutId) {
    const { data: lay } = await supabaseAdmin
      .from("bus_layouts")
      .select("layout_json")
      .eq("id", layoutId)
      .maybeSingle();
    booking.layout_json = (lay as { layout_json: LayoutJson } | null)?.layout_json ?? null;
  }
  return booking;
}

function sar(n: number): string {
  return `ر.س ${Number(n || 0).toLocaleString("en-US")}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Riyadh",
  }).format(d);
}

function defaultLayout(): LayoutJson {
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

const A4: [number, number] = [595.28, 841.89];
const M = 40; // page margin

export async function buildTicketPdf(b: TicketBooking): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await loadArabicFont(), { subset: false });
  pdf.setTitle(`ticket-${b.booking_code}`);

  const page = pdf.addPage(A4);
  const W = A4[0];
  const right = W - M;

  /** Draw right-aligned (RTL) text and return its width. */
  function rtl(p: PDFPage, text: string, x: number, y: number, size: number, color = DARK, bold = false) {
    const t = shape(text);
    const w = font.widthOfTextAtSize(t, size);
    p.drawText(t, { x: x - w, y, size, font, color });
    if (bold) p.drawText(t, { x: x - w + 0.35, y, size, font, color });
    return w;
  }
  function ltr(p: PDFPage, text: string, x: number, y: number, size: number, color = DARK) {
    p.drawText(text, { x, y, size, font, color });
  }

  // ---- Header (no company name / logo, per requirements) ----
  page.drawRectangle({ x: 0, y: A4[1] - 90, width: W, height: 90, color: NAVY });
  rtl(page, "تذكرة حجز", right, A4[1] - 45, 20, rgb(1, 1, 1), true);
  rtl(page, "رقم الحجز", right, A4[1] - 68, 10, rgb(0.8, 0.84, 0.9));
  ltr(page, b.booking_code, right - 120, A4[1] - 68, 11, rgb(1, 1, 1));
  page.drawRectangle({ x: M, y: A4[1] - 62, width: 74, height: 22, color: GOLD });
  rtl(page, "مؤكَّد", M + 60, A4[1] - 56, 11, NAVY, true);

  let y = A4[1] - 130;

  // ---- Booking code + QR ----
  rtl(page, "رقم الحجز", right, y + 26, 9, GREY);
  ltr(page, b.booking_code, right - font.widthOfTextAtSize(b.booking_code, 24), y, 24, NAVY);

  const qrSize = 84;
  await drawQr(page, `ZT-TICKET:${b.booking_code}`, M, y - 10, qrSize);
  y -= 40;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1, color: BORDER });

  // ---- Details grid (2 columns, RTL: first column on the right) ----
  const hasHotel = !!(b.packages?.name ?? b.hotels?.name);
  const rows: [string, string][] = [
    ["الاسم", b.customer_name],
    ["رقم الهوية", b.id_number || "-"],
    ["جوال التواصل", b.contact_phone || "-"],
    ["جوال الواتساب", b.whatsapp_phone || "-"],
    ["الرحلة", b.trips?.name ?? "-"],
    ["الفندق", b.packages?.name ?? b.hotels?.name ?? "بدون فندق"],
  ];
  if (Number(b.extension_nights ?? 0) > 0) rows.push(["عدد ليال التمديد", String(b.extension_nights)]);
  rows.push(["نوع الحجز", b.booking_type === "individual" ? "أفراد" : "عوائل"]);
  rows.push(["نوع الغرفة", roomDisplayLabel(b.room_type as RoomType, b.booking_type as "individual" | "family", hasHotel)]);
  rows.push(["عدد الأفراد", String(b.passenger_count)]);
  rows.push([
    "رقم الباص",
    `${b.buses?.bus_number ?? "-"}${b.buses?.name ? ` (${b.buses.name})` : ""}`,
  ]);
  if (b.buses?.plate) rows.push(["لوحة الباص", b.buses.plate]);
  rows.push(["المقاعد", (b.seat_numbers ?? []).join(", ") || "-"]);
  if (b.trips?.departure_day)
    rows.push(["الذهاب", b.trip_mode === "return" ? "بدون ذهاب" : b.trips.departure_day]);
  rows.push([
    "العودة",
    returnDisplay(b.trips?.return_day, b.extension_nights, "-", b.trip_mode),
  ]);
  if (Number(b.extension_nights ?? 0) === 0 && b.trip_mode !== "outbound" && b.actual_return_day)
    rows.push(["العودة الفعلية", b.actual_return_day]);
  rows.push(["تاريخ الحجز", formatDate(b.created_at)]);

  y -= 30;
  const colRight = [right, M + (right - M) / 2 - 10];
  const rowH = 40;
  rows.forEach((r, i) => {
    const col = i % 2;
    const rowY = y - Math.floor(i / 2) * rowH;
    rtl(page, r[0], colRight[col], rowY, 9, GREY);
    rtl(page, r[1] || "-", colRight[col], rowY - 16, 12, DARK, true);
  });
  y -= Math.ceil(rows.length / 2) * rowH + 6;

  if (b.notes) {
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1, color: BORDER });
    y -= 20;
    rtl(page, "ملاحظات", right, y, 9, GREY);
    y -= 16;
    for (const line of wrap(b.notes, 90)) {
      rtl(page, line, right, y, 11, DARK);
      y -= 15;
    }
    y -= 6;
  }

  // ---- Totals ----
  const boxH = b.coupon_code ? 82 : 70;
  const boxY = Math.max(M + 40, y - boxH);
  page.drawRectangle({ x: M, y: boxY, width: right - M, height: boxH, color: LIGHT });
  rtl(page, "سعر الفرد", right - 14, boxY + boxH - 24, 9, GREY);
  rtl(page, sar(Number(b.price_per_person)), right - 14, boxY + boxH - 44, 14, DARK, true);
  if (b.coupon_code) rtl(page, `كود الخصم: ${b.coupon_code}`, right - 14, boxY + 12, 9, GREY);
  if (Number(b.discount_amount ?? 0) > 0)
    rtl(page, `خصم: −${sar(Number(b.discount_amount))}`, M + 160, boxY + 12, 9, GREY);
  rtl(page, "الإجمالي", M + 160, boxY + boxH - 24, 9, GREY);
  rtl(page, sar(Number(b.total_price)), M + 160, boxY + boxH - 48, 18, NAVY, true);

  rtl(page, "يرجى إبراز التذكرة عند الصعود للباص.", W / 2 + 90, boxY - 24, 10, GREY);

  // ---- Page 2: seat map ----
  const layout = b.layout_json ?? defaultLayout();
  const seats = new Set(b.seat_numbers ?? []);
  const p2 = pdf.addPage(A4);
  p2.drawRectangle({ x: 0, y: A4[1] - 80, width: W, height: 80, color: NAVY });
  rtl(p2, "مخطط الحافلة", right, A4[1] - 44, 17, rgb(1, 1, 1), true);
  rtl(
    p2,
    `${b.customer_name} — مقاعد: ${(b.seat_numbers ?? []).join(", ") || "-"}`,
    right,
    A4[1] - 64,
    10,
    rgb(0.82, 0.85, 0.9),
  );

  const cols = Math.max(1, layout.cols || 1);
  const lrows = Math.max(1, layout.rows || 1);
  const cell = Math.min(46, (right - M) / cols - 6, (A4[1] - 200) / lrows - 6);
  const gridW = cols * (cell + 6) - 6;
  const startX = (W - gridW) / 2;
  const startY = A4[1] - 120;
  const map = new Map<string, LayoutCell>();
  for (const c of layout.cells) map.set(`${c.row}:${c.col}`, c);

  for (let r = 1; r <= lrows; r++) {
    for (let c = 1; c <= cols; c++) {
      const cl = map.get(`${r}:${c}`);
      if (!cl || cl.kind === "empty") continue;
      // RTL grid: column 1 is on the right.
      const x = startX + (cols - c) * (cell + 6);
      const yy = startY - r * (cell + 6);
      const id = cl.label && cl.label.trim() ? cl.label : `${cl.row}-${cl.col}`;
      const isSeat = cl.kind === "seat";
      const mine = isSeat && seats.has(id);
      p2.drawRectangle({
        x,
        y: yy,
        width: cell,
        height: cell,
        color: mine ? NAVY : isSeat ? rgb(1, 1, 1) : LIGHT,
        borderColor: mine ? NAVY : BORDER,
        borderWidth: 1.2,
      });
      const label = isSeat
        ? id
        : cl.label || (cl.kind === "driver" ? "السائق" : cl.kind === "door" ? "باب" : "دورة مياه");
      const t = shape(label);
      const size = 8;
      const tw = font.widthOfTextAtSize(t, size);
      p2.drawText(t, {
        x: x + (cell - tw) / 2,
        y: yy + cell / 2 - (mine ? 1 : 3),
        size,
        font,
        color: mine ? rgb(1, 1, 1) : GREY,
      });
      if (mine) {
        const nm = shape(b.customer_name.split(" ")[0] ?? "");
        const nw = Math.min(font.widthOfTextAtSize(nm, 6), cell - 4);
        p2.drawText(nm, { x: x + (cell - nw) / 2, y: yy + cell / 2 - 10, size: 6, font, color: rgb(1, 1, 1) });
      }
    }
  }

  const legendY = startY - lrows * (cell + 6) - 30;
  p2.drawRectangle({ x: right - 14, y: legendY, width: 12, height: 12, color: NAVY });
  rtl(p2, `مقاعدك (${b.customer_name})`, right - 22, legendY + 2, 10, GREY);
  p2.drawRectangle({ x: right - 190, y: legendY, width: 12, height: 12, color: rgb(1, 1, 1), borderColor: BORDER, borderWidth: 1 });
  rtl(p2, "مقاعد أخرى", right - 198, legendY + 2, 10, GREY);

  // ---- Page 3: important notices image ----
  try {
    const notes = await loadNotesImage();
    if (notes) {
      const img = await pdf.embedJpg(notes);
      const p3 = pdf.addPage(A4);
      const scale = Math.min((A4[0] - 2 * 12) / img.width, (A4[1] - 2 * 12) / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      p3.drawImage(img, { x: (A4[0] - w) / 2, y: (A4[1] - h) / 2, width: w, height: h });
    }
  } catch (err) {
    console.error("notes page failed", err);
  }

  return await pdf.save();
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      if ((line + " " + word).trim().length > max) {
        out.push(line.trim());
        line = word;
      } else line += ` ${word}`;
    }
    out.push(line.trim());
  }
  return out.filter(Boolean);
}

async function drawQr(page: PDFPage, text: string, x: number, yTop: number, size: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const s = size / n;
  page.drawRectangle({ x: x - 4, y: yTop - size - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1) });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      page.drawRectangle({ x: x + c * s, y: yTop - (r + 1) * s, width: s, height: s, color: rgb(0, 0, 0) });
    }
  }
}
