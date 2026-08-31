// نموذج الحافلة — the ONLY official trip print/export form.
//
// Landscape A4, full RTL, large print-friendly typography and the exact
// colour system of the official workbook. Everything is filled from live
// database data: no placeholders, no demo rows, dynamic passenger table.
import ExcelJS from "exceljs";

/* ----------------------------- design tokens ---------------------------- */
export const SHEET_COLORS = {
  cream: "FCFEDE",
  lime: "F7FCB6",
  lightBlue: "E7F7FF",
  peach: "FFF1E7",
  cyan: "CCFFFF",
  pink: "FFEBEB",
  roomsTable: "DDEBF7",
  darkRed: "C00000",
  blue: "0070C0",
  red: "FF0000",
} as const;

/* -------------------------------- types --------------------------------- */
export interface OfficialSheetHeader {
  departureDate?: string;
  returnDate?: string;
  capacity?: number;
  transportCompany?: string;
  busNumber?: string | number;
  plate?: string;
  driverName?: string;
  driverId?: string;
  driverPhone?: string;
  passengersTotal?: number;
  seatsRemaining?: number;
}

export interface OfficialSheetRow {
  rep: string;
  customer: string;
  idNumber: string;
  nationality: string;
  count: number;
  returnDay: string;
  hotel: string;
  roomType: string;
  roomNumber?: string;
  packageTotal?: number;
  extensionNights?: number;
  extensionTotal?: number;
  notes?: string;
}

export interface OfficialSheetInput {
  title?: string;
  header: OfficialSheetHeader;
  rows: OfficialSheetRow[];
  /** Institution logo (uploaded from site settings) — top-right of the sheet. */
  logoUrl?: string | null;
}

export const TABLE_COLUMNS = [
  "#",
  "المندوب",
  "العميل",
  "الهوية",
  "جنسية",
  "العدد",
  "العوده",
  "الفندق",
  "نوع الغرفه",
  "رقم الغرفه",
  "اجمالي الباقه",
  "ليالي التمديد",
  "اجمالي التمديد",
  "إجمالي",
  "ملاحظات",
] as const;

const COL_WIDTHS = [6, 20, 26, 18, 14, 8, 16, 18, 16, 12, 14, 12, 14, 14, 24];

export const ROOM_TYPES = [
  "فردي",
  "ثنائي",
  "ثلاثي",
  "رباعي",
  "خماسي",
  "رباعي مشترك",
  "خماسي مشترك",
  "مشترك مشرف",
] as const;

/* --------------------------- derived statistics -------------------------- */
export function hotelsOf(rows: OfficialSheetRow[]): string[] {
  return [...new Set(rows.map((r) => (r.hotel || "").trim()).filter(Boolean))];
}

/** People per room, used to convert passenger counts into room counts. */
export const ROOM_CAPACITY: Record<string, number> = {
  فردي: 1,
  ثنائي: 2,
  ثلاثي: 3,
  رباعي: 4,
  خماسي: 5,
  "رباعي مشترك": 4,
  "خماسي مشترك": 5,
  "مشترك مشرف": 4,
};

/** rooms matrix: room type × hotel → number of ROOMS (not people) */
export function roomsMatrix(rows: OfficialSheetRow[]) {
  const hotels = hotelsOf(rows);
  const people = new Map<string, Map<string, number>>();
  for (const rt of ROOM_TYPES) people.set(rt, new Map(hotels.map((h) => [h, 0])));
  for (const r of rows) {
    const rt = (r.roomType || "").trim();
    const h = (r.hotel || "").trim();
    if (!people.has(rt) || !h) continue;
    const inner = people.get(rt)!;
    inner.set(h, (inner.get(h) ?? 0) + (r.count || 0));
  }
  // Convert people → rooms using each room type's capacity.
  const matrix = new Map<string, Map<string, number>>();
  for (const rt of ROOM_TYPES) {
    const cap = ROOM_CAPACITY[rt] || 1;
    const inner = new Map<string, number>();
    for (const h of hotels) inner.set(h, Math.ceil((people.get(rt)?.get(h) ?? 0) / cap));
    matrix.set(rt, inner);
  }
  return { hotels, matrix, people };
}

