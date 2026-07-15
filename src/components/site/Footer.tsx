import { BRAND } from "@/lib/brand";

export function Footer() {
  return (
    <footer className="mt-16 border-t bg-white">
      <div className="container-luxe py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} {BRAND.name}. جميع الحقوق محفوظة.
      </div>
    </footer>
  );
}
