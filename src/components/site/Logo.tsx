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
    <div className="flex items-center gap-3">
      <img
        src={logoUrl || BRAND.logoUrl}
        alt={BRAND.name}
        width={size}
        height={size}
        className="rounded-full ring-2 ring-[color:var(--color-gold)]/40 bg-white object-contain p-1 shadow"
        style={{ width: size, height: size }}
        loading="eager"
      />
      {withText && (
        <div className="flex flex-col leading-tight">
          <span className={`text-sm font-extrabold ${light ? "text-white" : "text-navy"}`}>{BRAND.shortName}</span>
          <span className={`text-[11px] ${light ? "text-white/70" : "text-muted-foreground"}`}>للعمرة والرحلات</span>
        </div>
      )}
    </div>
  );
}
