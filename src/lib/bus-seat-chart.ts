// Renders a printable bus seat chart (seat map + passenger list) to a canvas,
// then exports it as PNG or PDF. Used by the admin bookings management screen.
import jsPDF from "jspdf";
import type { LayoutCell, LayoutJson } from "@/components/booking/LayoutSeatMap";

export type SeatSex = "male" | "female";

export interface SeatOccupant {
  seat: string;
  name: string;
  gender?: SeatSex;
  bookingCode: string;
  phone?: string | null;
}

const NORMAL_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];

/** Fallback layout used when the bus has no custom layout template. */
export function buildDefaultLayout(layout: "A" | "B" = "A"): LayoutJson {
  const cells: LayoutCell[] = [];
  NORMAL_ROWS.forEach((r, i) => {
    const row = i + 1;
    cells.push({ row, col: 1, kind: "seat", label: `${r}1` });
    cells.push({ row, col: 2, kind: "seat", label: `${r}2` });
    cells.push({ row, col: 4, kind: "seat", label: `${r}3` });
    cells.push({ row, col: 5, kind: "seat", label: `${r}4` });
  });
  const mRow = NORMAL_ROWS.length + 1;
  for (let c = 1; c <= 5; c++) cells.push({ row: mRow, col: c, kind: "seat", label: `M${c}` });
  let rows = mRow;
  if (layout === "B") {
    rows = mRow + 1;
    for (let c = 1; c <= 4; c++) cells.push({ row: rows, col: c, kind: "seat", label: `F${c}` });
  }
  return { rows, cols: 5, cells };
}

function seatId(c: LayoutCell) {
  return c.label && c.label.trim() ? c.label : `${c.row}-${c.col}`;
}

const COLORS = {
  navy: "#0f2942",
  gold: "#c8a35a",
  male: "#0284c7",
  female: "#ec4899",
  free: "#ffffff",
  border: "#cbd5e1",
  text: "#0f172a",
  muted: "#64748b",
};

export interface ChartMeta {
  busLabel: string;
  tripLabel?: string;
  capacity?: number;
}

