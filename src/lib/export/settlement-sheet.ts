// Standalone exporter for the "الحسابات والتصفية" tab.
// Independent from the official trip-sheet template (official-bus-sheet.ts):
// it simply mirrors the table currently rendered on screen.
import ExcelJS from "exceljs";

export interface SettlementSection {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
}

export interface SettlementExport {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
  highlightColumn?: string;
  /** أرقام صفوف حجوزات «عودة فقط» (0-based) — تُلوّن بالأزرق. */
  returnRows?: number[];
  /** صفحات/أوراق إضافية (مثل كشف مصاريف الباص والرحلة). */
  sections?: SettlementSection[];
}


export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function buildSettlementWorkbook(input: SettlementExport): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("كشف الحسابات", {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const titleRow = ws.addRow([input.title]);
  titleRow.font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, Math.max(1, input.columns.length));
  titleRow.alignment = { horizontal: "center", vertical: "middle" };

  const head = ws.addRow(input.columns);
  head.font = { bold: true };
  head.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
    c.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
      bottom: { style: "thin" },
    };
  });
  const highlightIndex = input.highlightColumn ? input.columns.indexOf(input.highlightColumn) + 1 : 0;
  const applyHighlight = (cell: ExcelJS.Cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDC2626" } };
    cell.font = { ...(cell.font ?? {}), bold: true, color: { argb: "FFFFFFFF" } };
  };
  if (highlightIndex > 0) applyHighlight(head.getCell(highlightIndex));

  for (const r of input.rows) {
    const row = ws.addRow(r);
    row.alignment = { horizontal: "center", vertical: "middle" };
    row.eachCell((c) => {
      c.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" },
        bottom: { style: "thin" },
      };
    });
    if (highlightIndex > 0) applyHighlight(row.getCell(highlightIndex));
  }

  if (input.totals) {
    const row = ws.addRow(input.totals);
    row.font = { bold: true };
    row.alignment = { horizontal: "center", vertical: "middle" };
    if (highlightIndex > 0) applyHighlight(row.getCell(highlightIndex));
  }

  input.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(10, Math.min(28, c.length + 6));
  });

  // أوراق إضافية: مصاريف الباص ومصاريف الرحلة
  (input.sections ?? []).forEach((sec, si) => {
    const sheet = wb.addWorksheet(sec.title.slice(0, 28) || `ورقة ${si + 2}`, {
      views: [{ rightToLeft: true }],
      pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const t = sheet.addRow([sec.title]);
    t.font = { bold: true, size: 14 };
    sheet.mergeCells(1, 1, 1, Math.max(1, sec.columns.length));
    t.alignment = { horizontal: "center", vertical: "middle" };
    const h = sheet.addRow(sec.columns);
    h.font = { bold: true };
    h.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    h.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    });
    for (const r of sec.rows) {
      const row = sheet.addRow(r);
      row.alignment = { horizontal: "center", vertical: "middle" };
      row.eachCell((c) => {
        c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      });
    }
    if (sec.totals) {
      const row = sheet.addRow(sec.totals);
      row.font = { bold: true };
      row.alignment = { horizontal: "center", vertical: "middle" };
    }
    sec.columns.forEach((c, i) => {
      sheet.getColumn(i + 1).width = Math.max(12, Math.min(30, c.length + 8));
    });
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tableHtml(sec: SettlementSection): string {
  return `<section class="page"><h1>${esc(sec.title)}</h1>
<table><thead><tr>${sec.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${sec.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
${sec.totals ? `<tfoot><tr>${sec.totals.map((c) => `<td>${esc(c)}</td>`).join("")}</tr></tfoot>` : ""}
</table></section>`;
}

export function printSettlementSheet(input: SettlementExport): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  const highlightIndex = input.highlightColumn ? input.columns.indexOf(input.highlightColumn) + 1 : 0;
  const highlightCss = highlightIndex > 0
    ? `.main th:nth-child(${highlightIndex}), .main td:nth-child(${highlightIndex}) { background-color: #dc2626 !important; color: #ffffff !important; font-weight: bold; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }`
    : "";
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(input.title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
  body { font-family: "Tahoma", "Arial", sans-serif; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #444; padding: 3px 4px; text-align: center; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  thead th { background-color: #e8eef7; }
  tfoot td { font-weight: bold; background-color: #f3f4f6; }
  section.page { break-after: page; page-break-after: always; }
  section.page:last-child { break-after: auto; page-break-after: auto; }
  ${highlightCss}
</style></head><body>
<section class="page main"><h1>${esc(input.title)}</h1>
<table><thead><tr>${input.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${input.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
${input.totals ? `<tfoot><tr>${input.totals.map((c) => `<td>${esc(c)}</td>`).join("")}</tr></tfoot>` : ""}
</table></section>
${(input.sections ?? []).map(tableHtml).join("")}
<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
</body></html>`;
  w.document.write(html);
  w.document.close();
  return true;
}