/** total passengers per return day */
export function returnCounts(rows: OfficialSheetRow[]): Array<{ day: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = (r.returnDay || "").trim();
    if (!d) continue;
    m.set(d, (m.get(d) ?? 0) + (r.count || 0));
  }
  return [...m.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => b.count - a.count);
}

const rowTotal = (r: OfficialSheetRow) => (r.packageTotal ?? 0) + (r.extensionTotal ?? 0);

function rowValues(r: OfficialSheetRow, i: number): Array<string | number> {
  return [
    i + 1,
    r.rep ?? "",
    r.customer ?? "",
    r.idNumber ?? "",
    r.nationality ?? "",
    r.count ?? 0,
    r.returnDay ?? "",
    r.hotel ?? "",
    r.roomType ?? "",
    r.roomNumber ?? "",
    r.packageTotal ?? 0,
    r.extensionNights || "",
    r.extensionTotal || "",
    rowTotal(r),
    r.notes ?? "",
  ];
}

/* --------------------------------- Excel -------------------------------- */
const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
  bottom: { style: "thin" },
};

function put(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  o: { fill?: string; color?: string; size?: number; bold?: boolean; wrap?: boolean } = {},
) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.border = THIN;
  cell.font = {
    name: "Arial",
    size: o.size ?? 14,
    bold: o.bold ?? true,
    color: { argb: `FF${o.color ?? "000000"}` },
  };
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    readingOrder: "rtl",
    wrapText: o.wrap ?? true,
  };
  if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${o.fill}` } };
  return cell;
}

/** Fetch a logo image and return raw bytes + extension for embedding. */
async function loadLogo(
  url: string | null | undefined,
): Promise<{ buffer: ArrayBuffer; ext: "png" | "jpeg" } | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    const buffer = await res.arrayBuffer();
    const ext = /jpe?g/i.test(type) || /\.jpe?g($|\?)/i.test(url) ? "jpeg" : "png";
    return { buffer, ext };
  } catch {
    return null;
  }
}

export async function buildOfficialSheetWorkbook(input: OfficialSheetInput): Promise<Blob> {
  const C = SHEET_COLORS;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("نموذج", {
    views: [{ rightToLeft: true }],
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.2, right: 0.2, top: 0.3, bottom: 0.3, header: 0.1, footer: 0.1 },
    },
  });
  COL_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  // Header block rows only — data rows are left to auto-fit their font size.
  for (let r = 1; r <= 10; r++) ws.getRow(r).height = 24;

  const h = input.header;

  // Logo slot — merged block E1:H8.
  ws.mergeCells(1, 5, 8, 8);
  put(ws, 1, 5, "", { fill: C.cream });
  const logo = await loadLogo(input.logoUrl);
  if (logo) {
    const imgId = wb.addImage({ buffer: logo.buffer as ArrayBuffer, extension: logo.ext });
    // Stretch the logo across the whole merged E1:H8 block.
    ws.addImage(imgId, {
      tl: { col: 4, row: 0 },
      br: { col: 8, row: 8 },
      editAs: "oneCell",
    } as never);
  }

  // Title block
  ws.mergeCells(1, 1, 6, 2);
  put(ws, 1, 1, "كشف رحله", { fill: C.cream, color: C.darkRed, size: 28 });

  const merge2 = (r: number, c1: number, c2: number) => ws.mergeCells(r, c1, r, c2);

  merge2(1, 3, 4);
  put(ws, 1, 3, "ذهاب", { fill: C.cream, color: C.darkRed, size: 22 });
  merge2(2, 3, 4);
  put(ws, 2, 3, h.departureDate ?? "", { fill: C.cream, color: C.blue, size: 22 });
  merge2(3, 3, 4);
  put(ws, 3, 3, "عوده", { fill: C.cream, color: C.darkRed, size: 22 });
  merge2(4, 3, 4);
  put(ws, 4, 3, h.returnDate ?? "", { fill: C.cream, color: C.blue, size: 22 });
  put(ws, 5, 3, "بيان مركبه حمولة", { fill: C.lime, color: C.darkRed, size: 16 });
  put(ws, 5, 4, h.capacity ?? "", { fill: C.lime, color: C.darkRed, size: 18 });
  merge2(6, 3, 4);
  put(ws, 6, 3, h.transportCompany ?? "", { fill: C.lime, color: C.darkRed, size: 16 });

  ws.mergeCells(7, 1, 10, 1);
  put(ws, 7, 1, "باص", { fill: C.lightBlue, color: C.darkRed, size: 20 });
  ws.mergeCells(7, 2, 10, 2);
  put(ws, 7, 2, h.busNumber ?? "", { fill: C.lightBlue, color: C.darkRed, size: 34 });

  const driverPairs: Array<[string, ExcelJS.CellValue]> = [
    ["السائق", h.driverName ?? ""],
    ["لوحه", h.plate ?? ""],
    ["هويته", h.driverId ?? ""],
    ["ت", h.driverPhone ?? ""],
  ];
  driverPairs.forEach(([k, v], i) => {
    put(ws, 7 + i, 3, k, { fill: C.lightBlue, color: C.darkRed, size: 18 });
    put(ws, 7 + i, 4, v, { fill: C.lightBlue, size: 16 });
  });

  ws.mergeCells(9, 5, 10, 5);
  put(ws, 9, 5, "عدد الركاب", { fill: C.cyan, color: C.blue, size: 16 });
  ws.mergeCells(9, 6, 10, 6);
  put(ws, 9, 6, h.passengersTotal ?? 0, { fill: C.cyan, color: C.blue, size: 32 });
  ws.mergeCells(9, 7, 10, 7);
  put(ws, 9, 7, "متبقي", { fill: C.pink, color: C.red, size: 16 });
  ws.mergeCells(9, 8, 10, 8);
  put(ws, 9, 8, h.seatsRemaining ?? "", { fill: C.pink, color: C.red, size: 32 });

  // Rooms summary (columns I..N)
  const { hotels, matrix } = roomsMatrix(input.rows);
  const roomsCols = [...hotels, "الإجمالي"];
  ws.mergeCells(1, 9, 1, 10);
  put(ws, 1, 9, "الغرف / الفندق", { fill: C.roomsTable, color: C.darkRed, size: 14 });
  roomsCols.forEach((name, i) => put(ws, 1, 11 + i, name, { fill: C.roomsTable, color: C.darkRed, size: 13 }));
  ROOM_TYPES.forEach((rt, ri) => {
    const r = 2 + ri;
    ws.mergeCells(r, 9, r, 10);
    put(ws, r, 9, rt, { fill: C.roomsTable, color: C.darkRed, size: 13 });
    let sum = 0;
    hotels.forEach((hotel, ci) => {
      const v = matrix.get(rt)?.get(hotel) ?? 0;
      sum += v;
      put(ws, r, 11 + ci, v || "", { fill: C.roomsTable, size: 13 });
    });
    put(ws, r, 11 + hotels.length, sum || "", { fill: C.roomsTable, color: C.darkRed, size: 13 });
  });
  {
    const r = 10;
    ws.mergeCells(r, 9, r, 10);
    put(ws, r, 9, "اجمالي", { fill: C.roomsTable, color: C.darkRed, size: 13 });
    let grand = 0;
    hotels.forEach((hotel, ci) => {
      let s = 0;
      for (const rt of ROOM_TYPES) s += matrix.get(rt)?.get(hotel) ?? 0;
      grand += s;
      put(ws, r, 11 + ci, s || "", { fill: C.roomsTable, color: C.darkRed, size: 13 });
    });
    put(ws, r, 11 + hotels.length, grand || "", { fill: C.roomsTable, color: C.darkRed, size: 13 });
  }

  // Return-day statistics (columns O..P)
  const rc = returnCounts(input.rows).slice(0, 2);
  rc.forEach((entry, i) => {
    const base = 1 + i * 5;
    ws.mergeCells(base, 15, base, 15);
    put(ws, base, 15, "اعداد عودة يوم:", { color: C.red, size: 14 });
    put(ws, base + 1, 15, entry.day, { fill: C.pink, color: C.red, size: 16 });
    put(ws, base + 2, 15, entry.count, { fill: C.pink, color: C.red, size: 30 });
  });

  // Passengers table — dynamic, one row per booking
  const HEAD = 11;
  TABLE_COLUMNS.forEach((c, i) =>
    put(ws, HEAD, i + 1, c, { fill: C.cream, color: C.darkRed, size: 12 }),
  );
  ws.getRow(HEAD).height = 24;

  // Only long free-text columns wrap; the rest stay single-line so Excel can
  // auto-fit the row height to the real font size instead of a fixed height.
  const WRAP_COLS = new Set([3, 15]);
  input.rows.forEach((r, i) => {
    const values = rowValues(r, i);
    values.forEach((v, ci) =>
      put(ws, HEAD + 1 + i, ci + 1, v as ExcelJS.CellValue, {
        size: 11,
        bold: false,
        wrap: WRAP_COLS.has(ci + 1),
      }),
    );
  });

  const lastRow = HEAD + input.rows.length;
  const totalsRow = lastRow + 1;
  const sum = (pick: (r: OfficialSheetRow) => number) => input.rows.reduce((s, r) => s + (pick(r) || 0), 0);
  const totals: Array<[number, ExcelJS.CellValue]> = [
    [1, "الإجمالي"],
    [6, sum((r) => r.count)],
    [11, sum((r) => r.packageTotal ?? 0)],
    [13, sum((r) => r.extensionTotal ?? 0)],
    [14, sum(rowTotal)],
  ];
  for (let c = 1; c <= TABLE_COLUMNS.length; c++) {
    const hit = totals.find(([col]) => col === c);
    put(ws, totalsRow, c, hit ? hit[1] : "", { fill: C.cream, color: C.darkRed, size: 14 });
  }

  ws.pageSetup.printArea = `A1:O${totalsRow}`;
  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ---------------------------------- PDF --------------------------------- */
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

interface GridCell {
  r: number;
  c: number;
  rs?: number;
  cs?: number;
  v: string;
  cls?: string;
  style?: string;
}

/** Emit a header table that mirrors the Excel sheet cell-for-cell. */
function headerGrid(cells: GridCell[], rows: number, cols: number): string {
  const covered = new Set<string>();
  for (const cell of cells) {
    for (let r = cell.r; r < cell.r + (cell.rs ?? 1); r++)
      for (let c = cell.c; c < cell.c + (cell.cs ?? 1); c++)
        if (r !== cell.r || c !== cell.c) covered.add(`${r}:${c}`);
  }
  const at = new Map(cells.map((c) => [`${c.r}:${c.c}`, c]));
  let html = "";
  for (let r = 1; r <= rows; r++) {
    html += "<tr>";
    for (let c = 1; c <= cols; c++) {
      if (covered.has(`${r}:${c}`)) continue;
      const cell = at.get(`${r}:${c}`);
      if (!cell) {
        html += `<td class="blank"></td>`;
        continue;
      }
      const span = `${cell.rs && cell.rs > 1 ? ` rowspan="${cell.rs}"` : ""}${
        cell.cs && cell.cs > 1 ? ` colspan="${cell.cs}"` : ""
      }`;
      html += `<td class="${cell.cls ?? ""}"${span} style="${cell.style ?? ""}">${cell.v}</td>`;
    }
    html += "</tr>";
  }
  return html;
}

/** Columns hidden in the "كشف التفويج" variant: rep + all money columns. */
const TAFWEEJ_HIDDEN = new Set([1, 10, 12, 13]);

export function printOfficialSheet(input: OfficialSheetInput, variant: "full" | "tafweej" = "full"): boolean {
  const C = SHEET_COLORS;
  const h = input.header;
  const { hotels, matrix } = roomsMatrix(input.rows);
  const rc = returnCounts(input.rows).slice(0, 2);
  const sum = (pick: (r: OfficialSheetRow) => number) => input.rows.reduce((s, r) => s + (pick(r) || 0), 0);
  const hidden = variant === "tafweej" ? TAFWEEJ_HIDDEN : new Set<number>();
  const keep = TABLE_COLUMNS.map((_, i) => i).filter((i) => !hidden.has(i));

  const COLS = TABLE_COLUMNS.length; // 15

  const cells: GridCell[] = [
    { r: 1, c: 1, rs: 6, cs: 2, v: "كشف رحله", cls: "cream red", style: "font-size:26px" },
    { r: 1, c: 3, cs: 2, v: "ذهاب", cls: "cream red", style: "font-size:17px" },
    { r: 2, c: 3, cs: 2, v: esc(h.departureDate), cls: "cream val", style: "font-size:17px" },
    { r: 3, c: 3, cs: 2, v: "عوده", cls: "cream red", style: "font-size:17px" },
    { r: 4, c: 3, cs: 2, v: esc(h.returnDate), cls: "cream val", style: "font-size:17px" },
    { r: 5, c: 3, v: "بيان مركبه حمولة", cls: "lime", style: "font-size:12px" },
    { r: 5, c: 4, v: esc(h.capacity), cls: "lime", style: "font-size:14px" },
    { r: 6, c: 3, cs: 2, v: esc(h.transportCompany), cls: "lime", style: "font-size:13px" },
    // Logo block E1:H8
    {
      r: 1,
      c: 5,
      rs: 8,
      cs: 4,
      v: input.logoUrl ? `<img class="logoimg" src="${esc(input.logoUrl)}" alt="">` : "",
      cls: "cream logocell",
    },
    { r: 7, c: 1, rs: 4, v: "باص", cls: "lblue", style: "font-size:18px" },
    { r: 7, c: 2, rs: 4, v: esc(h.busNumber), cls: "lblue", style: "font-size:30px" },
    { r: 7, c: 3, v: "السائق", cls: "lblue", style: "font-size:14px" },
    { r: 7, c: 4, v: esc(h.driverName), cls: "lblue", style: "font-size:13px" },
    { r: 8, c: 3, v: "لوحه", cls: "lblue", style: "font-size:14px" },
    { r: 8, c: 4, v: esc(h.plate), cls: "lblue", style: "font-size:13px" },
    { r: 9, c: 3, v: "هويته", cls: "lblue", style: "font-size:14px" },
    { r: 9, c: 4, v: esc(h.driverId), cls: "lblue", style: "font-size:13px" },
    { r: 10, c: 3, v: "ت", cls: "lblue", style: "font-size:14px" },
    { r: 10, c: 4, v: esc(h.driverPhone), cls: "lblue", style: "font-size:13px" },
    { r: 9, c: 5, rs: 2, v: "عدد الركاب", cls: "cyan", style: "font-size:13px" },
    { r: 9, c: 6, rs: 2, v: esc(h.passengersTotal ?? 0), cls: "cyan", style: "font-size:26px" },
    { r: 9, c: 7, rs: 2, v: "متبقي", cls: "pink", style: "font-size:13px" },
    { r: 9, c: 8, rs: 2, v: esc(h.seatsRemaining ?? ""), cls: "pink", style: "font-size:26px" },
  ];

  // Rooms summary (I1:N10) — number of ROOMS per hotel.
  const roomsCols = [...hotels, "الإجمالي"];
  cells.push({ r: 1, c: 9, cs: 2, v: "الغرف / الفندق", cls: "rooms red", style: "font-size:11px" });
  roomsCols.forEach((name, i) => {
    if (11 + i > COLS - 1) return;
    cells.push({ r: 1, c: 11 + i, v: esc(name), cls: "rooms red", style: "font-size:10px" });
  });
  ROOM_TYPES.forEach((rt, ri) => {
    const r = 2 + ri;
    cells.push({ r, c: 9, cs: 2, v: esc(rt), cls: "rooms red", style: "font-size:10px" });
    let s = 0;
    hotels.forEach((hotel, ci) => {
      const v = matrix.get(rt)?.get(hotel) ?? 0;
      s += v;
      if (11 + ci > COLS - 1) return;
      cells.push({ r, c: 11 + ci, v: String(v || ""), cls: "rooms", style: "font-size:10px" });
    });
    if (11 + hotels.length <= COLS - 1)
      cells.push({ r, c: 11 + hotels.length, v: String(s || ""), cls: "rooms red", style: "font-size:10px" });
  });
  {
    const r = 10;
    cells.push({ r, c: 9, cs: 2, v: "اجمالي", cls: "rooms red", style: "font-size:10px" });
    let grand = 0;
    hotels.forEach((hotel, ci) => {
      let s = 0;
      for (const rt of ROOM_TYPES) s += matrix.get(rt)?.get(hotel) ?? 0;
      grand += s;
      if (11 + ci > COLS - 1) return;
      cells.push({ r, c: 11 + ci, v: String(s || ""), cls: "rooms red", style: "font-size:10px" });
    });
    if (11 + hotels.length <= COLS - 1)
      cells.push({ r, c: 11 + hotels.length, v: String(grand || ""), cls: "rooms red", style: "font-size:10px" });
  }

  // Return-day statistics (column O)
  rc.forEach((entry, i) => {
    const base = 1 + i * 5;
    cells.push({ r: base, c: 15, v: "اعداد عودة يوم:", cls: "red", style: "font-size:10px" });
    cells.push({ r: base + 1, c: 15, v: esc(entry.day), cls: "pink", style: "font-size:12px" });
    cells.push({ r: base + 2, c: 15, v: String(entry.count), cls: "pink", style: "font-size:22px" });
  });

  const headerHtml = headerGrid(cells, 10, COLS);
  const totalW = COL_WIDTHS.reduce((a, b) => a + b, 0);
  const colgroup = COL_WIDTHS.map((w) => `<col style="width:${((w / totalW) * 100).toFixed(2)}%">`).join("");
  const keptW = keep.reduce((a, i) => a + COL_WIDTHS[i], 0);
  const mainColgroup = keep
    .map((i) => `<col style="width:${((COL_WIDTHS[i] / keptW) * 100).toFixed(2)}%">`)
    .join("");

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(input.title ?? (variant === "tafweej" ? "كشف التفويج" : "كشف رحله"))}</title>

<style>
  @page { size: A4 landscape; margin: 6mm; }
  html, body { width: 285mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color:#000; margin:0;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { border-collapse:collapse; width:100%; table-layout:fixed; }
  th, td { border:1px solid #333; padding:1px 3px; text-align:center; line-height:1.15;
           vertical-align:middle; font-weight:800; overflow:hidden; }
  .cream { background:#${C.cream}; }
  .lime { background:#${C.lime}; color:#${C.darkRed}; }
  .lblue { background:#${C.lightBlue}; color:#${C.darkRed}; }
  .cyan { background:#${C.cyan}; color:#${C.blue}; }
  .pink { background:#${C.pink}; color:#${C.red}; }
  .rooms { background:#${C.roomsTable}; }
  .red { color:#${C.darkRed}; }
  .val { color:#${C.blue}; }
  .blank { border:none; background:transparent; }
  table.head td { height:20px; }
  .logocell { padding:0; height:100%; }
  .logoimg { width:100%; height:100%; min-height:150px; object-fit:contain; display:block; }
  table.main { font-size:11px; margin-top:4px; }
  table.main thead th { background:#${C.cream}; color:#${C.darkRed}; font-size:12px; }
  table.main tfoot td { background:#${C.cream}; color:#${C.darkRed}; }
  thead { display:table-header-group; }
</style></head><body>
<table class="head"><colgroup>${colgroup}</colgroup><tbody>${headerHtml}</tbody></table>

<table class="main"><colgroup>${mainColgroup}</colgroup>
  <thead><tr>${keep.map((i) => `<th>${esc(TABLE_COLUMNS[i])}</th>`).join("")}</tr></thead>
  <tbody>
    ${input.rows
      .map((r, i) => {
        const vals = rowValues(r, i);
        return `<tr>${keep.map((ci) => `<td>${esc(vals[ci])}</td>`).join("")}</tr>`;
      })
      .join("")}
  </tbody>
  <tfoot><tr>${(() => {
    const f: Array<string | number> = new Array(TABLE_COLUMNS.length).fill("");
    f[0] = "الإجمالي";
    f[5] = sum((r) => r.count);
    f[10] = sum((r) => r.packageTotal ?? 0);
    f[12] = sum((r) => r.extensionTotal ?? 0);
    f[13] = sum(rowTotal);
    return keep.map((ci) => `<td>${esc(f[ci])}</td>`).join("");
  })()}</tr></tfoot>
</table>

<script>window.onload=()=>{window.focus();setTimeout(()=>window.print(),350);}</script>
</body></html>`;

  return openPrintWindow(html);
}

