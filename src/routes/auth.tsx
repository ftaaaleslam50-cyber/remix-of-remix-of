import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Phone, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/site/Logo";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: `تسجيل الدخول | ${BRAND.name}` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

// Route users based on role: only admin/manager go to Dashboard; everyone else goes Home.
async function routeAfterAuth(navigate: ReturnType<typeof useNavigate>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "manager"] as never);
  const isStaff = Array.isArray(data) && data.length > 0;
  navigate({ to: isStaff ? "/dashboard" : "/" });
}

function identifierToEmail(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 6 && /^\+?\d+$/.test(t.replace(/\s/g, ""))) {
    return `${digits}@zohrat.local`;
  }
  return `${t.toLowerCase()}@zohrat.local`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");

  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [signupPass, setSignupPass] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) routeAfterAuth(navigate, data.session.user.id);
    });
    if (!bootstrapped) {
      fetch("/api/public/bootstrap-admin", { method: "POST" }).catch(() => {});
      setBootstrapped(true);
    }
  }, [navigate, bootstrapped]);

  async function signIn() {
    if (!loginId || !loginPass) return toast.error("أدخل رقم الجوال أو اسم المستخدم وكلمة المرور");
    setLoading(true);
    const email = identifierToEmail(loginId);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: loginPass });
    setLoading(false);
    if (error || !data.user) return toast.error("بيانات الدخول غير صحيحة");
    toast.success("مرحباً بك");
    await routeAfterAuth(navigate, data.user.id);
  }

  async function signUp() {
    if (!fullName.trim() || !mobile.trim() || !signupPass) {
      return toast.error("الاسم ورقم الجوال وكلمة المرور مطلوبة");
    }
    const digits = mobile.replace(/\D/g, "");
    if (digits.length < 6) return toast.error("رقم الجوال غير صالح");
    setLoading(true);

    // Pre-check mobile uniqueness (no PII disclosure — boolean only).
    const { data: exists } = await supabase.rpc("mobile_exists" as never, { _mobile: digits } as never);
    if (exists === true) {
      setLoading(false);
      return toast.error("رقم الجوال مستخدم في حساب آخر");
    }

    const email = `${digits}@zohrat.local`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: signupPass,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName.trim(),
          mobile_phone: digits,
          whatsapp_phone: digits,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);

    // Flag to show WelcomeGuide on Home after registration.
    if (data.user) {
      try { localStorage.removeItem(`welcome_guide_done_${data.user.id}`); } catch { /* ignore */ }
    }

    // If email confirmation is off (default here), session exists → auto-login.
    if (data.session) {
      toast.success("تم إنشاء الحساب");
      navigate({ to: "/" });
      return;
    }

    // Fallback: sign in explicitly.
    const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: signupPass });
    if (signInErr || !signInData.session) {
      toast.success("تم إنشاء الحساب — سجل الدخول للمتابعة");
      return;
    }
    toast.success("تم إنشاء الحساب");
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: "var(--gradient-hero)" }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-block bg-white rounded-2xl p-3 shadow-[var(--shadow-elegant)]">
            <Logo size={64} />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-white">{BRAND.name}</h1>
          <p className="text-white/70 text-sm mt-1 inline-flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" /> دخول العملاء والمسؤولين
          </p>
        </div>
        <div className="surface-card p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="signin">دخول</TabsTrigger>
              <TabsTrigger value="signup">إنشاء حساب</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 mt-4">
              <div>
                <Label>رقم الجوال أو اسم المستخدم</Label>
                <div className="relative mt-2">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input dir="ltr" className="h-12 rounded-xl text-right pr-10" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="05xxxxxxxx" />
                </div>
              </div>
              <div>
                <Label>كلمة المرور</Label>
                <div className="relative mt-2">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input dir="ltr" className="h-12 rounded-xl text-right pr-10" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
                </div>
              </div>
              <Button onClick={signIn} disabled={loading} className="w-full h-12 rounded-xl btn-primary-glow font-bold">
                {loading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                تسجيل الدخول
              </Button>
            </TabsContent>

            <TabsContent value="signup" className="space-y-4 mt-4">
              <div>
                <Label>الاسم الكامل</Label>
                <Input className="mt-2 h-12 rounded-xl" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>رقم الجوال</Label>
                <div className="relative mt-2">
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input dir="ltr" className="h-12 rounded-xl text-right pr-10" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="05xxxxxxxx" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">لا يمكن استخدام نفس الرقم في أكثر من حساب.</p>
              </div>
              <div>
                <Label>كلمة المرور</Label>
                <div className="relative mt-2">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input dir="ltr" className="h-12 rounded-xl text-right pr-10" type="password" value={signupPass} onChange={(e) => setSignupPass(e.target.value)} />
                </div>
              </div>
              <Button onClick={signUp} disabled={loading} className="w-full h-12 rounded-xl btn-primary-glow font-bold">
                {loading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                إنشاء حساب
              </Button>
              <p className="text-xs text-muted-foreground text-center">سيتم تسجيل دخولك تلقائياً بعد إنشاء الحساب.</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
