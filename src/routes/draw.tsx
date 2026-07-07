import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, Gift, Ticket, Clock, AlertTriangle, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import { toast } from "sonner";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

export const Route = createFileRoute("/draw")({
  head: () => ({
    meta: [
      { title: `عجلة السحب | ${BRAND.name}` },
      { name: "description", content: "جرّب حظك واحصل على خصومات مميزة على رحلات العمرة." },
    ],
  }),
  component: DrawPage,
});

interface Segment {
  id: string;
  label: string;
  color: string;
  prize_type: "lose" | "percent" | "fixed";
  prize_value: number;
  probability_weight: number;
  display_order: number;
  active: boolean;
}

interface Config {
  enabled: boolean;
  spin_cooldown_days: number;
  coupon_expiry_hours: number;
  title: string;
  subtitle: string;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^05\d{8}$/.test(digits)) return "966" + digits.slice(1);
  if (/^9665\d{8}$/.test(digits)) return digits;
  if (/^009665\d{8}$/.test(digits)) return digits.slice(2);
  if (/^5\d{8}$/.test(digits)) return "966" + digits;
  return null;
}

function generateCouponCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `ZT-${s}`;
}

function pickWeighted<T extends { probability_weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + Number(i.probability_weight || 0), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= Number(it.probability_weight || 0);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function DrawPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerSegment, setWinnerSegment] = useState<Segment | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const [showBlocked, setShowBlocked] = useState<{ nextDate: Date } | null>(null);
  const spinLockRef = useRef(false);

  const { data: config } = useQuery({
    queryKey: ["wheel_config"],
    queryFn: async () => {
      const { data } = await supabase.from("wheel_config" as never).select("*").eq("id", 1).maybeSingle();
      return (data as unknown as Config) ?? null;
    },
  });

  const { data: segments = [] } = useQuery({
    queryKey: ["wheel_segments"],
    queryFn: async () => {
      const { data } = await supabase.from("wheel_segments" as never).select("*").eq("active", true).order("display_order");
      return ((data as unknown as Segment[]) ?? []);
    },
  });

  const N = segments.length;
  const sliceAngle = N > 0 ? 360 / N : 0;

  async function fetchClientIp(): Promise<string | null> {
    try {
      const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const j = await res.json();
      return typeof j?.ip === "string" ? j.ip : null;
    } catch {
      return null;
    }
  }

  async function attemptSpin() {
    if (spinLockRef.current || spinning) return;
    const normalized = normalizePhone(phone);
    if (!normalized) {
      toast.error("رقم الجوال غير صحيح — استخدم 05XXXXXXXX أو +966XXXXXXXXX");
      return;
    }
    if (!segments.length) {
      toast.error("العجلة غير مهيّأة");
      return;
    }
    if (!config?.enabled) {
      toast.error("عجلة السحب معطّلة حالياً");
      return;
    }
    spinLockRef.current = true;
    setSpinning(true);
    try {
      const clientIp = await fetchClientIp();
      // Hybrid: block if phone OR ip has recently spun
      const cutoff = new Date(Date.now() - config.spin_cooldown_days * 24 * 60 * 60 * 1000).toISOString();
      const orFilter = clientIp ? `phone.eq.${normalized},ip.eq.${clientIp}` : `phone.eq.${normalized}`;
      const { data: recent } = await supabase
        .from("wheel_spins" as never)
        .select("spun_at")
        .or(orFilter)
        .gte("spun_at", cutoff)
        .order("spun_at", { ascending: false })
        .limit(1);
      const rec = (recent as unknown as { spun_at: string }[] | null) ?? [];
      if (rec.length > 0) {
        const nextDate = new Date(new Date(rec[0].spun_at).getTime() + config.spin_cooldown_days * 24 * 60 * 60 * 1000);
        setShowBlocked({ nextDate });
        setSpinning(false);
        spinLockRef.current = false;
        return;
      }

      // Pick winner (weighted)
      const winner = pickWeighted(segments);
      const winnerIndex = segments.findIndex((s) => s.id === winner.id);
      // Target rotation: land pointer (top, 0°) on center of winner slice.
      // Slices drawn clockwise from top starting at index 0.
      const targetCenter = winnerIndex * sliceAngle + sliceAngle / 2;
      const spins = 6; // full rotations for suspense
      const finalRotation = rotation + spins * 360 + (360 - targetCenter);
      setRotation(finalRotation);

      // After spin completes
      await new Promise((r) => setTimeout(r, 5200));

      // Create coupon if winner
      let code: string | null = null;
      if (winner.prize_type !== "lose") {
        code = generateCouponCode();
        const expiry = new Date(Date.now() + config.coupon_expiry_hours * 60 * 60 * 1000).toISOString();
        await supabase.from("coupons" as never).insert({
          code,
          phone: normalized,
          prize_type: winner.prize_type,
          prize_value: winner.prize_value,
          label: winner.label,
          expiry_date: expiry,
        } as never);
      }

      // Log spin (with IP)
      await supabase.from("wheel_spins" as never).insert({
        phone: normalized,
        ip: clientIp,
        segment_id: winner.id,
      } as never);

      setWinnerSegment(winner);
      setCouponCode(code);
      setShowWinner(true);
      if (winner.prize_type !== "lose") {
        confetti({ particleCount: 180, spread: 100, origin: { y: 0.6 } });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "خطأ";
      toast.error("تعذر إتمام السحب: " + msg);
    } finally {
      setSpinning(false);
      spinLockRef.current = false;
    }
  }

  const wheelStyle = useMemo(
    () => ({
      transform: `rotate(${rotation}deg)`,
      transition: spinning ? "transform 5s cubic-bezier(0.15, 0.85, 0.25, 1)" : "none",
    }),
    [rotation, spinning]
  );

  return (
    <SiteLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-navy)" }} />
        <div className="container-luxe py-14 text-white text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-1.5 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-[color:var(--color-gold)]" />
            {config?.subtitle ?? "جرّب حظك واحصل على خصومات مميزة"}
          </div>
          <h1 className="mt-4 text-3xl md:text-5xl font-extrabold">{config?.title ?? "عجلة السحب"}</h1>
        </div>
      </section>

      <section className="container-luxe py-14">
        <div className="max-w-2xl mx-auto surface-card p-8 text-center">
          <div className="relative mx-auto aspect-square w-full max-w-[380px] sm:max-w-[420px]">
            {/* Pointer */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-3 z-20">
              <div className="w-0 h-0 border-l-[18px] border-l-transparent border-r-[18px] border-r-transparent border-t-[28px] border-t-primary drop-shadow-[0_4px_6px_rgba(0,0,0,0.3)]" />
            </div>
            {/* Wheel */}
            <div
              className="relative w-full h-full rounded-full overflow-hidden shadow-[0_20px_50px_-10px_rgba(0,0,0,0.35)] border-[6px] border-[color:var(--color-gold)]"
              style={wheelStyle}
            >
              <WheelSvg segments={segments} />
            </div>
            {/* Center hub */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 h-16 w-16 rounded-full bg-white border-4 border-[color:var(--color-gold)] shadow-lg flex items-center justify-center">
              <Gift className="h-7 w-7 text-primary" />
            </div>
          </div>

          <div className="mt-8 max-w-md mx-auto text-right">
            <Label className="font-semibold">رقم الجوال</Label>
            <Input
              dir="ltr"
              className="mt-2 h-12 rounded-xl text-right"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="أدخل رقم الجوال لتتمكن من السحب"
              disabled={spinning}
            />
          </div>

          <Button
            onClick={attemptSpin}
            disabled={spinning || !config?.enabled}
            size="lg"
            className="btn-primary-glow rounded-full mt-6 h-14 px-10 text-base font-bold"
          >
            {spinning ? <Loader2 className="h-5 w-5 ml-2 animate-spin" /> : <Sparkles className="h-5 w-5 ml-2" />}
            {spinning ? "جاري السحب..." : "ابدأ السحب"}
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            يحق لكل مستخدم السحب مرة واحدة فقط كل {config?.spin_cooldown_days ?? 30} يوماً.
          </p>
        </div>
      </section>

      {/* Winner modal */}
      <Dialog open={showWinner} onOpenChange={setShowWinner}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">
              {winnerSegment?.prize_type === "lose" ? "حظاً أوفر 🌹" : "تهانينا 🎉"}
            </DialogTitle>
          </DialogHeader>
          {winnerSegment && (
            <div className="space-y-4">
              <div className="mx-auto h-24 w-24 rounded-full flex items-center justify-center" style={{ background: winnerSegment.color }}>
                <Gift className="h-12 w-12 text-white" />
              </div>
              <p className="text-lg font-bold">{winnerSegment.label}</p>
              {couponCode && (
                <>
                  <div className="rounded-2xl bg-muted p-4">
                    <p className="text-xs text-muted-foreground">كود الخصم</p>
                    <p className="text-2xl font-extrabold tracking-widest text-primary" dir="ltr">{couponCode}</p>
                  </div>
                  <Button
                    className="btn-primary-glow rounded-full w-full"
                    onClick={() => {
                      setShowWinner(false);
                      setShowWarn(true);
                    }}
                  >
                    <Ticket className="h-4 w-4 ml-2" /> استخدم الكوبون الآن
                  </Button>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Warning modal after win */}
      <Dialog open={showWarn} onOpenChange={setShowWarn}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-xl text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-warning" />
              تنبيه مهم
            </DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground leading-relaxed">
            إذا أردت الاستفادة من الكوبون، انتقل مباشرة إلى صفحة الحجز الآن.
            في حال مغادرة الصفحة أو انتهاء صلاحية الكوبون قد تفقد فرصة استخدامه.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full flex-1" onClick={() => setShowWarn(false)}>لاحقاً</Button>
            <Button
              className="btn-primary-glow rounded-full flex-1"
              onClick={() => {
                if (couponCode) localStorage.setItem("pending_coupon", couponCode);
                navigate({ to: "/booking" });
              }}
            >
              الانتقال للحجز الآن
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Blocked modal */}
      <Dialog open={!!showBlocked} onOpenChange={(o) => !o && setShowBlocked(null)}>
        <DialogContent className="max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-xl text-center">تم استخدام فرصة السحب لهذا الشهر</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="leading-relaxed">لقد استخدمت فرصة السحب لهذا الشهر 🌹</p>
            {showBlocked && (
              <p className="text-sm text-muted-foreground">
                يمكنك المحاولة مرة أخرى بعد: <span className="font-bold text-foreground">{showBlocked.nextDate.toLocaleDateString("ar-SA")}</span>
              </p>
            )}
            <Button variant="outline" className="rounded-full w-full" onClick={() => setShowBlocked(null)}>حسناً</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}

function WheelSvg({ segments }: { segments: Segment[] }) {
  const N = segments.length;
  if (N === 0) return <div className="w-full h-full bg-muted" />;
  const cx = 200, cy = 200, r = 200;
  const slice = 360 / N;
  const toRad = (d: number) => ((d - 90) * Math.PI) / 180;
  return (
    <svg viewBox="0 0 400 400" className="w-full h-full">
      {segments.map((s, i) => {
        const start = i * slice;
        const end = (i + 1) * slice;
        const x1 = cx + r * Math.cos(toRad(start));
        const y1 = cy + r * Math.sin(toRad(start));
        const x2 = cx + r * Math.cos(toRad(end));
        const y2 = cy + r * Math.sin(toRad(end));
        const large = slice > 180 ? 1 : 0;
        const midAngle = start + slice / 2;
        const tx = cx + r * 0.6 * Math.cos(toRad(midAngle));
        const ty = cy + r * 0.6 * Math.sin(toRad(midAngle));
        return (
          <g key={s.id}>
            <path
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`}
              fill={s.color}
              stroke="#fff"
              strokeWidth={2}
            />
            <text
              x={tx}
              y={ty}
              transform={`rotate(${midAngle} ${tx} ${ty})`}
              fill="#fff"
              fontSize={N > 6 ? 12 : 14}
              fontWeight="bold"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.3)", strokeWidth: 2 } as React.CSSProperties}
            >
              {s.label.length > 22 ? s.label.slice(0, 20) + "…" : s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// avoid unused warning
void Link;
