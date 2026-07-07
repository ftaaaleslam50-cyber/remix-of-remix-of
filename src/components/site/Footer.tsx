import { Link } from "@tanstack/react-router";
import { Mail, Phone, MapPin } from "lucide-react";
import { Logo } from "./Logo";
import { BRAND, NAV_LINKS } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-20 bg-[color:var(--color-navy)] text-white">
      <div className="container-luxe py-14 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo size={56} withText light />
          <p className="mt-4 text-white/70 leading-relaxed max-w-md">
            {BRAND.tagline}. نقدّم لك تجربة عمرة منظّمة بأعلى معايير الراحة والموثوقية مع باقات
            متعددة تناسب الأفراد والعوائل.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm text-white/80">
            <span className="inline-flex items-center gap-2"><Mail className="h-4 w-4" /> {BRAND.email}</span>
            <span className="inline-flex items-center gap-2"><Phone className="h-4 w-4" /> الرقم الموحد: {BRAND.nationalNumber}</span>
          </div>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-white">روابط سريعة</h4>
          <ul className="space-y-2 text-white/70">
            {NAV_LINKS.map((l) => (
              <li key={l.to}><Link to={l.to} className="hover:text-white transition">{l.label}</Link></li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-bold mb-4 text-white">انطلاق الرحلة</h4>
          <p className="text-white/70 inline-flex items-start gap-2"><MapPin className="h-4 w-4 mt-1" /> المدينة المنورة — وصولاً إلى مكة المكرمة</p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-luxe py-5 flex flex-col md:flex-row items-center justify-between gap-2 text-sm text-white/60">
          <p>© {new Date().getFullYear()} {BRAND.name}. جميع الحقوق محفوظة.</p>
          <p>الرقم الوطني الموحد: {BRAND.nationalNumber}</p>
        </div>
      </div>
    </footer>
  );
}
