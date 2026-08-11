export const BRAND = {
  name: "مؤسسة زهرة طيبة لتنظيم الرحلات",
  shortName: "زهرة طيبة",
  email: "zhrttybt888@gmail.com",
  nationalNumber: "7029663460",
  whatsapp: "966502728301",
  logoUrl: "https://i.ibb.co/8ntds0qQ/image.png",
  tagline: "انطلق من مسجد قباء إلى مكة المكرمة",
};

export const SITE_TITLE = "زهرة طيبة | رحلات عمرة من المدينة إلى مكة";
export const SITE_DESCRIPTION =
  "احجز رحلة عمرة منظّمة من المدينة المنورة إلى مكة المكرمة مع زهرة طيبة: باقات أفراد وعوائل، فنادق مختارة، حافلات حديثة، وأسعار شفافة.";

export const NAV_LINKS = [
  { to: "/", label: "الرئيسية" },
  { to: "/booking", label: "الحجز" },
  { to: "/packages", label: "الباقات" },
  { to: "/draw", label: "السحب" },
  { to: "/gallery", label: "المعرض" },
  { to: "/contact", label: "تواصل معنا" },
] as const;

export function whatsappLink(text?: string) {
  const num = BRAND.whatsapp.replace(/\D/g, "");
  return `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