export function renderSeatChartCanvas(
  layout: LayoutJson,
  occupants: SeatOccupant[],
  meta: ChartMeta,
): HTMLCanvasElement {
  const bySeat = new Map<string, SeatOccupant>();
  for (const o of occupants) bySeat.set(o.seat, o);

  const CELL = 74;
  const GAP = 10;
  const PAD = 32;
  const HEADER = 96;
  const LIST_W = 430;
  const gridW = layout.cols * CELL + (layout.cols - 1) * GAP;
  const gridH = layout.rows * CELL + (layout.rows - 1) * GAP;

  const listRowH = 30;
  const listH = 46 + occupants.length * listRowH;

  const width = PAD * 2 + gridW + 40 + LIST_W;
  const height = PAD * 2 + HEADER + Math.max(gridH, listH) + 70;

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";

  const F = (size: number, bold = false) =>
    `${bold ? "700 " : ""}${size}px "Tajawal","Segoe UI",Arial,sans-serif`;

  // background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // header
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, HEADER);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = F(30, true);
  ctx.fillText(`مخطط مقاعد: ${meta.busLabel}`, width - PAD, 36);
  ctx.font = F(17);
  ctx.fillStyle = "#e2e8f0";
  const sub = [meta.tripLabel, meta.capacity ? `السعة: ${meta.capacity}` : "", `الركاب: ${occupants.length}`]
    .filter(Boolean)
    .join("  •  ");
  ctx.fillText(sub, width - PAD, 68);
  ctx.textAlign = "left";
  ctx.font = F(14);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(new Date().toLocaleString("ar"), PAD, 68);

  // ---- seat grid (drawn on the right side for RTL feel) ----
  const gridX = width - PAD - gridW;
  const gridY = PAD + HEADER;

  for (const cell of layout.cells) {
    if (cell.kind === "empty") continue;
    const x = gridX + (cell.col - 1) * (CELL + GAP);
    const y = gridY + (cell.row - 1) * (CELL + GAP);
    const id = seatId(cell);
    const occ = cell.kind === "seat" ? bySeat.get(id) : undefined;

    let bg = COLORS.free;
    let fg = COLORS.text;
    let stroke = COLORS.border;
    if (cell.kind === "driver") {
      bg = "#fef3c7";
      stroke = "#f59e0b";
    } else if (cell.kind === "door") {
      bg = "#dbeafe";
      stroke = "#3b82f6";
    } else if (cell.kind === "restroom") {
      bg = "#d1fae5";
      stroke = "#10b981";
    } else if (cell.disabled) {
      bg = "#e5e7eb";
      fg = COLORS.muted;
    } else if (occ?.gender === "male") {
      bg = COLORS.male;
      fg = "#ffffff";
      stroke = "#0369a1";
    } else if (occ?.gender === "female") {
      bg = COLORS.female;
      fg = "#ffffff";
      stroke = "#be185d";
    } else if (occ) {
      bg = COLORS.navy;
      fg = "#ffffff";
      stroke = COLORS.navy;
    }

    ctx.fillStyle = bg;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, CELL, CELL, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.textAlign = "center";
    if (cell.kind !== "seat") {
      ctx.font = F(12, true);
      ctx.fillText(cell.label || kindLabel(cell.kind), x + CELL / 2, y + CELL / 2);
      continue;
    }
    ctx.font = F(13, true);
    ctx.fillText(id, x + CELL / 2, y + (occ ? 18 : CELL / 2));
    if (occ) {
      ctx.font = F(11);
      const nm = shorten(occ.name || "", 14);
      ctx.fillText(nm, x + CELL / 2, y + 40);
      ctx.font = F(12, true);
      ctx.fillText(occ.gender === "female" ? "♀" : occ.gender === "male" ? "♂" : "•", x + CELL / 2, y + 60);
    }
  }

  // ---- passenger list ----
  const listX = PAD;
  let listY = PAD + HEADER;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.navy;
  ctx.font = F(19, true);
  ctx.fillText("قائمة الركاب", listX + LIST_W, listY + 10);
  listY += 34;

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.font = F(13, true);
  ctx.fillStyle = COLORS.muted;
  ctx.fillText("الاسم", listX + LIST_W, listY);
  ctx.textAlign = "left";
  ctx.fillText("المقعد", listX + 6, listY);
  listY += 12;
  ctx.beginPath();
  ctx.moveTo(listX, listY);
  ctx.lineTo(listX + LIST_W, listY);
  ctx.stroke();

  occupants.forEach((o, i) => {
    const y = listY + 18 + i * listRowH;
    if (i % 2 === 0) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(listX, y - 13, LIST_W, listRowH - 4);
    }
    ctx.fillStyle = o.gender === "female" ? COLORS.female : o.gender === "male" ? COLORS.male : COLORS.text;
    ctx.font = F(14, true);
    ctx.textAlign = "right";
    ctx.fillText(`${i + 1}. ${shorten(o.name || "-", 28)}`, listX + LIST_W - 6, y);
    ctx.textAlign = "left";
    ctx.font = F(14, true);
    ctx.fillText(`${o.seat} ${o.gender === "female" ? "♀" : o.gender === "male" ? "♂" : ""}`, listX + 6, y);
  });

  // legend
  const legendY = height - PAD - 8;
  const legend: Array<[string, string]> = [
    [COLORS.male, "ذكر"],
    [COLORS.female, "أنثى"],
    [COLORS.free, "متاح"],
    [COLORS.navy, "محجوز"],
  ];
  let lx = width - PAD;
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  legend.forEach(([color, label]) => {
    ctx.fillStyle = color;
    ctx.strokeStyle = COLORS.border;
    roundRect(ctx, lx - 16, legendY - 8, 16, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = F(13);
    ctx.fillText(label, lx - 22, legendY);
    lx -= 22 + ctx.measureText(label).width + 24;
  });

  return canvas;
}

function kindLabel(kind: string) {
  return kind === "driver" ? "السائق" : kind === "door" ? "باب" : kind === "restroom" ? "دورة مياه" : "";
}

function shorten(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function downloadSeatChartPng(canvas: HTMLCanvasElement, filename: string) {
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${filename}.png`;
  a.click();
}

export function downloadSeatChartPdf(canvas: HTMLCanvasElement, filename: string) {
  const w = canvas.width;
  const h = canvas.height;
  const pdf = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "pt", format: [w / 2, h / 2] });
  pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w / 2, h / 2);
  pdf.save(`${filename}.pdf`);
}
