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

/** Keep only the first two words of a passenger name (اسم ثنائي). */
export function twoPartName(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ");
}

function newCanvas(width: number, height: number) {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

const F = (size: number, bold = false) =>
  `${bold ? "800 " : ""}${size}px "Tajawal","Segoe UI",Arial,sans-serif`;

function drawHeader(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  title: string,
  sub: string,
  pad: number,
) {
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 0, width, height);
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "#ffffff";
  ctx.font = F(34, true);
  ctx.fillText(title, width - pad, 40);
  ctx.font = F(19);
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(sub, width - pad, 76);
  ctx.textAlign = "left";
  ctx.font = F(15);
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(new Date().toLocaleString("ar"), pad, 76);
}

/** Page 1: enlarged seat map. Page 2: passenger list. */
export function renderSeatChartPages(
  layout: LayoutJson,
  occupants: SeatOccupant[],
  meta: ChartMeta,
): HTMLCanvasElement[] {
  const bySeat = new Map<string, SeatOccupant>();
  for (const o of occupants) bySeat.set(o.seat, o);

  const PAD = 40;
  const HEADER = 104;
  // Seats are drawn as wide rectangles (wider than tall) for readability.
  const CELL_W = 168;
  const CELL_H = 108;
  const GAP = 14;
  const gridW = layout.cols * CELL_W + (layout.cols - 1) * GAP;
  const gridH = layout.rows * CELL_H + (layout.rows - 1) * GAP;

  const sub = [meta.tripLabel, meta.capacity ? `السعة: ${meta.capacity}` : "", `الركاب: ${occupants.length}`]
    .filter(Boolean)
    .join("  •  ");

  // ---------- page 1: seat map ----------
  const width = PAD * 2 + gridW;
  const height = PAD * 2 + HEADER + gridH + 80;
  const { canvas, ctx } = newCanvas(width, height);
  drawHeader(ctx, width, HEADER, `مخطط مقاعد: ${meta.busLabel}`, sub, PAD);

  const gridX = PAD;
  const gridY = PAD + HEADER;
  const cols = Math.max(1, layout.cols || 1);

  for (const cell of layout.cells) {
    if (cell.kind === "empty") continue;
    // RTL: column 1 sits on the far right, matching the on-screen seat map.
    const x = gridX + (cols - cell.col) * (CELL + GAP);
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
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, CELL, CELL, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    if (cell.kind !== "seat") {
      ctx.font = F(18, true);
      ctx.fillText(cell.label || kindLabel(cell.kind), x + CELL / 2, y + CELL / 2);
      continue;
    }
    ctx.font = F(22, true);
    ctx.fillText(id, x + CELL / 2, y + (occ ? 28 : CELL / 2));
    if (occ) {
      const nm = twoPartName(occ.name || "");
      const words = nm.split(" ");
      ctx.font = F(19, true);
      ctx.fillText(shorten(words[0] ?? "", 12), x + CELL / 2, y + 62);
      if (words[1]) ctx.fillText(shorten(words[1], 12), x + CELL / 2, y + 86);
      ctx.font = F(20, true);
      ctx.fillText(occ.gender === "female" ? "♀" : occ.gender === "male" ? "♂" : "•", x + CELL / 2, y + CELL - 18);
    }
  }

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
    roundRect(ctx, lx - 18, legendY - 9, 18, 18, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = F(15);
    ctx.fillText(label, lx - 24, legendY);
    lx -= 24 + ctx.measureText(label).width + 26;
  });

  // ---------- page 2: passenger list ----------
  const rowH = 40;
  const listW = Math.max(760, Math.min(width, 1100));
  const listPageH = PAD * 2 + HEADER + 60 + Math.max(1, occupants.length) * rowH + 40;
  const { canvas: c2, ctx: l } = newCanvas(listW, listPageH);
  drawHeader(l, listW, HEADER, "قائمة الركاب", `${meta.busLabel}${meta.tripLabel ? ` • ${meta.tripLabel}` : ""}`, PAD);

  const listX = PAD;
  let listY = PAD + HEADER + 10;
  l.direction = "rtl";
  l.textAlign = "right";
  l.font = F(16, true);
  l.fillStyle = COLORS.muted;
  l.fillText("الاسم", listW - PAD, listY);
  l.textAlign = "left";
  l.fillText("المقعد", listX, listY);
  listY += 16;
  l.strokeStyle = COLORS.border;
  l.lineWidth = 1.5;
  l.beginPath();
  l.moveTo(listX, listY);
  l.lineTo(listW - PAD, listY);
  l.stroke();

  occupants.forEach((o, i) => {
    const y = listY + 26 + i * rowH;
    if (i % 2 === 0) {
      l.fillStyle = "#f1f5f9";
      l.fillRect(listX, y - 18, listW - PAD * 2, rowH - 4);
    }
    l.fillStyle = o.gender === "female" ? COLORS.female : o.gender === "male" ? COLORS.male : COLORS.text;
    l.font = F(22, true);
    l.direction = "rtl";
    l.textAlign = "right";
    l.fillText(`${i + 1}. ${twoPartName(o.name || "-")}`, listW - PAD - 8, y);
    l.textAlign = "left";
    l.font = F(21, true);
    l.fillText(`${o.seat} ${o.gender === "female" ? "♀" : o.gender === "male" ? "♂" : ""}`, listX + 8, y);
  });

  return [canvas, c2];
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

export function downloadSeatChartPng(canvases: HTMLCanvasElement[], filename: string) {
  canvases.forEach((canvas, i) => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${filename}${i === 0 ? "-map" : "-list"}.png`;
    a.click();
  });
}

export function downloadSeatChartPdf(canvases: HTMLCanvasElement[], filename: string) {
  let pdf: jsPDF | undefined;
  canvases.forEach((canvas) => {
    const w = canvas.width / 2;
    const h = canvas.height / 2;
    const orientation = w >= h ? "landscape" : "portrait";
    if (pdf === undefined) pdf = new jsPDF({ orientation, unit: "pt", format: [w, h] });
    else pdf.addPage([w, h], orientation);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, h);
  });
  pdf?.save(`${filename}.pdf`);
}

