import { MessageCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/lib/brand";

export function FloatingWhatsApp() {
  const { data } = useQuery({
    queryKey: ["floating-whatsapp"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("whatsapp")
        .eq("id", 1)
        .maybeSingle();
      return data as { whatsapp: string | null } | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const number = (data?.whatsapp || BRAND.whatsapp).replace(/\D/g, "");
  const href = `https://wa.me/${number}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل عبر واتساب"
      className="fixed bottom-6 left-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.6)] hover:scale-110 transition-transform"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
