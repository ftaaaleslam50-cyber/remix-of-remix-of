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
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("تعذّر إنشاء الصورة"))), "image/jpeg", 0.92),
  );
}
