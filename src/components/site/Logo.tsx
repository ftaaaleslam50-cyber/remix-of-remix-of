import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

export function Logo({
  size = 48,
  withText = false,
  light = false,
}: {
  size?: number;
  withText?: boolean;
  light?: boolean;
}) {
  const { data: logoUrl } = useQuery({
    queryKey: ["app_settings_logo"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("logo_url").eq("id", 1).maybeSingle();

      return (data as { logo_url?: string | null } | null)?.logo_url || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex items-center gap-4">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={BRAND.name}
          width={size}
          height={size}
          loading="eager"
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
