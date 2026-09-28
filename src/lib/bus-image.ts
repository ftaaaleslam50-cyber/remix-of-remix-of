// صورة الباص: قالب ثابت + رقم الباص + اللوحة تُرسم برمجيًا (Canvas) — بدون أي ذكاء اصطناعي.
// جميع المواضع نسب من أبعاد الصورة (0..1) وحجم الخط نسبة من العرض.
import { supabase } from "@/integrations/supabase/client";
import defaultTemplate from "@/assets/bus-template.png.asset.json";

export type Align = "left" | "center" | "right";

export interface BusImageTemplate {
  template_image_url: string | null;
  bus_number_enabled: boolean;
  bus_number_x: number;
  bus_number_y: number;
  bus_number_width: number;
  bus_number_font_size: number;
  bus_number_font_weight: number;
  bus_number_alignment: Align;
  bus_number_color: string;
  bus_number2_enabled: boolean;
  bus_number2_x: number;
  bus_number2_y: number;
  plate_x: number;
  plate_y: number;
  plate_width: number;
  plate_height: number;
  plate_font_size: number;
  plate_font_weight: number;
  plate_alignment: Align;
  plate_color: string;
}

export const DEFAULT_TEMPLATE_URL = defaultTemplate.url;

export const templateTable = () => supabase.from("bus_image_template" as never);

export async function loadBusTemplate(): Promise<BusImageTemplate | null> {
  const { data } = await templateTable()
    .select("*")
    .eq("id" as never, 1 as never)
    .maybeSingle();
  if (!data) return null;
  const t = data as unknown as BusImageTemplate;
  const num = (v: unknown) => Number(v);
  return {
    ...t,
    bus_number_x: num(t.bus_number_x),
    bus_number_y: num(t.bus_number_y),
    bus_number_width: num(t.bus_number_width),
    bus_number_font_size: num(t.bus_number_font_size),
    bus_number2_x: num(t.bus_number2_x),
    bus_number2_y: num(t.bus_number2_y),
    plate_x: num(t.plate_x),
    plate_y: num(t.plate_y),
    plate_width: num(t.plate_width),
    plate_height: num(t.plate_height),
    plate_font_size: num(t.plate_font_size),
  };
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  let p = imgCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => res(im);
      im.onerror = () => {
        imgCache.delete(src);
        rej(new Error("تعذّر تحميل قالب صورة الباص"));
      };
      im.src = src;
    });
    imgCache.set(src, p);
  }
  return p;
}

// ---- الخطوط ----
// العربي: Amiri (نسخ) يقرّب شكل الأرقام من اللي على الباصات. اللاتيني: Tahoma/Verdana عريض.
const FONT_ARABIC = '"Amiri", "Noto Naskh Arabic", "Traditional Arabic", serif';
const FONT_LATIN = 'Tahoma, Verdana, "Segoe UI", Arial, sans-serif';

let fontsReady: Promise<void> | null = null;
function ensureFonts(): Promise<void> {
  if (fontsReady) return fontsReady;
  fontsReady = (async () => {
    try {
      if (!document.getElementById("bus-image-fonts")) {
        const l = document.createElement("link");
        l.id = "bus-image-fonts";
        l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&display=swap";
        document.head.appendChild(l);
      }
      // ننتظر التحميل (بحد أقصى 3 ثواني) حتى لا تُرسم الصورة بخط بديل.
      await Promise.race([
        Promise.all([
          document.fonts.load('700 40px "Amiri"', "٠١٢٣٤٥٦٧٨٩"),
          document.fonts.load("700 40px Tahoma", "0123456789"),
        ]),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    } catch {
      /* نكمل بالخط البديل */
    }
  })();
  return fontsReady;
}

// تحويل الأرقام الإنجليزية (0-9) إلى أرقام عربية (٠-٩).
const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
function toArabicDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  maxW: number,
  family: string,
) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (s > 6 && ctx.measureText(text).width > maxW) {
    s -= 1;
    ctx.font = `${weight} ${s}px ${family}`;
  }
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  w: number,
  align: Align,
  weight: number,
  size: number,
  color: string,
  family: string = FONT_LATIN,
) {
  fitText(ctx, text, weight, size, w, family);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = align;
  ctx.direction = "ltr";
  const x = align === "left" ? cx - w / 2 : align === "right" ? cx + w / 2 : cx;
  ctx.fillText(text, x, cy);
}

