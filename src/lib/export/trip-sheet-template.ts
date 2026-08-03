// Template-driven trip sheet export.
//
// The official Excel template is NEVER re-created from scratch: we open the
// original workbook with ExcelJS and only replace cell VALUES. All styles,
// borders, fonts, merges, column widths, row heights, images, print setup,
// page breaks and formulas stay untouched.
import ExcelJS from "exceljs";
import templateAsset from "@/assets/trip-sheet-template.xlsx.asset.json";

export interface TripSheetTemplate {
  id: string;
  name: string;
  url: string;
  /** Worksheets that hold trip data (the "#" sheet is reference data). */
  dataSheets: string[];
  headerRow: number;
  firstDataRow: number;
  lastDataRow: number;
}

// Registry — add new templates here (Makkah / Madinah / VIP / big bus ...)
// without touching the export code itself.
export const TRIP_SHEET_TEMPLATES: TripSheetTemplate[] = [
  {
    id: "taybah-default",
    name: "قالب طيبة الرسمي",
    url: templateAsset.url,
    dataSheets: ["1-8", "3-8"],
    headerRow: 11,
    firstDataRow: 12,
    lastDataRow: 40,
  },
];

export function getTemplate(id?: string): TripSheetTemplate {
  return TRIP_SHEET_TEMPLATES.find((t) => t.id === id) ?? TRIP_SHEET_TEMPLATES[0];
}

export interface TripSheetHeader {
  departureLabel?: string; // C1 - نوع الرحلة (ذهاب)
  departureDay?: string; // D1
  departureDate?: string; // C2
  returnLabel?: string; // C3
  returnDay?: string; // D3
  returnDate?: string; // C4
  capacity?: number; // D5
  transportCompany?: string; // C6
  busNumber?: string | number; // B7
  plate?: string; // D7
  driverName?: string; // D8
  driverId?: string; // D9
  driverPhone?: string; // D10
  passengersTotal?: number; // F9 (only if not a formula)
  seatsRemaining?: number; // H9 (only if not a formula)
}

export interface TripSheetRow {
  index: number; // A - م
  rep: string; // B - المندوب
  customer: string; // C - العميل
  idNumber: string; // D - الهوية / الجواز
  nationality: string; // E - الجنسية
  count: number; // F - عدد الأفراد
  returnDay: string; // G - العودة
  hotel: string; // H - الفندق
  roomType: string; // I - نوع الغرفة
  total: number; // J - إجمالي الباقة (formula preserved when present)
  notes?: string;
}

const DATA_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"] as const;

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function dayNameFromDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return AR_DAYS[d.getDay()];
}

/** Shift unanchored row references of an A1 formula from `from` to `to`. */
function shiftFormula(formula: string, from: number, to: number): string {
  if (from === to) return formula;
  return formula.replace(/(\$?[A-Za-z]{1,3})(\$?)(\d+)/g, (m, col: string, dollar: string, row: string) => {
    if (dollar === "$") return m;
    if (Number(row) !== from) return m;
    return `${col}${to}`;
  });
}

function setValue(cell: ExcelJS.Cell, value: unknown) {
  if (value === undefined || value === null || value === "") return;
  // Never destroy an existing formula (e.g. F9 / H9 / column J totals).
  const current = cell.value as ExcelJS.CellValue;
  if (current && typeof current === "object" && "formula" in (current as object)) return;
  cell.value = value as ExcelJS.CellValue;
}

export interface FillOptions {
  templateId?: string;
  sheetName?: string;
  header: TripSheetHeader;
  rows: TripSheetRow[];
}

