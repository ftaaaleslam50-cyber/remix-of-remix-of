import { MessageCircle } from "lucide-react";

// Fixed URL requested by owner — do not modify.
const WHATSAPP_URL =
  "https://api.whatsapp.com/send/?phone=966573890050&text&type=phone_number&app_absent=0";

export function FloatingWhatsApp() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل عبر واتساب"
      className="fixed bottom-6 left-6 z-40 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.6)] hover:scale-110 transition-transform"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}
