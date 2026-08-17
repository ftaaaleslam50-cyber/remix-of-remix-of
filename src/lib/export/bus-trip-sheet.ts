// "كشف رحله" — bus trip sheet export (Excel + PDF + كشف التفويج).
//
// The uploaded workbook (نموذج الحافلة) is used ONLY as a layout reference:
// column order, header block, table shape and the financial summary row.
// Every value (hotels, room types, passengers, prices, extension prices)
// comes from the live site database / current pricing system — never from the
// static numbers of the reference file.
import ExcelJS from "exceljs";

export const SHEET_COLUMNS = [
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
  "باقة الفرد",
] as const;

/** Columns dropped in the "كشف التفويج" (manifest) variant. */
const MANIFEST_HIDDEN = new Set(["اجمالي الباقه", "اجمالي التمديد", "إجمالي", "باقة الفرد"]);

export const COLUMN_WIDTHS = [7, 20, 28, 18, 14, 8, 16, 18, 16, 12, 14, 12, 14, 14, 26, 12];

export interface BusSheetHeader {
  title?: string;
  departureLabel?: string;
  departureDay?: string;
  departureDate?: string;
  returnLabel?: string;
  returnDay?: string;
  returnDate?: string;
  capacity?: number;
  vehicleType?: string;
  busName?: string;
  plate?: string;
  driverName?: string;
  driverId?: string;
  driverPhone?: string;
  transportCompany?: string;
  passengersTotal?: number;
  seatsRemaining?: number;
}

export interface BusSheetRow {
  index: number;
  rep: string;
  customer: string;
  idNumber: string;
  nationality: string;
  count: number;
  returnDay: string;
  hotel: string;
  roomType: string;
  roomNumber?: string;
  /** hotel package total (site pricing × passengers) */
  packageTotal: number;
  extensionNights: number;
  /** extension price (site) × nights × passengers */
  extensionTotal: number;
  notes?: string;
  /** per-person package price from the current pricing system */
  perPerson: number;
}

export interface BusSheetSummary {
  expenses: number;
  bankTransfer: number;
}

export interface BusSheetInput {
  header: BusSheetHeader;
  rows: BusSheetRow[];
  summary: BusSheetSummary;
  /** drop financial columns and the settlement row */
  manifest?: boolean;
}

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
  bottom: { style: "thin" },
};

const HEAD_FILL = "FFDBE5F1";
const LABEL_FILL = "FFF2F2F2";

function box(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  opts: { bold?: boolean; fill?: string; size?: number } = {},
) {
  cell.value = value;
  cell.border = THIN;
  cell.font = { name: "Arial", size: opts.size ?? 10, bold: opts.bold ?? false };
  cell.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl", wrapText: true };
  if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
}

function visibleColumns(manifest?: boolean) {
  return SHEET_COLUMNS.map((c, i) => ({ name: c, width: COLUMN_WIDTHS[i] })).filter(
    (c) => !(manifest && MANIFEST_HIDDEN.has(c.name)),
  );
}

function rowValues(r: BusSheetRow): Record<string, string | number> {
  return {
    "#": r.index,
    المندوب: r.rep,
    العميل: r.customer,
    الهوية: r.idNumber,
    جنسية: r.nationality,
    العدد: r.count,
    العوده: r.returnDay,
    الفندق: r.hotel,
    "نوع الغرفه": r.roomType,
    "رقم الغرفه": r.roomNumber ?? "",
    "اجمالي الباقه": r.packageTotal,
    "ليالي التمديد": r.extensionNights || "",
    "اجمالي التمديد": r.extensionTotal || "",
    إجمالي: r.packageTotal + r.extensionTotal,
    ملاحظات: r.notes ?? "",
    "باقة الفرد": r.perPerson,
  };
}

