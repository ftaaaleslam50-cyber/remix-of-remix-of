import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Upload, Trash2, Copy, Search, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin-assets")({
  component: AdminAssets,
});

interface Asset {
  id: string;
  name: string;
  storage_path: string;
  public_url: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

interface Usage {
  asset_id: string;
  entity_type: string;
}

async function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml" || file.type === "image/gif") {
    return file;
  }
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
  return await new Promise<Blob>((res) => {
    canvas.toBlob((b) => res(b ?? file), "image/webp", quality);
  });
}

async function getImageDims(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const bm = await createImageBitmap(blob);
    return { w: bm.width, h: bm.height };
  } catch {
    return null;
  }
}

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function AdminAssets() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ok, setOk] = useState<boolean | null>(null);
  const [q, setQ] = useState("");
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setOk(!!data);
    })();
  }, [navigate]);

  const { data: assets = [], isLoading } = useQuery({
    queryKey: ["admin-assets"],
    enabled: ok === true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as unknown as Asset[]) ?? [];
    },
  });

  const { data: usages = [] } = useQuery({
    queryKey: ["admin-asset-usages"],
    enabled: ok === true,
    queryFn: async () => {
      const { data } = await supabase.from("asset_usages" as never).select("asset_id,entity_type");
      return (data as unknown as Usage[]) ?? [];
    },
  });

  // Sign private-bucket URLs (bucket is private per workspace policy)
  useEffect(() => {
    (async () => {
      const missing = assets.filter((a) => !signedUrls[a.id]);
      if (!missing.length) return;
      const next: Record<string, string> = {};
      for (const a of missing) {
        const { data } = await supabase.storage
          .from("assets")
          .createSignedUrl(a.storage_path, 60 * 60);
        if (data?.signedUrl) next[a.id] = data.signedUrl;
      }
      if (Object.keys(next).length) setSignedUrls((s) => ({ ...s, ...next }));
    })();
  }, [assets, signedUrls]);

  const usageCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const u of usages) m[u.asset_id] = (m[u.asset_id] ?? 0) + 1;
    return m;
  }, [usages]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return assets;
    return assets.filter((a) => a.name.toLowerCase().includes(term));
  }, [assets, q]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await compressImage(file);
        const dims = await getImageDims(blob);
        const ext = (blob.type.split("/")[1] || "bin").split(";")[0];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName.replace(/\.[^.]+$/, "")}.${ext}`;
        const { error: upErr } = await supabase.storage.from("assets").upload(path, blob, {
          contentType: blob.type,
          upsert: false,
        });
        if (upErr) { toast.error(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("assets").getPublicUrl(path);
        const { error } = await supabase.from("assets" as never).insert({
          name: file.name,
          storage_path: path,
          public_url: pub.publicUrl,
          mime_type: blob.type,
          size_bytes: blob.size,
          width: dims?.w ?? null,
          height: dims?.h ?? null,
        } as never);
        if (error) toast.error(error.message);
      }
      toast.success("تم الرفع");
      qc.invalidateQueries({ queryKey: ["admin-assets"] });
    } finally {
      setUploading(false);
    }
  }

  async function del(a: Asset) {
    const count = usageCount[a.id] ?? 0;
    if (count > 0 && !confirm(`هذا الملف مستخدم في ${count} مكان. حذفه قد يكسر العرض. المتابعة؟`)) return;
    if (!count && !confirm("حذف الملف؟")) return;
    await supabase.storage.from("assets").remove([a.storage_path]);
    const { error } = await supabase.from("assets" as never).delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["admin-assets"] });
  }

  async function copyUrl(a: Asset) {
    await navigator.clipboard.writeText(a.public_url);
    toast.success("تم نسخ الرابط");
  }

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;
  if (ok === null) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> مكتبة الوسائط
          </h1>
          <Link to="/dashboard">
            <Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
              <ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم
            </Button>
          </Link>
        </div>
      </header>

      <main className="container-luxe py-8 space-y-4">
        <div className="surface-card p-4 flex flex-wrap gap-3 items-center justify-between">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم..." className="pr-10" />
          </div>
          <label className="inline-flex">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => { upload(e.target.files); e.target.value = ""; }}
            />
            <span className={`cursor-pointer inline-flex items-center h-10 px-5 rounded-full bg-[color:var(--color-navy)] text-white text-sm font-bold hover:opacity-90 ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              {uploading ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Upload className="h-4 w-4 ml-1" />}
              {uploading ? "جاري الرفع..." : "رفع صور"}
            </span>
          </label>
        </div>

        {isLoading ? (
          <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="surface-card p-10 text-center text-muted-foreground">
            <ImageIcon className="h-14 w-14 mx-auto opacity-30" />
            <p className="mt-4">لا توجد ملفات بعد. ارفع أول صورة.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((a) => {
              const src = signedUrls[a.id] ?? a.public_url;
              const usedIn = usageCount[a.id] ?? 0;
              return (
                <div key={a.id} className="surface-card overflow-hidden">
                  <div className="aspect-square bg-muted relative">
                    <img src={src} alt={a.name} loading="lazy" className="w-full h-full object-cover" />
                    {usedIn > 0 && (
                      <span className="absolute top-2 left-2 bg-green-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        مُستخدم × {usedIn}
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <p className="text-xs font-semibold truncate" title={a.name}>{a.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {a.width && a.height ? `${a.width}×${a.height} • ` : ""}{formatSize(a.size_bytes)}
                    </p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => copyUrl(a)}>
                        <Copy className="h-3 w-3 ml-1" /> نسخ
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-destructive hover:bg-destructive/10" onClick={() => del(a)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
