import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Settings, Building2, Globe, Home, Ticket, Bell, BadgeDollarSign, Cog } from "lucide-react";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AssetField } from "@/components/admin/AssetField";

export const Route = createFileRoute("/_authenticated/admin-homepage")({
  component: AdminHomepage,
});

interface SettingsData {
  id: number;

  /* المؤسسة */

  company_name: string | null;
  company_logo: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_whatsapp: string | null;
  commercial_register: string | null;
  google_maps: string | null;
  company_address: string | null;

  /* التواصل */

  instagram: string | null;
  snapchat: string | null;
  tiktok: string | null;
  twitter: string | null;
  youtube: string | null;

  /* Hero */

  hero_title: string;
  hero_subtitle: string;
  hero_cta: string;
  hero_image_url: string | null;

  /* الحجوزات */

  booking_button: string | null;
  booking_success: string | null;
  booking_cancel: string | null;
  booking_terms: string | null;
  seats_full_message: string | null;
  bus_full_message: string | null;

  /* التذكرة */

  ticket_footer: string | null;
  ticket_notes: string | null;
  ticket_terms: string | null;

  /* الأسعار */

  currency: string | null;
  service_fee: number | null;
  vat_percent: number | null;

  /* النظام */

  enable_notifications: boolean | null;
  notification_sound: boolean | null;
  enable_lucky_draw: boolean | null;
  enable_register: boolean | null;
  show_packages: boolean | null;
}

