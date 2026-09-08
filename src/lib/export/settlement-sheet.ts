// Standalone exporter for the "الحسابات والتصفية" tab.
// Independent from the official trip-sheet template (official-bus-sheet.ts):
// it simply mirrors the table currently rendered on screen.
import ExcelJS from "exceljs";

export interface SettlementExport {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  totals?: (string | number)[];
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
  }

  if (input.totals) {
    const row = ws.addRow(input.totals);
    row.font = { bold: true };
    row.alignment = { horizontal: "center", vertical: "middle" };
  }

  input.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = Math.max(10, Math.min(28, c.length + 6));
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function printSettlementSheet(input: SettlementExport): boolean {
  const w = window.open("", "_blank");
  if (!w) return false;
  const html = `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>${esc(input.title)}</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  body { font-family: "Tahoma", "Arial", sans-serif; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #444; padding: 3px 4px; text-align: center; }
  thead th { background: #e8eef7; }
  tfoot td { font-weight: bold; background: #f3f4f6; }
</style></head><body>
<h1>${esc(input.title)}</h1>
<table><thead><tr>${input.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
<tbody>${input.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>
${input.totals ? `<tfoot><tr>${input.totals.map((c) => `<td>${esc(c)}</td>`).join("")}</tr></tfoot>` : ""}
</table>
<script>window.onload=function(){setTimeout(function(){window.print();},300);};<\/script>
</body></html>`;
  w.document.write(html);
  w.document.close();
  return true;
}
