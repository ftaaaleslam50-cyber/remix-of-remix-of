import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { ShieldCheck, LogIn, UserPlus, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Booking CTA: if the visitor is not logged in, shows a polished modal
 * offering تسجيل الدخول / إنشاء حساب / المتابعة كزائر. Logged-in users go
 * straight to /booking. Renders as a Button — pass styling via className.
 */
export function BookNowLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUserId(session?.user?.id ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  function handleClick() {
    if (userId) {
      navigate({ to: "/booking" });
    } else {
      setOpen(true);
    }
  }

  return (
    <>
      <Button className={className} onClick={handleClick}>
        {children}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          {/* Header band */}
          <div className="relative px-6 pt-7 pb-5 text-center text-white" style={{ background: "var(--gradient-hero)" }}>
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 left-3 h-8 w-8 inline-flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white"
              aria-label="إغلاق"
            >
              ✕
            </button>
            <div className="mx-auto mb-3 h-14 w-14 rounded-2xl bg-white/95 shadow-lg flex items-center justify-center">
              <Logo size={40} />
            </div>
            <h2 className="text-lg font-extrabold flex items-center justify-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              تنبيه قبل إتمام الحجز
            </h2>
          </div>

          <DialogHeader className="px-6 pt-5 pb-1 sr-only">
            <DialogTitle>تنبيه قبل إتمام الحجز</DialogTitle>
          </DialogHeader>

          {/* Body */}
          <div className="px-6 pb-6 pt-1">
            <p className="text-center text-sm text-muted-foreground leading-relaxed">
              أنت لم تقم بتسجيل الدخول. من الأفضل أن تقوم بتسجيل الدخول حتى تتمكن من
              إدارة حجوزاتك والتعديل عليها في أي وقت.
            </p>
            <p className="mt-3 text-center text-sm font-semibold text-foreground">
              هل تفضل تسجيل حساب للاستفادة من إدارة حجوزاتك، أم تريد المتابعة بالحجز
              كزائر لمرة واحدة؟
            </p>

            {/* Primary row: login + signup */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Button
                onClick={() => navigate({ to: "/auth" })}
                className="h-11 rounded-xl btn-primary-glow font-bold"
              >
                <LogIn className="ml-2 h-4 w-4" />
                تسجيل الدخول
              </Button>
              <Button
                onClick={() => navigate({ to: "/auth" })}
                variant="outline"
                className="h-11 rounded-xl font-bold"
              >
                <UserPlus className="ml-2 h-4 w-4" />
                إنشاء حساب جديد
              </Button>
            </div>

            {/* Divider */}
            <div className="my-4 flex items-center gap-3 text-muted-foreground">
              <span className="flex-1 h-px bg-border" />
              <span className="text-xs">أو</span>
              <span className="flex-1 h-px bg-border" />
            </div>

            {/* Continue as guest */}
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                navigate({ to: "/booking" });
              }}
              className="h-11 w-full rounded-xl font-semibold text-foreground hover:bg-muted"
            >
              المتابعة كزائر
              <ArrowLeft className="mr-2 h-4 w-4" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
