import { useEffect, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Menu, X, User as UserIcon, LogOut, LayoutDashboard } from "lucide-react";
import { Logo } from "./Logo";
import { NAV_LINKS } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

export function Navbar() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    async function hydrate(uid: string | null) {
      setUserId(uid);
      if (!uid) { setDisplayName(""); setAvatarUrl(""); setIsAdmin(false); return; }
      const [{ data: prof }, { data: role }] = await Promise.all([
        supabase.from("profiles").select("full_name,avatar_url,mobile_phone").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid).eq("role", "admin").maybeSingle(),
      ]);
      setDisplayName(prof?.full_name || prof?.mobile_phone || "حسابي");
      setIsAdmin(!!role);
      if (prof?.avatar_url) {
        const { data } = await supabase.storage.from("avatars").createSignedUrl(prof.avatar_url, 3600);
        if (data?.signedUrl) setAvatarUrl(data.signedUrl);
      } else setAvatarUrl("");
    }
    supabase.auth.getUser().then(({ data }) => hydrate(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => hydrate(session?.user?.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  }

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${scrolled ? "glass-bar shadow-[var(--shadow-soft)]" : "bg-transparent"}`}
    >
      <div className="container-luxe flex h-20 items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3">
          <Logo size={48} withText />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.to;
            return (
              <Link key={link.to} to={link.to}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  active ? "bg-[color:var(--color-navy)] text-white shadow-sm" : "text-foreground/80 hover:bg-muted hover:text-foreground"
                }`}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {userId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 h-11 pr-3 pl-1 rounded-full bg-white/80 backdrop-blur border shadow-sm hover:shadow-md transition">
                  <span className="text-sm font-semibold text-foreground max-w-[120px] truncate">{displayName}</span>
                  <span className="h-9 w-9 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                    {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserIcon className="h-4 w-4 text-muted-foreground" />}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem asChild><Link to="/profile" className="cursor-pointer"><UserIcon className="h-4 w-4 ml-2" /> الملف الشخصي</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/my-bookings" className="cursor-pointer">🎫 حجوزاتي</Link></DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem asChild><Link to="/dashboard" className="cursor-pointer"><LayoutDashboard className="h-4 w-4 ml-2" /> لوحة التحكم</Link></DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer text-red-600"><LogOut className="h-4 w-4 ml-2" /> خروج</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth"><Button variant="outline" className="rounded-full h-11 px-5 font-bold">دخول</Button></Link>
          )}
          <Link to="/booking">
            <Button className="btn-primary-glow hover:btn-primary-glow-hover rounded-full h-11 px-6 font-bold">احجز الآن</Button>
          </Link>
        </div>

        <button className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted" onClick={() => setOpen(!open)} aria-label="القائمة">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden glass-bar border-t">
          <div className="container-luxe py-4 flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">{link.label}</Link>
            ))}
            {userId ? (
              <>
                <Link to="/profile" className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">الملف الشخصي</Link>
                {isAdmin && <Link to="/dashboard" className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">لوحة التحكم</Link>}
                <button onClick={signOut} className="text-right px-4 py-3 rounded-xl text-base font-semibold text-red-600 hover:bg-muted">خروج</button>
              </>
            ) : (
              <Link to="/auth" className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">دخول</Link>
            )}
            <Link to="/booking" className="mt-2">
              <Button className="btn-primary-glow w-full rounded-xl h-12 font-bold">احجز الآن</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
