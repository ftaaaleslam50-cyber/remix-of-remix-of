import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User as UserIcon, Ticket, Sparkles, ArrowRight, ArrowLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const KEY_PREFIX = "welcome_guide_done_";

export function WelcomeGuide() {
  const [uid, setUid] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    function check(userId: string) {
      setUid(userId);
      if (typeof window !== "undefined" && !localStorage.getItem(KEY_PREFIX + userId)) {
        setOpen(true);
      }
    }
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) check(user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) check(session.user.id);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  function finish() {
    if (uid) localStorage.setItem(KEY_PREFIX + uid, "1");
    setOpen(false);
  }

  const steps = [
    {
      icon: <UserIcon className="h-12 w-12 text-primary" />,
      title: "أكمل ملفك الشخصي",
      body: "مرحباً بك! إكمال ملفك الشخصي يجعل حجوزاتك القادمة أسرع وأسهل. ننصح بإكمال: صورة الملف الشخصي، الاسم الكامل، رقم الجوال، رقم الواتساب، رقم الهوية، والجنسية.",
      cta: { to: "/profile", label: "الذهاب إلى الملف الشخصي" },
    },
    {
      icon: <Ticket className="h-12 w-12 text-primary" />,
      title: "حجوزاتي",
      body: "يمكنك من صفحة حجوزاتي: عرض جميع حجوزاتك، تعديل الحجوزات النشطة، حذف الحجوزات النشطة، ومتابعة حالة كل حجز.",
      cta: { to: "/my-bookings", label: "الذهاب إلى حجوزاتي" },
    },
    {
      icon: <Sparkles className="h-12 w-12 text-primary" />,
      title: "ابدأ الحجز",
      body: "معالج الحجز سيقوم تلقائياً بتعبئة بياناتك من ملفك الشخصي لتوفير وقتك.",
      cta: { to: "/booking", label: "ابدأ حجزك الأول" },
    },
  ] as const;

  const cur = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <button onClick={finish} className="absolute top-3 left-3 z-10 h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80" aria-label="إغلاق">
          <X className="h-4 w-4" />
        </button>
        <div className="p-6 pt-10 text-center">
          <div className="flex justify-center mb-4">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">{cur.icon}</div>
          </div>
          <div className="text-xs text-muted-foreground mb-2">الخطوة {step + 1} من {steps.length}</div>
          <div className="flex justify-center gap-2 mb-4">
            {steps.map((_, i) => (
              <div key={i} className={`h-2 rounded-full transition-all ${i === step ? "w-8 bg-primary" : i < step ? "w-2 bg-primary/60" : "w-2 bg-muted"}`} />
            ))}
          </div>
          <h2 className="text-xl font-extrabold mb-2">{cur.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">{cur.body}</p>

          <Link to={cur.cta.to} onClick={finish}>
            <Button className={`w-full rounded-xl ${isLast ? "h-14 text-lg" : "h-12"} btn-primary-glow font-bold mb-3`}>
              {cur.cta.label}
            </Button>
          </Link>

          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="gap-1">
              <ArrowRight className="h-4 w-4" /> السابق
            </Button>
            <Button variant="ghost" size="sm" onClick={finish}>تخطي</Button>
            {isLast ? (
              <Button variant="ghost" size="sm" onClick={finish} className="gap-1">إنهاء</Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setStep(Math.min(steps.length - 1, step + 1))} className="gap-1">
                التالي <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
