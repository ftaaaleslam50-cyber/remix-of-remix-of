import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

const PARTICLE_COUNT = 8;

function LuxuryLogoLoader({ size }: { size: number }) {
  const radius = size / 2 - 4;
  const dotSize = Math.max(3, size * 0.045);

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
        @keyframes luxuryGlowPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.85); }
          50% { opacity: 0.9; transform: scale(1.08); }
        }
        @keyframes luxuryRingBreathe {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.95; transform: scale(1.07); }
        }
        @keyframes luxuryOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes luxuryParticleFade {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
        @keyframes luxuryShineSweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .luxury-loader-root * { will-change: transform, opacity; }
      `}</style>

      {/* Soft golden glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-gold) 55%, transparent) 0%, transparent 70%)",
          filter: "blur(6px)",
          animation: "luxuryGlowPulse 2.4s ease-in-out infinite",
        }}
      />

      {/* Orbiting golden particles */}
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
        const angle = (360 / PARTICLE_COUNT) * i;
        const orbitDuration = 2.6 + i * 0.22;
        return (
          <div
            key={i}
            className="absolute inset-0"
            style={{
              animation: `luxuryOrbit ${orbitDuration}s linear infinite`,
              transform: `rotate(${angle}deg)`,
            }}
          >
            <span
              className="absolute rounded-full"
              style={{
                width: dotSize,
                height: dotSize,
                left: "50%",
                top: "50%",
                marginLeft: -dotSize / 2,
                marginTop: -radius - dotSize / 2,
                background: "var(--color-gold)",
                boxShadow: "0 0 6px 1px color-mix(in srgb, var(--color-gold) 80%, transparent)",
                animation: `luxuryParticleFade ${1.6 + i * 0.15}s ease-in-out infinite`,
                animationDelay: `${i * 0.12}s`,
              }}
            />
          </div>
        );
      })}

      {/* Breathing core ring */}
      <div
        className="absolute rounded-full border"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderColor: "color-mix(in srgb, var(--color-gold) 60%, transparent)",
          animation: "luxuryRingBreathe 2s ease-in-out infinite",
        }}
      />

      {/* Luxury shine sweep */}
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{ WebkitMaskImage: "radial-gradient(circle, black 100%, transparent 100%)" }}
      >
        <div
          className="absolute inset-[-50%]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--color-gold) 90%, white) 8deg, transparent 20deg, transparent 360deg)",
            animation: "luxuryShineSweep 1s linear infinite",
          }}
        />
      </div>
    </motion.div>
  );
}

export function Logo({
  size = 48,
  withText = false,
  light = false,
}: {
  size?: number;
  withText?: boolean;
  light?: boolean;
}) {
  const { data: logoUrl, isLoading } = useQuery({
    queryKey: ["app_settings_logo"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
      return (data as { logo_url?: string | null } | null)?.logo_url || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex items-center gap-4">
      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <LuxuryLogoLoader size={size} />
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
              p-3
              ring-4
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