export async function buildBusTripSheetWorkbook(input: BusSheetInput): Promise<Blob> {
  const cols = visibleColumns(input.manifest);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(input.manifest ? "كشف التفويج" : "نموذج", {
    views: [{ rightToLeft: true }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));

  const h = input.header;
  const lastCol = cols.length;
  const colLetter = (i: number) => ws.getColumn(i).letter;

  // ---- header block (rows 1..10 of the reference layout) -----------------
  ws.mergeCells(1, 1, 6, 2);
  box(ws.getCell(1, 1), input.manifest ? "كشف التفويج" : "كشف رحله", { bold: true, size: 20, fill: HEAD_FILL });

  const pairs: Array<[string, ExcelJS.CellValue]> = [
    [h.departureLabel || "ذهاب", `${h.departureDay ?? ""} ${h.departureDate ?? ""}`.trim()],
    [h.returnLabel || "عوده", `${h.returnDay ?? ""} ${h.returnDate ?? ""}`.trim()],
    ["بيان مركبه حمولة", h.capacity ?? ""],
    ["شركة النقل", h.transportCompany ?? ""],
    ["نوع المركبه", `${h.vehicleType ?? ""}${h.busName ? ` — ${h.busName}` : ""}`],
    ["لوحه", h.plate ?? ""],
    ["السائق", h.driverName ?? ""],
    ["هويته", h.driverId ?? ""],
    ["جواله", h.driverPhone ?? ""],
    ["عدد الركاب", h.passengersTotal ?? 0],
    ["متبقي", h.seatsRemaining ?? ""],
  ];
  pairs.forEach(([k, v], i) => {
    const r = i + 1;
    box(ws.getCell(r, 3), k, { bold: true, fill: LABEL_FILL });
    box(ws.getCell(r, 4), v);
  });

  const headerRow = pairs.length + 2; // one blank spacer row

  // ---- passengers table --------------------------------------------------
  cols.forEach((c, i) => box(ws.getCell(headerRow, i + 1), c.name, { bold: true, fill: HEAD_FILL }));
  ws.getRow(headerRow).height = 26;

  const firstData = headerRow + 1;
  input.rows.forEach((r, ri) => {
    const values = rowValues(r);
    const rowNumber = firstData + ri;
    cols.forEach((c, ci) => {
      const cell = ws.getCell(rowNumber, ci + 1);
      if (!input.manifest && c.name === "إجمالي") {
        const k = colLetter(cols.findIndex((x) => x.name === "اجمالي الباقه") + 1);
        const m = colLetter(cols.findIndex((x) => x.name === "اجمالي التمديد") + 1);
        box(cell, { formula: `IFERROR(N(${k}${rowNumber}),0)+IFERROR(N(${m}${rowNumber}),0)` }, { bold: true });
      } else {
        box(cell, values[c.name] as ExcelJS.CellValue, { bold: c.name === "اجمالي الباقه" });
      }
    });
  });

  const lastData = firstData + Math.max(input.rows.length, 1) - 1;

  // ---- totals row --------------------------------------------------------
  const totalsRow = lastData + 1;
  cols.forEach((c, ci) => {
    const letter = colLetter(ci + 1);
    const isNumeric = ["العدد", "اجمالي الباقه", "اجمالي التمديد", "إجمالي"].includes(c.name);
    box(
      ws.getCell(totalsRow, ci + 1),
      ci === 0
        ? "الإجمالي"
        : isNumeric && input.rows.length
          ? ({ formula: `SUM(${letter}${firstData}:${letter}${lastData})` } as ExcelJS.CellValue)
          : "",
      { bold: true, fill: LABEL_FILL },
    );
  });

  // ---- financial settlement row (reference row 46) -----------------------
  if (!input.manifest) {
    const r = totalsRow + 2;
    const totalIdx = cols.findIndex((x) => x.name === "إجمالي") + 1;
    const revenueRef = `${colLetter(totalIdx)}${totalsRow}`;
    const put = (col: number, label: string, value: ExcelJS.CellValue) => {
      box(ws.getCell(r, col), label, { bold: true, fill: LABEL_FILL });
      box(ws.getCell(r, col + 1), value, { bold: true });
    };
    // laid out right-to-left like the reference: revenue → expenses → net → bank → cash
    put(1, "اجمالي ايراد محقق", { formula: revenueRef });
    put(3, "مصروفات الرحله", input.summary.expenses);
    put(5, "صافي ايراد مطلوب", { formula: `${colLetter(2)}${r}-${colLetter(4)}${r}` });
    put(7, "مدفوع تحويل بنكي", input.summary.bankTransfer);
    put(9, "مطلوب من المشرف كاش", { formula: `${colLetter(6)}${r}-${colLetter(8)}${r}` });
  }

  ws.pageSetup.printArea = `A1:${colLetter(lastCol)}${totalsRow + 3}`;

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Print-to-PDF version with the exact same layout and data. */
export function printBusTripSheet(input: BusSheetInput, title: string): boolean {
  const cols = visibleColumns(input.manifest);
  const esc = (v: unknown) =>
    String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const h = input.header;
  const revenue = input.rows.reduce((s, r) => s + r.packageTotal + r.extensionTotal, 0);
  const net = revenue - input.summary.expenses;
  const cash = net - input.summary.bankTransfer;

  const meta: Array<[string, unknown]> = [
    [h.departureLabel || "ذهاب", `${h.departureDay ?? ""} ${h.departureDate ?? ""}`],
    [h.returnLabel || "عوده", `${h.returnDay ?? ""} ${h.returnDate ?? ""}`],
    ["بيان مركبه حمولة", h.capacity],
    ["شركة النقل", h.transportCompany],
    ["نوع المركبه", `${h.vehicleType ?? ""}${h.busName ? ` — ${h.busName}` : ""}`],
    ["لوحه", h.plate],
    ["السائق", h.driverName],
    ["هويته", h.driverId],
    ["جواله", h.driverPhone],
    ["عدد الركاب", h.passengersTotal],
    ["متبقي", h.seatsRemaining],
  ];

  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color:#111; }
  h1 { font-size:20px; text-align:center; margin:0 0 8px; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th, td { border:1px solid #444; padding:3px 4px; text-align:center; }
  thead th { background:#dbe5f1; font-weight:700; }
  .meta { margin-bottom:8px; font-size:10px; }
  .meta td.k { background:#f2f2f2; font-weight:700; }
  tfoot td { background:#f2f2f2; font-weight:700; }
</style></head><body>
<h1>${esc(title)}</h1>
<table class="meta"><tbody>${[0, 1, 2]
    .map(
      (rowIdx) =>
        `<tr>${meta
          .slice(rowIdx * 4, rowIdx * 4 + 4)
          .map(([k, v]) => `<td class="k">${esc(k)}</td><td>${esc(v)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody></table>
<table>
  <thead><tr>${cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead>
  <tbody>${input.rows
    .map((r) => {
      const v = rowValues(r);
      return `<tr>${cols.map((c) => `<td>${esc(v[c.name])}</td>`).join("")}</tr>`;
    })
    .join("")}</tbody>
  <tfoot><tr>${cols
    .map((c) => {
      if (c.name === "#") return `<td>الإجمالي</td>`;
      if (c.name === "العدد") return `<td>${input.rows.reduce((s, r) => s + r.count, 0)}</td>`;
      if (c.name === "اجمالي الباقه") return `<td>${input.rows.reduce((s, r) => s + r.packageTotal, 0)}</td>`;
      if (c.name === "اجمالي التمديد") return `<td>${input.rows.reduce((s, r) => s + r.extensionTotal, 0)}</td>`;
      if (c.name === "إجمالي") return `<td>${revenue}</td>`;
      return "<td></td>";
    })
    .join("")}</tr></tfoot>
</table>
${
  input.manifest
    ? ""
    : `<table class="meta" style="margin-top:8px"><tbody><tr>
  <td class="k">اجمالي ايراد محقق</td><td>${revenue}</td>
  <td class="k">مصروفات الرحله</td><td>${input.summary.expenses}</td>
  <td class="k">صافي ايراد مطلوب</td><td>${net}</td>
  <td class="k">مدفوع تحويل بنكي</td><td>${input.summary.bankTransfer}</td>
  <td class="k">مطلوب من المشرف كاش</td><td>${cash}</td>
</tr></tbody></table>`
}
<script>window.onload=()=>{window.focus();window.print();}</script>
</body></html>`;

  const w = window.open("", "_blank", "width=1200,height=800");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
