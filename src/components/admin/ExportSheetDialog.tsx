import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { resolveDisplayUrl } from "@/lib/asset-url";
import {
  buildOfficialSheetWorkbook,
  printOfficialSheet,
  buildRawWorkbook,
  printRawSheet,
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

/** Logo uploaded from site settings — shared by screen, Excel and PDF. */
export function useSheetLogo() {
  return useQuery({
    queryKey: ["sheet-logo-url"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
      const raw = (data as { logo_url?: string | null } | null)?.logo_url || null;
      return await resolveDisplayUrl(raw);
    },
    staleTime: 5 * 60 * 1000,
  });
}

type Job = "excel" | "pdf" | "raw-excel" | "raw-pdf";

/** النموذج الرسمي الوحيد لكشف الرحلة — 4 خيارات تصدير. */
export function ExportSheetDialog(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  getData: () => ExportPayload;
}) {
  const { open, onOpenChange, getData } = props;
  const [busy, setBusy] = useState<Job | null>(null);
  const { data: logoUrl } = useSheetLogo();

  async function run(job: Job) {
    setBusy(job);
    try {
      const d = getData();
      const input = { title: d.title, header: d.header, rows: d.rows, logoUrl };
      if (job === "excel") {
        downloadBlob(await buildOfficialSheetWorkbook(input), `${d.filename}.xlsx`);
        toast.success("تم إنشاء نسخة Excel من نموذج كشف الرحلة");
      } else if (job === "raw-excel") {
        downloadBlob(await buildRawWorkbook(input), `${d.filename}-raw.xlsx`);
        toast.success("تم تنزيل Excel خام");
      } else {
        const ok = job === "pdf" ? printOfficialSheet(input) : printRawSheet(input);
        if (!ok) toast.error("الرجاء السماح بالنوافذ المنبثقة لإنشاء PDF");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصدير");
    } finally {
      setBusy(null);
    }
  }

  const Icon = ({ job }: { job: Job }) =>
    busy === job ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Download className="h-4 w-4 ml-1" />;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>تصدير كشف الرحلة</DialogTitle>
          <DialogDescription>
            النموذج الرسمي الوحيد — تخطيط أفقي (A4 Landscape) بنفس الأعمدة والألوان والشعار، ويُملأ من بيانات النظام
            مباشرة. أو نسخة خام بجدول بسيط بدون تنسيق.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 mt-2">
          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileSpreadsheet className="h-10 w-10 text-emerald-600" />
            <p className="font-extrabold">تصدير Excel</p>
            <p className="text-xs text-muted-foreground">القالب الكامل: ألوان، خلايا مدمجة، شعار المؤسسة.</p>
            <Button onClick={() => run("excel")} disabled={busy !== null} className="rounded-full mt-1 w-full">
              <Icon job="excel" /> تصدير Excel
            </Button>
          </div>

          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileText className="h-10 w-10 text-red-600" />
            <p className="font-extrabold">تصدير PDF</p>
            <p className="text-xs text-muted-foreground">نفس القالب، PDF أفقي جاهز للطباعة.</p>
            <Button
              onClick={() => run("pdf")}
              disabled={busy !== null}
              variant="outline"
              className="rounded-full mt-1 w-full"
            >
              <Icon job="pdf" /> تصدير PDF
            </Button>
          </div>

          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
            <p className="font-extrabold">تنزيل Excel خام</p>
            <p className="text-xs text-muted-foreground">جدول قياسي بدون تنسيق — سهل الاستيراد في برامج أخرى.</p>
            <Button
              onClick={() => run("raw-excel")}
              disabled={busy !== null}
              variant="secondary"
              className="rounded-full mt-1 w-full"
            >
              <Icon job="raw-excel" /> تنزيل Excel خام
            </Button>
          </div>

          <div className="rounded-2xl border p-5 flex flex-col items-center text-center gap-2">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="font-extrabold">تنزيل PDF خام</p>
            <p className="text-xs text-muted-foreground">جدول نظيف بدون تنسيق للطباعة السريعة أو الأرشفة.</p>
            <Button
              onClick={() => run("raw-pdf")}
              disabled={busy !== null}
              variant="secondary"
              className="rounded-full mt-1 w-full"
            >
              <Icon job="raw-pdf" /> تنزيل PDF خام
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