function openPrintWindow(html: string): boolean {
  const w = window.open("", "_blank", "width=1400,height=900");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

/* ------------------------------ raw exports ------------------------------ */
/** Plain single-header data table — no template colours, merges or big fonts. */
function rawRows(input: OfficialSheetInput) {
  return input.rows.map((r, i) => rowValues(r, i));
}

export async function buildRawWorkbook(input: OfficialSheetInput): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("البيانات", { views: [{ rightToLeft: true }] });
  ws.addRow([...TABLE_COLUMNS]);
  ws.getRow(1).font = { bold: true, size: 11 };
  for (const values of rawRows(input)) ws.addRow(values);
  const sum = (pick: (r: OfficialSheetRow) => number) => input.rows.reduce((s, r) => s + (pick(r) || 0), 0);
  const totals: Array<string | number> = new Array(TABLE_COLUMNS.length).fill("");
  totals[0] = "الإجمالي";
  totals[5] = sum((r) => r.count);
  totals[10] = sum((r) => r.packageTotal ?? 0);
  totals[12] = sum((r) => r.extensionTotal ?? 0);
  totals[13] = sum(rowTotal);
  const totalsRow = ws.addRow(totals);
  totalsRow.font = { bold: true, size: 11 };
  COL_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = Math.max(8, Math.round(w * 0.8))));
  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function printRawSheet(input: OfficialSheetInput): boolean {
  const sum = (pick: (r: OfficialSheetRow) => number) => input.rows.reduce((s, r) => s + (pick(r) || 0), 0);
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(input.title ?? "بيانات كشف الرحلة")}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: Tahoma, Arial, sans-serif; color:#000; margin:0; font-size:11px; }
  h1 { font-size:14px; margin:0 0 6px; }
  table { border-collapse:collapse; width:100%; }
  th, td { border:1px solid #999; padding:2px 4px; text-align:center; line-height:1.2; }
  thead th { background:#eee; font-weight:700; }
  tfoot td { font-weight:700; }
  thead { display:table-header-group; }
</style></head><body>
<h1>${esc(input.title ?? "بيانات كشف الرحلة")}</h1>
<table>
  <thead><tr>${TABLE_COLUMNS.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
  <tbody>
    ${input.rows
      .map((r, i) => `<tr>${rowValues(r, i).map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`)
      .join("")}
  </tbody>
  <tfoot><tr>
    <td>الإجمالي</td><td></td><td></td><td></td><td></td>
    <td>${sum((r) => r.count)}</td><td></td><td></td><td></td><td></td>
    <td>${sum((r) => r.packageTotal ?? 0)}</td><td></td>
    <td>${sum((r) => r.extensionTotal ?? 0)}</td>
    <td>${sum(rowTotal)}</td><td></td>
  </tr></tfoot>
</table>
<script>window.onload=()=>{window.focus();setTimeout(()=>window.print(),250);}</script>
</body></html>`;
  return openPrintWindow(html);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
