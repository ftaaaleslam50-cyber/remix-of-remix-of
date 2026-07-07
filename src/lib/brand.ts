export const BRAND = {
  name: "مؤسسة زهرة طيبة للعمرة",
  shortName: "زهرة طيبة",
  email: "zhrttybt888@gmail.com",
  nationalNumber: "7029663460",
  whatsapp: "966573890050",
  logoUrl: "https://i.ibb.co/8ntds0qQ/image.png",
  tagline: "رحلات عمرة منظمة من المدينة المنورة إلى مكة المكرمة",
};

export const NAV_LINKS = [
  { to: "/", label: "الرئيسية" },
  { to: "/booking", label: "الحجز" },
  { to: "/draw", label: "السحب" },
  { to: "/gallery", label: "المعرض" },
  { to: "/contact", label: "تواصل معنا" },
] as const;

export function whatsappLink(text?: string) {
  const num = BRAND.whatsapp.replace(/\D/g, "");
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
