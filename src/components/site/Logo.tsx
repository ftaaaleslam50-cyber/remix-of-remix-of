import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

const PARTICLE_COUNT = 8;

function LuxuryLogoLoader({ size }: { size: number }) {
  const particles = Array.from({ length: PARTICLE_COUNT });
  const radius = size / 2 - 4;

  return (
    <motion.div
      key="luxury-loader"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="relative flex items-center justify-center rounded-full"
      style={{ width: size, height: size }}
    >
      {/* Soft golden glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--color-gold) 55%, transparent) 0%, transparent 70%)",
          filter: "blur(6px)",
        }}
        animate={{ opacity: [0.4, 0.85, 0.4], scale: [0.85, 1.05, 0.85] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Orbiting golden particles */}
      {particles.map((_, i) => {
        const angle = (360 / PARTICLE_COUNT) * i;
        const duration = 2.6 + i * 0.22;
        const dotSize = Math.max(3, size * 0.045);

        return (
          <motion.div
            key={i}
            className="absolute inset-0"
            style={{ transformOrigin: "50% 50%" }}
            animate={{ rotate: [angle, angle + 360] }}
            transition={{ duration, repeat: Infinity, ease: "linear" }}
          >
            <motion.span
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
              }}
              animate={{ opacity: [0.25, 1, 0.25] }}
              transition={{
                duration: 1.6 + i * 0.15,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.12,
              }}
            />
          </motion.div>
        );
      })}

      {/* Breathing core ring */}
      <motion.div
        className="absolute rounded-full border"
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderColor: "color-mix(in srgb, var(--color-gold) 60%, transparent)",
        }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Luxury shine sweep */}
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{ WebkitMaskImage: "radial-gradient(circle, black 100%, transparent 100%)" }}
      >
        <motion.div
          className="absolute inset-[-50%]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, color-mix(in srgb, var(--color-gold) 90%, white) 8deg, transparent 20deg, transparent 360deg)",
          }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
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
