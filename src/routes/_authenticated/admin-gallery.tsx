import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Images, ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/admin-gallery")({
  component: AdminGallery,
});

interface Album { id: string; name: string; slug: string; display_order: number }
interface Media { id: string; album_id: string; image_url: string; caption: string; media_type: string; video_url: string | null; display_order: number }

function AdminGallery() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setOk(!!data);
    })();
  }, [navigate]);

  const { data: albums = [] } = useQuery({
    queryKey: ["admin-albums"],
    enabled: ok === true,
    queryFn: async () => (await supabase.from("gallery_albums").select("*").order("display_order")).data as Album[] ?? [],
  });
  const { data: media = [] } = useQuery({
    queryKey: ["admin-media"],
    enabled: ok === true,
    queryFn: async () => (await supabase.from("gallery_images").select("*").order("display_order")).data as Media[] ?? [],
  });

  async function addAlbum() {
    const name = prompt("اسم الألبوم:"); if (!name) return;
    const slug = prompt("Slug (لاتيني):"); if (!slug) return;
    const { error } = await supabase.from("gallery_albums").insert({ name, slug, display_order: albums.length } as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-albums"] });
  }
  async function delAlbum(id: string) {
    if (!confirm("حذف الألبوم؟")) return;
    await supabase.from("gallery_albums").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-albums"] });
  }
  async function addMedia(type: "image" | "video") {
    if (albums.length === 0) return toast.error("أنشئ ألبوماً أولاً");
    const url = prompt(type === "image" ? "رابط الصورة:" : "رابط الفيديو (mp4):");
    if (!url) return;
    const payload = type === "image"
      ? { album_id: albums[0].id, image_url: url, caption: "", media_type: "image", display_order: media.length }
      : { album_id: albums[0].id, image_url: "", video_url: url, caption: "", media_type: "video", display_order: media.length };
    const { error } = await supabase.from("gallery_images").insert(payload as never);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-media"] });
  }
  async function saveMedia(m: Media) {
    const { error } = await supabase.from("gallery_images").update({
      album_id: m.album_id, image_url: m.image_url, video_url: m.video_url, caption: m.caption, media_type: m.media_type, display_order: m.display_order,
    } as never).eq("id", m.id);
    if (error) return toast.error(error.message);
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["admin-media"] });
  }
  async function delMedia(id: string) {
    if (!confirm("حذف؟")) return;
    await supabase.from("gallery_images").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-media"] });
  }

  const images = media.filter((m) => m.media_type !== "video");
  const videos = media.filter((m) => m.media_type === "video");

  if (ok === false) return <div className="p-8 text-center">ليس لديك صلاحية</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <h1 className="text-lg font-extrabold flex items-center gap-2"><Images className="h-5 w-5" /> إدارة المعرض</h1>
          <Link to="/dashboard"><Button size="sm" variant="outline" className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"><ArrowLeft className="h-4 w-4 ml-1" /> لوحة التحكم</Button></Link>
        </div>
      </header>
      <main className="container-luxe py-8">
        <Tabs defaultValue="albums">
          <TabsList className="bg-white rounded-2xl p-1.5">
            <TabsTrigger value="albums" className="rounded-xl">الألبومات</TabsTrigger>
            <TabsTrigger value="images" className="rounded-xl">الصور</TabsTrigger>
            <TabsTrigger value="videos" className="rounded-xl">الفيديوهات</TabsTrigger>
          </TabsList>

          <TabsContent value="albums" className="mt-4 surface-card p-6">
            <div className="flex justify-between mb-4">
              <h2 className="font-bold">الألبومات ({albums.length})</h2>
              <Button onClick={addAlbum} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة ألبوم</Button>
            </div>
            <div className="space-y-2">
              {albums.map((a) => (
                <div key={a.id} className="flex items-center justify-between border rounded-xl p-3">
                  <div><span className="font-bold">{a.name}</span> <span className="text-xs text-muted-foreground">/{a.slug}</span></div>
                  <Button size="sm" variant="outline" onClick={() => delAlbum(a.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="images" className="mt-4 surface-card p-6">
            <div className="flex justify-between mb-4">
              <h2 className="font-bold">الصور ({images.length})</h2>
              <Button onClick={() => addMedia("image")} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة صورة</Button>
            </div>
            <MediaGrid list={images} albums={albums} onSave={saveMedia} onDelete={delMedia} kind="image" />
          </TabsContent>

          <TabsContent value="videos" className="mt-4 surface-card p-6">
            <div className="flex justify-between mb-4">
              <h2 className="font-bold">الفيديوهات ({videos.length})</h2>
              <Button onClick={() => addMedia("video")} className="rounded-full"><Plus className="h-4 w-4 ml-1" /> إضافة فيديو</Button>
            </div>
            <MediaGrid list={videos} albums={albums} onSave={saveMedia} onDelete={delMedia} kind="video" />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MediaGrid({ list, albums, onSave, onDelete, kind }: {
  list: Media[]; albums: Album[]; onSave: (m: Media) => void; onDelete: (id: string) => void; kind: "image" | "video";
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((m) => <MediaCard key={m.id} m={m} albums={albums} onSave={onSave} onDelete={() => onDelete(m.id)} kind={kind} />)}
      {list.length === 0 && <div className="text-center text-muted-foreground py-8 md:col-span-2">لا يوجد محتوى بعد.</div>}
    </div>
  );
}

function MediaCard({ m, albums, onSave, onDelete, kind }: {
  m: Media; albums: Album[]; onSave: (m: Media) => void; onDelete: () => void; kind: "image" | "video";
}) {
  const [local, setLocal] = useState(m);
  useEffect(() => setLocal(m), [m]);
  return (
    <div className="border rounded-2xl p-3 space-y-2">
      {kind === "video" ? (
        local.video_url && <video src={local.video_url} controls className="w-full rounded-lg max-h-48" />
      ) : (
        local.image_url && <img src={local.image_url} alt="" className="w-full rounded-lg max-h-48 object-cover" />
      )}
      <div className="grid gap-2">
        <div><Label className="text-xs">الألبوم</Label>
          <Select value={local.album_id} onValueChange={(v) => setLocal({ ...local, album_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{albums.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {kind === "video" ? (
          <div><Label className="text-xs">رابط الفيديو</Label><Input value={local.video_url ?? ""} onChange={(e) => setLocal({ ...local, video_url: e.target.value })} /></div>
        ) : (
          <div><Label className="text-xs">رابط الصورة</Label><Input value={local.image_url} onChange={(e) => setLocal({ ...local, image_url: e.target.value })} /></div>
        )}
        <div><Label className="text-xs">التعليق</Label><Input value={local.caption ?? ""} onChange={(e) => setLocal({ ...local, caption: e.target.value })} /></div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
          <Button size="sm" onClick={() => onSave(local)}><Save className="h-3 w-3 ml-1" /> حفظ</Button>
        </div>
      </div>
    </div>
  );
}
