import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, ArrowRight, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";
import { SiteLayout } from "@/components/site/SiteLayout";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: `الملف الشخصي | ${BRAND.name}` }, { name: "robots", content: "noindex" }] }),
  component: ProfilePage,
});

interface ProfileRow {
  id: string;
  full_name: string | null;
  mobile_phone: string | null;
  whatsapp_phone: string | null;
  national_id: string | null;
  national_id_image_url: string | null;
  avatar_url: string | null;
  nationality: string | null;
  account_type: "customer" | "representative";
}

function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string>("");
  const [p, setP] = useState<ProfileRow>({
    id: "", full_name: "", mobile_phone: "", whatsapp_phone: "", national_id: "",
    national_id_image_url: "", avatar_url: "", nationality: "", account_type: "customer",
  });
  const [avatarSigned, setAvatarSigned] = useState<string>("");
  const [idSigned, setIdSigned] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (data) setP(data as ProfileRow);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (p.avatar_url) {
        const { data } = await supabase.storage.from("avatars").createSignedUrl(p.avatar_url, 3600);
        if (data?.signedUrl) setAvatarSigned(data.signedUrl);
      }
      if (p.national_id_image_url) {
        const { data } = await supabase.storage.from("id-uploads").createSignedUrl(p.national_id_image_url, 3600);
        if (data?.signedUrl) setIdSigned(data.signedUrl);
      }
    })();
  }, [p.avatar_url, p.national_id_image_url]);

  async function uploadFile(bucket: "avatars" | "id-uploads", file: File): Promise<string | null> {
    if (!uid) return null;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${uid}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return null; }
    return path;
  }

  async function save() {
    if (!uid) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: uid,
      full_name: p.full_name,
      mobile_phone: (p.mobile_phone || "").replace(/\D/g, ""),
      whatsapp_phone: (p.whatsapp_phone || "").replace(/\D/g, ""),
      national_id: p.national_id,
      national_id_image_url: p.national_id_image_url,
      avatar_url: p.avatar_url,
      account_type: p.account_type,
    }, { onConflict: "id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("تم حفظ الملف الشخصي");
  }

  if (loading) {
    return <SiteLayout><div className="container-luxe py-20 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></div></SiteLayout>;
  }

  return (
    <SiteLayout>
      <div className="container-luxe py-10 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold">الملف الشخصي</h1>
          <Link to="/"><Button variant="outline" className="rounded-xl gap-1"><ArrowRight className="h-4 w-4" /> الرئيسية</Button></Link>
        </div>

        <div className="surface-card p-6 space-y-5">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center overflow-hidden border-2 border-border">
              {avatarSigned ? <img src={avatarSigned} alt="avatar" className="h-full w-full object-cover" /> : <UserIcon className="h-10 w-10 text-muted-foreground" />}
            </div>
            <label className="cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                const path = await uploadFile("avatars", f);
                if (path) setP({ ...p, avatar_url: path });
              }} />
              <Button asChild variant="outline" className="rounded-xl gap-1"><span><Upload className="h-4 w-4" /> رفع صورة</span></Button>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="الاسم الكامل" value={p.full_name ?? ""} onChange={(v) => setP({ ...p, full_name: v })} />
            <Field label="رقم الجوال" value={p.mobile_phone ?? ""} onChange={(v) => setP({ ...p, mobile_phone: v })} dir="ltr" />
            <Field label="رقم الواتساب" value={p.whatsapp_phone ?? ""} onChange={(v) => setP({ ...p, whatsapp_phone: v })} dir="ltr" />
            <Field label="رقم الهوية" value={p.national_id ?? ""} onChange={(v) => setP({ ...p, national_id: v })} dir="ltr" />
          </div>

          <div>
            <Label>نوع الحساب</Label>
            <div className="mt-2 flex gap-2">
              {(["customer", "representative"] as const).map((t) => (
                <button key={t} type="button" onClick={() => setP({ ...p, account_type: t })}
                  className={`flex-1 h-11 rounded-xl border-2 font-semibold ${p.account_type === t ? "border-primary bg-primary/10 text-primary" : "border-border"}`}>
                  {t === "customer" ? "عميل" : "مندوب"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>صورة الهوية</Label>
            <div className="mt-2 flex items-center gap-3">
              {idSigned && <img src={idSigned} alt="id" className="h-16 w-24 object-cover rounded-lg border" />}
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return;
                  const path = await uploadFile("id-uploads", f);
                  if (path) setP({ ...p, national_id_image_url: path });
                }} />
                <Button asChild variant="outline" className="rounded-xl gap-1"><span><Upload className="h-4 w-4" /> رفع صورة الهوية</span></Button>
              </label>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full h-12 rounded-xl btn-primary-glow font-bold">
            {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            حفظ التغييرات
          </Button>
        </div>
      </div>
    </SiteLayout>
  );
}

function Field({ label, value, onChange, dir }: { label: string; value: string; onChange: (v: string) => void; dir?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input dir={dir} className="mt-2 h-11 rounded-xl" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
