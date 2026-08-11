import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

const SPRAY_COUNT = 14;

function LuxuryLogoLoader({ size, glowScale = 1 }: { size: number; glowScale?: number }) {
  const coreSize = size * 0.42;
  const glowSize = size * 0.78 * glowScale;
  const blurPx = Math.max(1.5, size * 0.05 * glowScale);

  return (
    <motion.div
      key="luxury-loader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex items-center justify-center rounded-full luxury-loader-root"
      style={{ width: size, height: size }}
    >
      <style>{`
        @keyframes luxuryCorePulse {
          0%   { transform: scale(0.72); opacity: 0.55; }
          45%  { transform: scale(1.05); opacity: 1; }
          70%  { transform: scale(1); opacity: 0.9; }
          100% { transform: scale(0.72); opacity: 0.55; }
        }
        @keyframes luxuryCoreGlow {
          0%   { transform: scale(0.6); opacity: 0.25; }
          45%  { transform: scale(1.3); opacity: 0.55; }
          100% { transform: scale(0.6); opacity: 0.25; }
        }
        @keyframes luxurySpray {
          0%   { transform: translate(-50%, -50%) rotate(var(--angle)) translateX(0) scale(0.3); opacity: 0; }
          15%  { opacity: 1; }
          35%  { opacity: 0.9; }
          100% { transform: translate(-50%, -50%) rotate(var(--angle)) translateX(var(--dist)) scale(0.15); opacity: 0; }
        }
        .luxury-loader-root * { will-change: transform, opacity; }
      `}</style>

      {/* Outer soft glow — proportional to size */}
      <div
        className="absolute rounded-full"
        style={{
          width: glowSize,
          height: glowSize,
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-gold) 60%, transparent) 0%, transparent 70%)",
          filter: `blur(${blurPx}px)`,
          animation: "luxuryCoreGlow 1.8s ease-in-out infinite",
        }}
      />

      {/* Golden spray particles bursting outward on every pulse */}
      {Array.from({ length: SPRAY_COUNT }).map((_, i) => {
        const angle = (360 / SPRAY_COUNT) * i;
        const dist = size * (0.42 + (i % 3) * 0.06) * glowScale;
        const dotSize = Math.max(1.5, size * (0.03 + (i % 3) * 0.008) * Math.max(glowScale, 0.6));
        const duration = 1.8;
        const delay = (i / SPRAY_COUNT) * duration * 0.4;
        return (
          <span
            key={i}
            className="absolute rounded-full"
            style={
              {
                left: "50%",
                top: "50%",
                width: dotSize,
                height: dotSize,
                background: "var(--color-gold)",
                boxShadow: "0 0 5px 1px color-mix(in srgb, var(--color-gold) 85%, transparent)",
                "--angle": `${angle}deg`,
                "--dist": `${dist}px`,
                animation: `luxurySpray ${duration}s ease-out infinite`,
                animationDelay: `${delay}s`,
              } as React.CSSProperties
            }
          />
        );
      })}

      {/* Breathing golden core */}
      <div
        className="absolute rounded-full"
        style={{
          width: coreSize,
          height: coreSize,
          background:
            "radial-gradient(circle, white 0%, var(--color-gold) 55%, color-mix(in srgb, var(--color-gold) 60%, transparent) 100%)",
          boxShadow: "0 0 16px 2px color-mix(in srgb, var(--color-gold) 70%, transparent)",
          animation: "luxuryCorePulse 1.8s ease-in-out infinite",
        }}
      />
    </motion.div>
  );
}

export function Logo({
  size = 48,
  withText = false,
  light = false,
  glowScale,
}: {
  size?: number;
  withText?: boolean;
  light?: boolean;
  glowScale?: number;
}) {
  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ["app_settings_logo"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
      return (data as { logo_url?: string | null } | null)?.logo_url || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Small navbar-scale logos get a much tighter halo so it never reads
  // bigger than the logo circle itself — half the previous small-size scale.
  const resolvedGlowScale = glowScale ?? (size <= 64 ? 0.375 : 1);
  const imgPadding = Math.max(1, Math.round(size * (size <= 64 ? 0.06 : 0.14)));

  return (
    <div className="flex items-center gap-4">
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <LuxuryLogoLoader size={size} glowScale={resolvedGlowScale} />
        ) : logoUrl ? (
          <motion.img
            key="logo-image"
            src={logoUrl}
            alt={BRAND.name}
            width={size}
            height={size}
            loading="eager"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="
              rounded-full
              bg-gradient-to-br
              from-white
              to-gray-100
              object-contain
              ring-2
              ring-[color:var(--color-gold)]/60
              border
              border-white/40
              shadow-2xl
              transition-all
              duration-300
              hover:scale-105
            "
            style={{
              width: size,
              height: size,
              padding: imgPadding,
            }}
          />
        ) : (
          <div
            key="logo-fallback"
            className="
              rounded-full
              bg-muted
              border-2
              border-dashed
              border-muted-foreground/30
              flex
              items-center
              justify-center
              text-muted-foreground
              font-bold
              shadow
            "
            style={{
              width: size,
              height: size,
            }}
          >
            Logo
          </div>
        )}
      </AnimatePresence>
      {withText && (
        <div className="flex flex-col leading-tight">
          <span className={`text-base font-extrabold ${light ? "text-white" : "text-navy"}`}>{BRAND.shortName}</span>
          <span className={`text-xs font-bold ${light ? "text-white/80" : "text-muted-foreground"}`}>
            لتنظيم الرحلات
          </span>
        </div>
      )}
    </div>
  );
}
