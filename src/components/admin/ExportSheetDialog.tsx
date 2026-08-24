import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  buildOfficialSheetWorkbook,
  printOfficialSheet,
  downloadBlob,
  type OfficialSheetHeader,
  type OfficialSheetRow,
} from "@/lib/export/official-bus-sheet";

export interface ExportPayload {
  header: OfficialSheetHeader;
  rows: OfficialSheetRow[];
  title: string;
  filename: string;
}

/** النموذج الرسمي الوحيد لكشف الرحلة — تصدير Excel أو PDF (أفقي A4). */
export function ExportSheetDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  getData: () => ExportPayload;
}) {
  const { open, onOpenChange, getData } = props;
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);

  async function doExcel() {
    setBusy("excel");
    try {
      const d = getData();
      const blob = await buildOfficialSheetWorkbook({ title: d.title, header: d.header, rows: d.rows });
      downloadBlob(blob, `${d.filename}.xlsx`);
      toast.success("تم إنشاء نسخة Excel من نموذج كشف الرحلة");
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
      const ok = printOfficialSheet({ title: d.title, header: d.header, rows: d.rows });
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
            النموذج الرسمي الوحيد — تخطيط أفقي (A4 Landscape) بنفس الأعمدة والألوان، ويُملأ من بيانات النظام مباشرة.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 mt-2">
          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
            <p className="font-extrabold">تصدير نسخة Excel</p>
            <p className="text-xs text-muted-foreground">ملف .xlsx بنفس تنسيق الأعمدة والألوان وجدول ركاب متمدد.</p>
            <Button onClick={doExcel} disabled={busy !== null} className="rounded-full mt-1 w-full">
              {busy === "excel" ? (
                <Loader2 className="h-4 w-4 ml-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 ml-1" />
              )}
              تصدير نسخة Excel
            </Button>
          </div>

          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileText className="h-10 w-10 text-red-600" />
            <p className="font-extrabold">تصدير نسخة PDF</p>
            <p className="text-xs text-muted-foreground">نفس النموذج جاهز للطباعة بتخطيط أفقي كامل ودعم RTL.</p>
            <Button onClick={doPdf} disabled={busy !== null} variant="outline" className="rounded-full mt-1 w-full">
              {busy === "pdf" ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Download className="h-4 w-4 ml-1" />}
              تصدير نسخة PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