// ---- لوحة سعودية (سطران + شريط أصفر) ----
// حروف اللوحات السعودية المعتمدة: لاتيني ↔ عربي (17 حرفًا).
const PLATE_LAT_TO_AR: Record<string, string> = {
  A: "أ",
  B: "ب",
  J: "ح",
  D: "د",
  R: "ر",
  S: "س",
  X: "ص",
  T: "ط",
  E: "ع",
  G: "ق",
  K: "ك",
  L: "ل",
  Z: "م",
  N: "ن",
  H: "ه",
  U: "و",
  V: "ى",
};
const PLATE_AR_TO_LAT: Record<string, string> = {
  أ: "A",
  ا: "A",
  إ: "A",
  آ: "A",
  ب: "B",
  ح: "J",
  د: "D",
  ر: "R",
  س: "S",
  ص: "X",
  ط: "T",
  ع: "E",
  ق: "G",
  ك: "K",
  ل: "L",
  م: "Z",
  ن: "N",
  ه: "H",
  ة: "H",
  و: "U",
  ى: "V",
  ي: "V",
};

export interface ParsedPlate {
  digits: string[]; // أرقام لاتينية بالترتيب من اليسار لليمين
  letters: string[]; // حروف لاتينية بالترتيب من اليسار لليمين (كل حرف يقابله عربي فوقه)
  unknown: string[]; // حروف غير معتمدة (تُتجاهل)
}

/** يقبل "8993 ZXA" أو "٨٩٩٣ أ ص م" ويرجع الأرقام والحروف مرتّبة بصريًا. */
export function parsePlate(input: string): ParsedPlate {
  const digits: string[] = [];
  const letters: string[] = [];
  const unknown: string[] = [];
  let arabicMode = false;
  for (const ch of input.replace(/\s+/g, "")) {
    const code = ch.charCodeAt(0);
    if (ch >= "0" && ch <= "9") digits.push(ch);
    else if (code >= 0x660 && code <= 0x669) digits.push(String(code - 0x660));
    else if (code >= 0x6f0 && code <= 0x6f9) digits.push(String(code - 0x6f0));
    else if (ch === "ـ")
      continue; // تطويل (مثل هـ)
    else if (/[a-zA-Z]/.test(ch)) {
      const u = ch.toUpperCase();
      if (PLATE_LAT_TO_AR[u]) letters.push(u);
      else unknown.push(ch);
    } else if (PLATE_AR_TO_LAT[ch]) {
      arabicMode = true;
      letters.push(PLATE_AR_TO_LAT[ch]);
    } else if (/[\u0600-\u06FF]/.test(ch)) unknown.push(ch);
  }
  // الإدخال العربي يُكتب منطقيًا من اليمين لليسار، فنعكسه ليطابق الترتيب البصري للاتيني.
  if (arabicMode) letters.reverse();
  return { digits, letters, unknown };
}

