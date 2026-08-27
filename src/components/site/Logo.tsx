import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BRAND } from "@/lib/brand";
import logoUrl from "@/assets/brand-logo.png";
import { supabase } from "@/integrations/supabase/client";
import { resolveDisplayUrl } from "@/lib/asset-url";

/** Logo uploaded from site settings — falls back instantly to the bundled asset. */
function useSettingsLogo() {
  const { data } = useQuery({
    queryKey: ["site-logo-url"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();
      const raw = (data as { logo_url?: string | null } | null)?.logo_url || null;
      if (!raw) return null;
      return await resolveDisplayUrl(raw);
    },
  });
  return data || logoUrl;
}

export function Logo({
  size = 48,
  withText = false,
  light = false,
  glowScale = 1,
}: {
  size?: number;
  withText?: boolean;
  light?: boolean;
  glowScale?: number;
}) {
  const src = useSettingsLogo();
  const ringSize = size * 1.35 * glowScale;

  return (
    <div className="flex items-center gap-4">
      <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        {/* Animated glow + orbiting rings behind the logo */}
        <motion.span
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: ringSize,
            height: ringSize,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--color-gold) 55%, transparent) 0%, transparent 68%)",
          }}
          animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.92, 1.06, 0.92] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          aria-hidden
          className="absolute rounded-full border border-dashed border-[color:var(--color-gold)]/60"
          style={{ width: ringSize, height: ringSize }}
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          aria-hidden
          className="absolute rounded-full ring-2 ring-[color:var(--color-gold)]/40"
          style={{ width: size * 1.12, height: size * 1.12 }}
          animate={{ opacity: [0.2, 0.6, 0.2], scale: [1, 1.08, 1] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.img
          key="logo-image"
          src={src}
          alt={BRAND.name}
          width={size}
          height={size}
          loading="eager"
          fetchPriority="high"
          decoding="sync"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="
            relative
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
          style={{ width: size, height: size, padding: 0 }}
        />
      </div>
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
