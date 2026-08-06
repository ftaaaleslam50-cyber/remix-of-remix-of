import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2, Download, Table2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  TRIP_SHEET_TEMPLATES,
  buildTripSheetWorkbook,
  downloadBlob,
  printTripSheetPdf,
  type TripSheetHeader,
  type TripSheetRow,
} from "@/lib/export/trip-sheet-template";
import { buildTripSettlementWorkbook, type SettlementInput } from "@/lib/export/trip-settlement-workbook";

export interface ExportPayload {
  header: TripSheetHeader;
  rows: TripSheetRow[];
  title: string;
  filename: string;
  /** Worksheet inside the template to fill (defaults to the first data sheet). */
  sheetName?: string;
  /** Full two-sheet workbook data ("#" reference + settlement sheet). */
  settlement?: SettlementInput;
}

export function ExportSheetDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  getData: () => ExportPayload;
  /** Legacy raw export kept available so no existing capability is lost. */
  onRawExcel?: () => void;
}) {
  const { open, onOpenChange, getData, onRawExcel } = props;
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);
  const [templateId, setTemplateId] = useState(TRIP_SHEET_TEMPLATES[0].id);
  const [sheetName, setSheetName] = useState(TRIP_SHEET_TEMPLATES[0].dataSheets[0]);
  const [mode, setMode] = useState<"full" | "template">("full");

  const tpl = TRIP_SHEET_TEMPLATES.find((t) => t.id === templateId) ?? TRIP_SHEET_TEMPLATES[0];

  async function doExcel() {
    setBusy("excel");
    try {
      const d = getData();
      if (mode === "full" && d.settlement) {
        const blob = await buildTripSettlementWorkbook(d.settlement);
        downloadBlob(blob, `${d.filename}.xlsx`);
        toast.success("تم إنشاء الكشف الكامل (شيت # + نموذج الرحلة) بكل المعادلات");
        return;
      }
      const blob = await buildTripSheetWorkbook({
        templateId,
        sheetName: d.sheetName ?? sheetName,
        header: d.header,
        rows: d.rows,
      });
      downloadBlob(blob, `${d.filename}.xlsx`);
      toast.success("تم إنشاء ملف Excel من القالب الرسمي");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصدير");
    } finally {
      setBusy(null);
    }
  }

  function doPdf() {
    setBusy("pdf");
    try {
      const d = getData();
      const ok = printTripSheetPdf(d.header, d.rows, d.title);
      if (!ok) toast.error("الرجاء السماح بالنوافذ المنبثقة لإنشاء PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>تصدير كشف الرحلة</DialogTitle>
          <DialogDescription>
            يتم استخدام قالب الإكسل الرسمي كما هو (نفس التنسيقات والمعادلات) ويتم استبدال البيانات فقط.
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label className="text-xs mb-1 block">نوع الملف</Label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "full" | "template")}
            className="h-10 w-full rounded-md border px-3 text-sm bg-background"
          >
            <option value="full">كشف كامل — شيت (#) المرجعي + نموذج الرحلة بكل المعادلات</option>
            <option value="template">قالب الإكسل الرسمي (استبدال بيانات فقط)</option>
          </select>
        </div>

        {mode === "template" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs mb-1 block">القالب</Label>
              <select
                value={templateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setTemplateId(id);
                  const t = TRIP_SHEET_TEMPLATES.find((x) => x.id === id);
                  if (t) setSheetName(t.dataSheets[0]);
                }}
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
              >
                {TRIP_SHEET_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">ورقة العمل</Label>
              <select
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                className="h-10 w-full rounded-md border px-3 text-sm bg-background"
              >
                {tpl.dataSheets.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}


        <div className="grid gap-4 sm:grid-cols-2 mt-2">
          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
            <p className="font-extrabold">تصدير Excel</p>
            <p className="text-xs text-muted-foreground">
              ملف مطابق 100% للنموذج الرسمي مع الحفاظ على الألوان والحدود والمعادلات والصور.
            </p>
            <Button onClick={doExcel} disabled={busy !== null} className="rounded-full mt-1 w-full">
              {busy === "excel" ? (
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 ml-1" />
              )}
              تنزيل Excel
            </Button>
          </div>

          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileText className="h-10 w-10 text-red-600" />
            <p className="font-extrabold">تصدير PDF</p>
            <p className="text-xs text-muted-foreground">
              نفس شكل الكشف بصيغة PDF جاهزة للطباعة مع دعم كامل للغة العربية.
            </p>
            <Button onClick={doPdf} disabled={busy !== null} variant="outline" className="rounded-full mt-1 w-full">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Download className="h-4 w-4 ml-1" />}
              تنزيل PDF
            </Button>
          </div>
        </div>

        {onRawExcel && (
          <button
            type="button"
            onClick={() => {
              onRawExcel();
              onOpenChange(false);
            }}
            className="mt-1 text-xs text-muted-foreground underline flex items-center gap-1 mx-auto"
          >
            <Table2 className="h-3 w-3" /> تصدير جدول البيانات الخام (بدون قالب)
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