/** رسالة تنبيه للمعاينة (أو null لو كل شيء سليم). */
export function plateIssue(input: string): string | null {
  if (!input.trim()) return null;
  const p = parsePlate(input);
  if (p.unknown.length) return `حروف غير معتمدة في اللوحات السعودية: ${p.unknown.join(" ")}`;
  if (!p.digits.length && !p.letters.length) return "تعذّر قراءة اللوحة (تُرسم كنص عادي)";
  return null;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSaudiPlate(
  ctx: CanvasRenderingContext2D,
  p: ParsedPlate,
  cx: number,
  cy: number,
  w: number,
  h: number,
  weight: number,
  size: number,
  color: string,
) {
  const x0 = cx - w / 2,
    y0 = cy - h / 2;
  const r = Math.min(h * 0.1, 8);
  const line = Math.max(1, h * 0.028);
  const stripW = w * 0.1;
  const mainW = w - stripW;
  const digitsW = mainW * 0.58;
  const lettersW = mainW - digitsW;
  const rowH = h / 2;

  // الخلفية والإطار
  roundRectPath(ctx, x0, y0, w, h, r);
  ctx.fillStyle = "#f7f6f1";
  ctx.fill();

  // الشريط الأصفر (يمين)
  ctx.save();
  roundRectPath(ctx, x0, y0, w, h, r);
  ctx.clip();
  ctx.fillStyle = "#e9b421";
  ctx.fillRect(x0 + mainW, y0, stripW, h);
  ctx.restore();
  // شعار مبسّط داخل الشريط
  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.arc(x0 + mainW + stripW / 2, y0 + h * 0.3, stripW * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  const tx = x0 + mainW + stripW / 2,
    ty = y0 + h * 0.86,
    ts = stripW * 0.2;
  ctx.moveTo(tx, ty - ts);
  ctx.lineTo(tx + ts, ty + ts * 0.7);
  ctx.lineTo(tx - ts, ty + ts * 0.7);
  ctx.closePath();
  ctx.fill();

  // الخطوط الفاصلة والإطار
  ctx.strokeStyle = "#5a5a5a";
  ctx.lineWidth = line;
  ctx.beginPath();
  ctx.moveTo(x0, y0 + rowH);
  ctx.lineTo(x0 + mainW, y0 + rowH);
  ctx.moveTo(x0 + digitsW, y0);
  ctx.lineTo(x0 + digitsW, y0 + h);
  ctx.moveTo(x0 + mainW, y0);
  ctx.lineTo(x0 + mainW, y0 + h);
  ctx.stroke();
  roundRectPath(ctx, x0, y0, w, h, r);
  ctx.stroke();

  // النصوص: كل حرف/رقم فوقه مقابله (عربي فوق، لاتيني تحت)
  const DIGIT_SLOTS = Math.max(4, p.digits.length);
  const LETTER_SLOTS = Math.max(3, p.letters.length);
  const dSlot = (digitsW * 0.92) / DIGIT_SLOTS;
  const lSlot = (lettersW * 0.92) / LETTER_SLOTS;
  const fs = Math.min(size, rowH * 0.74, dSlot * 1.05, lSlot * 1.05);

  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  const put = (glyphs: string[], family: string, cellX: number, cellW: number, slot: number, y: number) => {
    ctx.font = `${weight} ${fs}px ${family}`;
    const start = cellX + (cellW - slot * glyphs.length) / 2;
    glyphs.forEach((g, i) => ctx.fillText(g, start + slot * (i + 0.5), y));
  };
  const yTop = y0 + rowH * 0.52,
    yBot = y0 + rowH * 1.5;
  put(
    p.digits.map((d) => ARABIC_DIGITS[Number(d)]),
    FONT_ARABIC,
    x0,
    digitsW,
    dSlot,
    yTop,
  );
  put(p.digits, FONT_LATIN, x0, digitsW, dSlot, yBot);
  put(
    p.letters.map((l) => PLATE_LAT_TO_AR[l]),
    FONT_ARABIC,
    x0 + digitsW,
    lettersW,
    lSlot,
    yTop,
  );
  put(p.letters, FONT_LATIN, x0 + digitsW, lettersW, lSlot, yBot);
}

/** Deterministic: same template + same bus data ⇒ identical image. */
export async function renderBusImage(
  t: BusImageTemplate,
  bus: { bus_number?: number | null; plate?: string | null },
): Promise<Blob> {
  await ensureFonts();
  const im = await loadImage(t.template_image_url || DEFAULT_TEMPLATE_URL);
  const W = im.naturalWidth,
    H = im.naturalHeight;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(im, 0, 0, W, H);

  const num = bus.bus_number ? String(bus.bus_number) : "";
  if (num && t.bus_number_enabled) {
    const args = [
      t.bus_number_width * W,
      t.bus_number_alignment,
      t.bus_number_font_weight,
      t.bus_number_font_size * W,
      t.bus_number_color,
    ] as const;
    // اليسار: أرقام عربية (زي لوحة الباص الحقيقية)
    drawText(ctx, toArabicDigits(num), t.bus_number_x * W, t.bus_number_y * H, ...args, FONT_ARABIC);
    // اليمين: أرقام إنجليزية (تكرار الرقم بالشكل اللاتيني)
    if (t.bus_number2_enabled) drawText(ctx, num, t.bus_number2_x * W, t.bus_number2_y * H, ...args);
  }
  const plate = (bus.plate ?? "").trim();
  if (plate) {
    const parsed = parsePlate(plate);
    if (parsed.digits.length || parsed.letters.length) {
      drawSaudiPlate(
        ctx,
        parsed,
        t.plate_x * W,
        t.plate_y * H,
        t.plate_width * W,
        t.plate_height * H,
        t.plate_font_weight,
        t.plate_font_size * W,
        t.plate_color,
      );
    } else {
      drawText(
        ctx,
        plate,
        t.plate_x * W,
        t.plate_y * H,
        t.plate_width * W * 0.92,
        t.plate_alignment,
        t.plate_font_weight,
        Math.min(t.plate_font_size * W, t.plate_height * H * 0.8),
        t.plate_color,
      );
    }
  }
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("تعذّر إنشاء الصورة"))), "image/jpeg", 0.92),
  );
}