export async function buildTripSheetWorkbook(opts: FillOptions): Promise<Blob> {
  const tpl = getTemplate(opts.templateId);
  const res = await fetch(tpl.url);
  if (!res.ok) throw new Error("تعذر تحميل قالب الإكسل");
  const buf = await res.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  const sheetName = opts.sheetName && wb.getWorksheet(opts.sheetName) ? opts.sheetName : tpl.dataSheets[0];
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error("لم يتم العثور على ورقة العمل داخل القالب");

  const h = opts.header;
  setValue(ws.getCell("C1"), h.departureLabel);
  setValue(ws.getCell("D1"), h.departureDay);
  setValue(ws.getCell("C2"), h.departureDate);
  setValue(ws.getCell("C3"), h.returnLabel);
  setValue(ws.getCell("D3"), h.returnDay);
  setValue(ws.getCell("C4"), h.returnDate);
  setValue(ws.getCell("D5"), h.capacity);
  setValue(ws.getCell("C6"), h.transportCompany);
  setValue(ws.getCell("B7"), h.busNumber);
  setValue(ws.getCell("D7"), h.plate);
  setValue(ws.getCell("D8"), h.driverName);
  setValue(ws.getCell("D9"), h.driverId);
  setValue(ws.getCell("D10"), h.driverPhone);
  setValue(ws.getCell("F9"), h.passengersTotal);
  setValue(ws.getCell("H9"), h.seatsRemaining);

  // ---- passengers table -------------------------------------------------
  const first = tpl.firstDataRow;
  const last = tpl.lastDataRow;

  // Snapshot of the template row used as the style/formula source when the
  // passenger list is longer than the rows shipped inside the template.
  const sourceRowNumber = last;
  const sourceRow = ws.getRow(sourceRowNumber);
  const sourceStyles = DATA_COLS.map((c) => ({ ...ws.getCell(`${c}${sourceRowNumber}`).style }));
  const sourceHeight = sourceRow.height;

  // Formula patterns taken from the first data row (kept per column).
  const formulaPatterns: Record<string, string | undefined> = {};
  for (const c of DATA_COLS) {
    const v = ws.getCell(`${c}${first}`).value as ExcelJS.CellValue;
    if (v && typeof v === "object" && "formula" in (v as object)) {
      formulaPatterns[c] = (v as ExcelJS.CellFormulaValue).formula;
    }
  }

  const values: Array<Array<string | number>> = opts.rows.map((r) => [
    r.index,
    r.rep,
    r.customer,
    r.idNumber,
    r.nationality,
    r.count,
    r.returnDay,
    r.hotel,
    r.roomType,
    r.total,
  ]);

  values.forEach((rowValues, i) => {
    const rowNumber = first + i;
    if (rowNumber > last) {
      // Clone the last template row: styles, height and formulas.
      const row = ws.getRow(rowNumber);
      row.height = sourceHeight;
      DATA_COLS.forEach((c, ci) => {
        ws.getCell(`${c}${rowNumber}`).style = { ...sourceStyles[ci] };
      });
    }
    DATA_COLS.forEach((c, ci) => {
      const cell = ws.getCell(`${c}${rowNumber}`);
      const pattern = formulaPatterns[c];
      if (pattern) {
        cell.value = { formula: shiftFormula(pattern, first, rowNumber) } as ExcelJS.CellFormulaValue;
      } else {
        cell.value = rowValues[ci] as ExcelJS.CellValue;
      }
    });
    ws.getRow(rowNumber).commit?.();
  });

  // Clear leftover template rows (values only — styles/formulas untouched).
  for (let r = first + values.length; r <= last; r++) {
    DATA_COLS.forEach((c) => {
      const cell = ws.getCell(`${c}${r}`);
      const v = cell.value as ExcelJS.CellValue;
      if (v && typeof v === "object" && "formula" in (v as object)) return;
      cell.value = null;
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * PDF export: the filled sheet is rendered as a faithful RTL HTML report and
 * handed to the browser's print engine (perfect Arabic shaping + same layout).
 */
export function printTripSheetPdf(header: TripSheetHeader, rows: TripSheetRow[], title: string) {
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color:#111; }
  h1 { font-size:18px; text-align:center; margin:0 0 8px; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th, td { border:1px solid #444; padding:4px 5px; text-align:center; }
  thead th { background:#dbe5f1; font-weight:700; }
  .meta { width:100%; border-collapse:collapse; font-size:11px; margin-bottom:10px; }
  .meta td { border:1px solid #444; padding:4px 6px; }
  .meta .k { background:#f2f2f2; font-weight:700; width:15%; }
  tfoot td { background:#f2f2f2; font-weight:700; }
</style></head><body>
<h1>${esc(title)}</h1>
<table class="meta">
  <tr><td class="k">الذهاب</td><td>${esc(header.departureDay)} ${esc(header.departureDate)}</td>
      <td class="k">العودة</td><td>${esc(header.returnDay)} ${esc(header.returnDate)}</td>
      <td class="k">السعة</td><td>${esc(header.capacity)}</td></tr>
  <tr><td class="k">شركة النقل</td><td>${esc(header.transportCompany)}</td>
      <td class="k">رقم الحافلة</td><td>${esc(header.busNumber)}</td>
      <td class="k">اللوحة</td><td>${esc(header.plate)}</td></tr>
  <tr><td class="k">السائق</td><td>${esc(header.driverName)}</td>
      <td class="k">هويته</td><td>${esc(header.driverId)}</td>
      <td class="k">جواله</td><td>${esc(header.driverPhone)}</td></tr>
  <tr><td class="k">عدد الركاب</td><td>${esc(header.passengersTotal)}</td>
      <td class="k">المتبقي</td><td>${esc(header.seatsRemaining)}</td>
      <td class="k"></td><td></td></tr>
</table>
<table>
  <thead><tr><th>م</th><th>المندوب</th><th>العميل</th><th>الهوية / الجواز</th><th>الجنسية</th>
  <th>عدد الأفراد</th><th>العودة</th><th>الفندق</th><th>نوع الغرفة</th><th>إجمالي الباقة</th></tr></thead>
  <tbody>
    ${rows
      .map(
        (r) =>
          `<tr><td>${esc(r.index)}</td><td>${esc(r.rep)}</td><td>${esc(r.customer)}</td><td>${esc(
            r.idNumber,
          )}</td><td>${esc(r.nationality)}</td><td>${esc(r.count)}</td><td>${esc(r.returnDay)}</td><td>${esc(
            r.hotel,
          )}</td><td>${esc(r.roomType)}</td><td>${esc(r.total)}</td></tr>`,
      )
      .join("")}
  </tbody>
  <tfoot><tr><td colspan="9">الإجمالي</td><td>${total}</td></tr></tfoot>
</table>
<script>window.onload=()=>{window.focus();window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