function AdminHomepage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [authorized, setAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        navigate({ to: "/auth" });
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["admin", "manager"]);

      setAuthorized(!!data?.length);
    })();
  }, [navigate]);

  const { data: settings } = useQuery({
    queryKey: ["site-settings"],

    enabled: authorized === true,

    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();

      return data as SettingsData;
    },
  });

  const [local, setLocal] = useState<SettingsData | null>(null);

  useEffect(() => {
    if (settings) {
      setLocal(settings);
    }
  }, [settings]);

  async function save() {
    if (!local) return;

    const { error } = await supabase
      .from("app_settings")
      .update(local as never)
      .eq("id", 1);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("تم حفظ إعدادات الموقع");

    queryClient.invalidateQueries({
      queryKey: ["site-settings"],
    });
  }

  if (authorized === false) return <div className="p-10 text-center">ليس لديك صلاحية.</div>;

  if (!local) return <div className="p-10 text-center">جاري التحميل...</div>;

  return (
    <div className="min-h-screen bg-muted">
      <header className="bg-[color:var(--color-navy)] text-white">
        <div className="container-luxe py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="h-6 w-6" />

            <div>
              <h1 className="text-xl font-bold">إعدادات الموقع</h1>

              <p className="text-white/70 text-sm">إدارة جميع إعدادات النظام والموقع</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={save} className="rounded-full">
              <Save className="h-4 w-4 ml-2" />
              حفظ الإعدادات
            </Button>

            <Link to="/dashboard">
              <Button
                variant="outline"
                className="rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4 ml-2" />
                لوحة التحكم
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container-luxe py-8">
        <Tabs defaultValue="company">
          <TabsList className="flex flex-wrap h-auto rounded-2xl bg-white p-2 gap-2">
            <TabsTrigger value="company">
              <Building2 className="h-4 w-4 ml-2" />
              معلومات المؤسسة
            </TabsTrigger>

            <TabsTrigger value="social">
              <Globe className="h-4 w-4 ml-2" />
              وسائل التواصل
            </TabsTrigger>

            <TabsTrigger value="hero">
              <Home className="h-4 w-4 ml-2" />
              الصفحة الرئيسية
            </TabsTrigger>

            <TabsTrigger value="booking">
              <Ticket className="h-4 w-4 ml-2" />
              الحجوزات
            </TabsTrigger>

            <TabsTrigger value="ticket">
              <Ticket className="h-4 w-4 ml-2" />
              التذكرة
            </TabsTrigger>

            <TabsTrigger value="pricing">
              <BadgeDollarSign className="h-4 w-4 ml-2" />
              الأسعار
            </TabsTrigger>

            <TabsTrigger value="notifications">
              <Bell className="h-4 w-4 ml-2" />
              الإشعارات
            </TabsTrigger>

            <TabsTrigger value="system">
              <Cog className="h-4 w-4 ml-2" />
              النظام
            </TabsTrigger>
          </TabsList>
          {/* ============================= */}
          {/* معلومات المؤسسة */}
          {/* ============================= */}

          <TabsContent value="company" className="mt-6 surface-card p-6">
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <Label>اسم المؤسسة</Label>

                <Input
                  value={local.company_name ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      company_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>البريد الإلكتروني</Label>

                <Input
                  value={local.company_email ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      company_email: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رقم الهاتف</Label>

                <Input
                  dir="ltr"
                  value={local.company_phone ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      company_phone: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رقم واتساب</Label>

                <Input
                  dir="ltr"
                  value={local.company_whatsapp ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      company_whatsapp: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>السجل التجاري</Label>

                <Input
                  value={local.commercial_register ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      commercial_register: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رابط خرائط Google</Label>

                <Input
                  value={local.google_maps ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      google_maps: e.target.value,
                    })
                  }
                />
              </div>

              <div className="md:col-span-2">
                <Label>العنوان</Label>

                <Textarea
                  rows={3}
                  value={local.company_address ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      company_address: e.target.value,
                    })
                  }
                />
              </div>

              <div className="md:col-span-2">
                <Label>شعار المؤسسة</Label>

                <AssetField
                  value={local.company_logo}
                  onChange={(url) =>
                    setLocal({
                      ...local,
                      company_logo: url,
                    })
                  }
                  aspect="square"
                />
              </div>
            </div>
          </TabsContent>
          {/* ============================= */}
          {/* وسائل التواصل */}
          {/* ============================= */}

          <TabsContent value="social" className="mt-6 surface-card p-6">
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <Label>واتساب</Label>

                <Input
                  dir="ltr"
                  placeholder="9665xxxxxxxx"
                  value={local.company_whatsapp ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      company_whatsapp: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Instagram</Label>

                <Input
                  placeholder="https://instagram.com/..."
                  value={local.instagram ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      instagram: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>Snapchat</Label>

                <Input
                  placeholder="https://snapchat.com/..."
                  value={local.snapchat ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      snapchat: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>TikTok</Label>

                <Input
                  placeholder="https://tiktok.com/@..."
                  value={local.tiktok ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      tiktok: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>X (Twitter)</Label>

                <Input
                  placeholder="https://x.com/..."
                  value={local.twitter ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      twitter: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>YouTube</Label>

                <Input
                  placeholder="https://youtube.com/..."
                  value={local.youtube ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      youtube: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>
          {/* ============================= */}
          {/* الصفحة الرئيسية */}
          {/* ============================= */}

          <TabsContent value="hero" className="mt-6 surface-card p-6">
            <div className="grid gap-5">
              <div>
                <Label>عنوان الصفحة الرئيسية</Label>

                <Input
                  value={local.hero_title}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      hero_title: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>الوصف</Label>

                <Textarea
                  rows={5}
                  value={local.hero_subtitle}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      hero_subtitle: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>نص زر الحجز</Label>

                <Input
                  value={local.hero_cta}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      hero_cta: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>صورة الخلفية</Label>

                <AssetField
                  value={local.hero_image_url}
                  onChange={(url) =>
                    setLocal({
                      ...local,
                      hero_image_url: url,
                    })
                  }
                  aspect="video"
                />
              </div>

              <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                <strong>ملاحظة:</strong>
                <br />
                هذا القسم يتحكم فقط في الجزء العلوي من الصفحة الرئيسية (Hero).
                <br />
                أما الأقسام الأخرى مثل رحلة الحجز والسحب والإحصائيات فهي تُدار من صفحاتها الخاصة لأنها ليست محتوى
                ثابتًا.
              </div>
            </div>
          </TabsContent>
          {/* ============================= */}
          {/* الحجوزات */}
          {/* ============================= */}

          <TabsContent value="booking" className="mt-6 surface-card p-6">
            <div className="grid gap-5">
              <div>
                <Label>نص زر الحجز</Label>

                <Input
                  value={local.booking_button ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      booking_button: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رسالة نجاح الحجز</Label>

                <Textarea
                  rows={3}
                  value={local.booking_success ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      booking_success: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رسالة إلغاء الحجز</Label>

                <Textarea
                  rows={3}
                  value={local.booking_cancel ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      booking_cancel: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رسالة امتلاء المقاعد</Label>

                <Textarea
                  rows={3}
                  value={local.seats_full_message ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      seats_full_message: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رسالة اكتمال الحافلة</Label>

                <Textarea
                  rows={3}
                  value={local.bus_full_message ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      bus_full_message: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>شروط الحجز</Label>

                <Textarea
                  rows={8}
                  value={local.booking_terms ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      booking_terms: e.target.value,
                    })
                  }
                />
              </div>

              <div className="rounded-xl border bg-muted/40 p-4">
                <h3 className="font-semibold mb-2">ملاحظة</h3>

                <p className="text-sm text-muted-foreground leading-7">
                  جميع الرسائل الموجودة هنا سيتم استخدامها في صفحات الحجز بدلاً من كتابة النصوص داخل الكود، مما يسمح
                  بتعديلها من لوحة التحكم دون الحاجة إلى إعادة نشر الموقع.
                </p>
              </div>
            </div>
          </TabsContent>
          {/* ============================= */}
          {/* التذكرة */}
          {/* ============================= */}

          <TabsContent value="ticket" className="mt-6 surface-card p-6">
            <div className="grid gap-5">
              <div>
                <Label>تذييل التذكرة</Label>

                <Textarea
                  rows={4}
                  value={local.ticket_footer ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      ticket_footer: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>الشروط والأحكام</Label>

                <Textarea
                  rows={8}
                  value={local.ticket_terms ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      ticket_terms: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>ملاحظات التذكرة</Label>

                <Textarea
                  rows={5}
                  value={local.ticket_notes ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      ticket_notes: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* ============================= */}
          {/* الأسعار */}
          {/* ============================= */}

          <TabsContent value="pricing" className="mt-6 surface-card p-6">
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <Label>العملة</Label>

                <Input
                  value={local.currency ?? ""}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      currency: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <Label>رسوم الخدمة</Label>

                <Input
                  type="number"
                  value={local.service_fee ?? 0}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      service_fee: Number(e.target.value),
                    })
                  }
                />
              </div>

              <div>
                <Label>نسبة الضريبة (%)</Label>

                <Input
                  type="number"
                  value={local.vat_percent ?? 0}
                  onChange={(e) =>
                    setLocal({
                      ...local,
                      vat_percent: Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* ============================= */}
          {/* الإشعارات */}
          {/* ============================= */}

          <TabsContent value="notifications" className="mt-6 surface-card p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <h3 className="font-semibold">تشغيل الإشعارات</h3>

                  <p className="text-sm text-muted-foreground">تفعيل جميع إشعارات النظام.</p>
                </div>

                <Switch
                  checked={local.enable_notifications ?? false}
                  onCheckedChange={(value) =>
                    setLocal({
                      ...local,
                      enable_notifications: value,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <h3 className="font-semibold">صوت الإشعارات</h3>

                  <p className="text-sm text-muted-foreground">تشغيل صوت عند وصول إشعار جديد.</p>
                </div>

                <Switch
                  checked={local.notification_sound ?? false}
                  onCheckedChange={(value) =>
                    setLocal({
                      ...local,
                      notification_sound: value,
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>

          {/* ============================= */}
          {/* النظام */}
          {/* ============================= */}

          <TabsContent value="system" className="mt-6 surface-card p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <h3 className="font-semibold">تفعيل التسجيل</h3>

                  <p className="text-sm text-muted-foreground">السماح للمستخدمين بإنشاء حسابات جديدة.</p>
                </div>

                <Switch
                  checked={local.enable_register ?? false}
                  onCheckedChange={(value) =>
                    setLocal({
                      ...local,
                      enable_register: value,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <h3 className="font-semibold">تشغيل السحب</h3>
                </div>

                <Switch
                  checked={local.enable_lucky_draw ?? false}
                  onCheckedChange={(value) =>
                    setLocal({
                      ...local,
                      enable_lucky_draw: value,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between border rounded-xl p-4">
                <div>
                  <h3 className="font-semibold">إظهار صفحة الباقات</h3>
                </div>

                <Switch
                  checked={local.show_packages ?? false}
                  onCheckedChange={(value) =>
                    setLocal({
                      ...local,
                      show_packages: value,
                    })
                  }
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

export default AdminHomepage;
