import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, Upload, X, Image as ImageIcon, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface AssetSelection {
  id: string;
  url: string;
  name: string;
  storage_path: string;
}

interface Asset {
  id: string;
  name: string;
  storage_path: string;
  public_url: string;
}

async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  let { width, height } = bitmap;
  if (width > maxDim || height > maxDim) {
    const r = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * r);
    height = Math.round(height * r);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b ?? file), "image/webp", quality));
}

async function getDims(blob: Blob) {
  try { const bm = await createImageBitmap(blob); return { w: bm.width, h: bm.height }; } catch { return null; }
}

export function AssetPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (a: AssetSelection) => void;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [signed, setSigned] = useState<Record<string, string>>({});

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["admin-assets"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets" as never)
        .select("id,name,storage_path,public_url")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Asset[]) ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const missing = assets.filter((a) => !signed[a.id]);
      if (!missing.length) return;
      const next: Record<string, string> = {};
      for (const a of missing) {
        const { data } = await supabase.storage.from("assets").createSignedUrl(a.storage_path, 60 * 60);
        if (data?.signedUrl) next[a.id] = data.signedUrl;
      }
      if (Object.keys(next).length) setSigned((s) => ({ ...s, ...next }));
    })();
  }, [assets, signed, open]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? assets.filter((a) => a.name.toLowerCase().includes(t)) : assets;
  }, [assets, q]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      let last: AssetSelection | null = null;
      for (const file of Array.from(files)) {
        const blob = await compressImage(file);
        const dims = await getDims(blob);
        const ext = (blob.type.split("/")[1] || "bin").split(";")[0];
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "");
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}.${ext}`;
        const { error: upErr } = await supabase.storage.from("assets").upload(path, blob, {
          contentType: blob.type, upsert: false,
        });
        if (upErr) { toast.error(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("assets").getPublicUrl(path);
        const { data: row, error } = await supabase
          .from("assets" as never)
          .insert({
            name: file.name, storage_path: path, public_url: pub.publicUrl,
            mime_type: blob.type, size_bytes: blob.size,
            width: dims?.w ?? null, height: dims?.h ?? null,
          } as never)
          .select("id,name,storage_path,public_url")
          .single();
        if (error) { toast.error(error.message); continue; }
        const r = row as unknown as Asset;
        last = { id: r.id, url: r.public_url, name: r.name, storage_path: r.storage_path };
      }
      qc.invalidateQueries({ queryKey: ["admin-assets"] });
      if (last) {
        toast.success("تم الرفع");
        onSelect(last);
        onOpenChange(false);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> اختر من مكتبة الوسائط
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث..." className="pr-10" />
          </div>
          <label className="inline-flex">
            <input type="file" accept="image/*" multiple className="hidden" disabled={uploading}
              onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <span className={`cursor-pointer inline-flex items-center h-10 px-4 rounded-full bg-[color:var(--color-navy)] text-white text-sm font-bold hover:opacity-90 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Upload className="h-4 w-4 ml-1" />}
              {uploading ? "جاري الرفع..." : "رفع جديد"}
            </span>
          </label>
        </div>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <ImageIcon className="h-14 w-14 mx-auto opacity-30" />
              <p className="mt-3 text-sm">لا توجد ملفات. ارفع صورة جديدة.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-4 pb-2">
              {filtered.map((a) => {
                const src = signed[a.id] ?? a.public_url;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => { onSelect({ id: a.id, url: a.public_url, name: a.name, storage_path: a.storage_path }); onOpenChange(false); }}
                    className="group relative rounded-xl overflow-hidden border-2 border-transparent hover:border-primary transition"
                  >
                    <div className="aspect-square bg-muted">
                      <img src={src} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <Check className="h-8 w-8 text-white" />
                    </div>
                    <p className="p-1.5 text-[10px] font-semibold truncate text-right" title={a.name}>{a.name}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 ml-1" /> إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
