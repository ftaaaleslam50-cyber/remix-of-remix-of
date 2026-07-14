import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, Phone, MessageCircle, Lock, User } from "lucide-react";
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

// Normalize an arbitrary phone/username to a synthetic email used as Supabase login identifier.
function identifierToEmail(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t.includes("@")) return t.toLowerCase();
  // Digits only → mobile-based synthetic email
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 6 && /^\+?\d+$/.test(t.replace(/\s/g, ""))) {
    return `${digits}@zohrat.local`;
  }
  // Username fallback (e.g. Abo3taa2)
  return `${t.toLowerCase()}@zohrat.local`;
}

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // Login
  const [loginId, setLoginId] = useState("");
  const [loginPass, setLoginPass] = useState("");

  // Signup
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [signupPass, setSignupPass] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
    // Best-effort default-admin bootstrap (idempotent).
    if (!bootstrapped) {
      fetch("/api/public/bootstrap-admin", { method: "POST" }).catch(() => {});
      setBootstrapped(true);
    }
  }, [navigate, bootstrapped]);

  async function signIn() {
    if (!loginId || !loginPass) return toast.error("أدخل رقم الجوال أو اسم المستخدم وكلمة المرور");
    setLoading(true);
    const email = identifierToEmail(loginId);
    const { error } = await supabase.auth.signInWithPassword({ email, password: loginPass });
    setLoading(false);
    if (error) return toast.error("بيانات الدخول غير صحيحة");
    toast.success("مرحباً بك");
    navigate({ to: "/dashboard" });
  }

  async function signUp() {
    if (!fullName || !mobile || !signupPass) return toast.error("الاسم والجوال وكلمة المرور مطلوبة");
    setLoading(true);
    const digits = mobile.replace(/\D/g, "");
    const email = `${digits}@zohrat.local`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: signupPass,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: fullName,
          mobile_phone: digits,
          whatsapp_phone: (whatsapp || mobile).replace(/\D/g, ""),
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("تم إنشاء الحساب");
      navigate({ to: "/" });
    } else {
      toast.success("تم إنشاء الحساب — يمكنك تسجيل الدخول الآن");
    }
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
                  <Input
                    dir="ltr"
                    className="h-12 rounded-xl text-right pr-10"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="05xxxxxxxx"
                  />
                </div>
              </div>
              <div>
                <Label>كلمة المرور</Label>
                <div className="relative mt-2">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    dir="ltr"
                    className="h-12 rounded-xl text-right pr-10"
                    type="password"
                    value={loginPass}
                    onChange={(e) => setLoginPass(e.target.value)}
                  />
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
                  <Input
                    dir="ltr"
                    className="h-12 rounded-xl text-right pr-10"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="05xxxxxxxx"
                  />
                </div>
              </div>
              <div>
                <Label>رقم الواتساب (اختياري)</Label>
                <div className="relative mt-2">
                  <MessageCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    dir="ltr"
                    className="h-12 rounded-xl text-right pr-10"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="نفس رقم الجوال إذا كان مطابقاً"
                  />
                </div>
              </div>
              <div>
                <Label>كلمة المرور</Label>
                <div className="relative mt-2">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    dir="ltr"
                    className="h-12 rounded-xl text-right pr-10"
                    type="password"
                    value={signupPass}
                    onChange={(e) => setSignupPass(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">قوة كلمة المرور ليست مطلوبة.</p>
              </div>
              <Button onClick={signUp} disabled={loading} className="w-full h-12 rounded-xl btn-primary-glow font-bold">
                {loading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                إنشاء حساب
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                بدون رمز تحقق — يمكنك الدخول مباشرة بعد التسجيل.
              </p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
