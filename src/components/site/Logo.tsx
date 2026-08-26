import { motion } from "framer-motion";
import { BRAND } from "@/lib/brand";
import logoUrl from "@/assets/brand-logo.png";

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
  void glowScale;
  const imgPadding = 0;

  return (
    <div className="flex items-center gap-4">
          <motion.img
            key="logo-image"
            src={logoUrl}
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
