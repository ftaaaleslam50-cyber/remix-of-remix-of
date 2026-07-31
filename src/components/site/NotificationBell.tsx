import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Check,
  Archive,
  Search,
  RotateCcw,
  Trash2,
  Settings,
  Inbox,
  CalendarCheck,
  Ticket,
  Bus,
  Hotel,
  Cog,
  Play,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AssetPicker, type AssetSelection, assetKind } from "@/components/admin/AssetPicker";
import defaultTone from "@/assets/notification-default.mp3";

import { resolveDisplayUrl } from "@/lib/asset-url";
import { formatDate } from "@/lib/format";

/* ============================ types ============================ */

export type NotifCategory = "bookings" | "coupons" | "buses" | "hotels" | "system";

interface Notif {
  id: string;
  type: string;
  category: NotifCategory | string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  archived: boolean;
  created_at: string;
}

interface NotifSettings {
  id: number;
  sound_enabled: boolean;
  toast_enabled: boolean;
  browser_enabled: boolean;
  vibrate_enabled: boolean;
  bell_animation: boolean;
  show_counter: boolean;
  cat_bookings: boolean;
  cat_coupons: boolean;
  cat_buses: boolean;
  cat_hotels: boolean;
  cat_system: boolean;
  dnd_enabled: boolean;
  dnd_start: string;
  dnd_end: string;
  sound_url: string | null;
}

const CATEGORIES: {
  key: NotifCategory;
  label: string;
  icon: typeof Bell;
  color: string;
  bg: string;
}[] = [
  { key: "bookings", label: "الحجوزات", icon: CalendarCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
  { key: "coupons", label: "الخصومات", icon: Ticket, color: "text-amber-600", bg: "bg-amber-50" },
  { key: "buses", label: "الحافلات", icon: Bus, color: "text-sky-600", bg: "bg-sky-50" },
  { key: "hotels", label: "الفنادق", icon: Hotel, color: "text-violet-600", bg: "bg-violet-50" },
  { key: "system", label: "النظام", icon: Cog, color: "text-slate-600", bg: "bg-slate-100" },
];

function catMeta(cat: string) {
  return CATEGORIES.find((c) => c.key === cat) ?? CATEGORIES[4];
}

/** Bucket a notification into today / yesterday / this week / older. */
function bucketOf(iso: string): "today" | "yesterday" | "week" | "older" {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return "today";
  if (t >= startOfToday - 86400000) return "yesterday";
  if (t >= startOfToday - 6 * 86400000) return "week";
  return "older";
}

const BUCKET_LABELS: Record<string, string> = {
  today: "اليوم",
  yesterday: "أمس",
  week: "هذا الأسبوع",
  older: "أقدم",
};

/** Bundled default notification tone. */
const DEFAULT_SOUND = defaultTone;


/** true when "now" falls inside the configured do-not-disturb window (can wrap midnight). */
function inDnd(s: NotifSettings): boolean {
  if (!s.dnd_enabled) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = (s.dnd_start ?? "22:00").split(":").map(Number);
  const [eh, em] = (s.dnd_end ?? "07:00").split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start <= end ? mins >= start && mins < end : mins >= start || mins < end;
}

function categoryEnabled(s: NotifSettings, cat: string): boolean {
  switch (cat) {
    case "bookings":
      return s.cat_bookings;
    case "coupons":
      return s.cat_coupons;
    case "buses":
      return s.cat_buses;
    case "hotels":
      return s.cat_hotels;
    default:
      return s.cat_system;
  }
}

/* ============================ component ============================ */

export function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [tab, setTab] = useState<"inbox" | "archive" | "settings">("inbox");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<"all" | NotifCategory>("all");
  const [settings, setSettings] = useState<NotifSettings | null>(null);
  const [soundSrc, setSoundSrc] = useState<string | null>(null);
  const settingsRef = useRef<NotifSettings | null>(null);
  const bootedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  settingsRef.current = settings;

  const unread = items.filter((n) => !n.read && !n.archived).length;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications" as never)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setItems((data as unknown as Notif[]) ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    const { data } = await supabase
      .from("notification_settings" as never)
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (data) setSettings(data as unknown as NotifSettings);
  }, []);

  useEffect(() => {
    load();
    loadSettings();
  }, [load, loadSettings]);

  // Resolve the (possibly private-storage) sound URL into something playable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = settings?.sound_url;
      if (!url) return setSoundSrc(null);
      const resolved = await resolveDisplayUrl(url);
      if (!cancelled) setSoundSrc(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [settings?.sound_url]);

  const alertFor = useCallback(
    (n: Notif) => {
      const s = settingsRef.current;
      if (!s) return;
      if (!categoryEnabled(s, n.category)) return;
      if (inDnd(s)) return;

      if (s.toast_enabled) toast(n.title, { description: n.body ?? undefined });
      if (s.sound_enabled) {
        try {
          const a = audioRef.current ?? new Audio();
          audioRef.current = a;
          a.src = soundSrc || DEFAULT_SOUND;
          a.volume = 0.6;
          void a.play().catch(() => {});
        } catch {
          /* autoplay blocked */
        }
      }
      if (s.vibrate_enabled && typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate?.(120);
        } catch {
          /* ignore */
        }
      }
      if (s.browser_enabled && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification(n.title, { body: n.body ?? undefined });
          } catch {
            /* ignore */
          }
        }
      }
    },
    [soundSrc],
  );

  // Realtime: new notifications trigger the configured alerts.
  useEffect(() => {
    const ch = supabase
      .channel("notif-bell")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload) => {
        const n = payload.new as unknown as Notif;
        setItems((prev) => [n, ...prev.filter((p) => p.id !== n.id)]);
        if (bootedRef.current) alertFor(n);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications" }, () => load())
      .subscribe();
    bootedRef.current = true;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [alertFor, load]);

  /* -------- mutations -------- */
  async function markAllRead() {
    await supabase
      .from("notifications" as never)
      .update({ read: true } as never)
      .eq("read", false);
    toast.success("تم تحديد الكل كمقروء");
    load();
  }
  async function markRead(id: string) {
    await supabase
      .from("notifications" as never)
      .update({ read: true } as never)
      .eq("id", id);
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }
  async function archive(id: string) {
    await supabase
      .from("notifications" as never)
      .update({ archived: true, read: true } as never)
      .eq("id", id);
    load();
  }
  async function unarchive(id: string) {
    await supabase
      .from("notifications" as never)
      .update({ archived: false } as never)
      .eq("id", id);
    load();
  }
  async function remove(id: string) {
    if (!confirm("حذف نهائي؟")) return;
    await supabase
      .from("notifications" as never)
      .delete()
      .eq("id", id);
    setItems((prev) => prev.filter((n) => n.id !== id));
  }

  async function openNotif(n: Notif) {
    if (!n.read) await markRead(n.id);
    if (n.link) navigate({ to: n.link });
  }

  async function saveSettings(patch: Partial<NotifSettings>) {
    if (!settings) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    const { id: _id, ...rest } = next;
    const { error } = await supabase
      .from("notification_settings" as never)
      .update(rest as never)
      .eq("id", 1);
    if (error) toast.error(error.message);
  }

  async function enableBrowser(v: boolean) {
    if (v && typeof window !== "undefined" && "Notification" in window && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") return toast.error("تم رفض إذن إشعارات المتصفح");
    }
    saveSettings({ browser_enabled: v });
  }

  /* -------- derived -------- */
  const filtered = useMemo(() => {
    const inTab = items.filter((n) => (tab === "archive" ? n.archived : !n.archived));
    const byCat = cat === "all" ? inTab : inTab.filter((n) => n.category === cat);
    const q = search.trim().toLowerCase();
    if (!q) return byCat;
    return byCat.filter((n) => n.title.toLowerCase().includes(q) || (n.body ?? "").toLowerCase().includes(q));
  }, [items, tab, cat, search]);

  const grouped = useMemo(() => {
    const g: Record<string, Notif[]> = { today: [], yesterday: [], week: [], older: [] };
    for (const n of filtered) g[bucketOf(n.created_at)].push(n);
    return g;
  }, [filtered]);

  const showCounter = settings?.show_counter ?? true;
  const animate = (settings?.bell_animation ?? true) && unread > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="relative rounded-full bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white"
        >
          <Bell className={`h-4 w-4 ${animate ? "animate-bounce" : ""}`} />
          {showCounter && unread > 0 && (
            <span className="absolute -top-1 -left-1 h-5 min-w-5 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(26rem,92vw)] p-0">
        <div className="px-3 py-2 border-b space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">مركز الإشعارات</span>
            {tab === "inbox" && unread > 0 && (
              <Button size="sm" variant="ghost" onClick={markAllRead}>
                <Check className="h-3 w-3 ml-1" /> قراءة الكل
              </Button>
            )}
          </div>

          <div className="inline-flex bg-muted rounded-full p-0.5 w-full">
            <button
              className={`flex-1 px-2 py-1 rounded-full text-xs font-bold ${tab === "inbox" ? "bg-white shadow" : "text-muted-foreground"}`}
              onClick={() => setTab("inbox")}
            >
              <Inbox className="h-3 w-3 inline ml-1" />
              الوارد ({items.filter((n) => !n.archived).length})
            </button>
            <button
              className={`flex-1 px-2 py-1 rounded-full text-xs font-bold ${tab === "archive" ? "bg-white shadow" : "text-muted-foreground"}`}
              onClick={() => setTab("archive")}
            >
              <Archive className="h-3 w-3 inline ml-1" />
              المؤرشفة ({items.filter((n) => n.archived).length})
            </button>
            <button
              className={`flex-1 px-2 py-1 rounded-full text-xs font-bold ${tab === "settings" ? "bg-white shadow" : "text-muted-foreground"}`}
              onClick={() => setTab("settings")}
            >
              <Settings className="h-3 w-3 inline ml-1" />
              الإعدادات
            </button>
          </div>

          {tab !== "settings" && (
            <>
              <div className="flex gap-1 flex-wrap">
                <button
                  onClick={() => setCat("all")}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${cat === "all" ? "bg-primary text-white border-primary" : "bg-white"}`}
                >
                  الكل
                </button>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setCat(c.key)}
                    className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${cat === c.key ? "bg-primary text-white border-primary" : `${c.bg} ${c.color}`}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث..."
                  className="h-8 pr-7 text-xs"
                />
              </div>
            </>
          )}
        </div>

        {tab === "settings" ? (
          <SettingsPanel
            settings={settings}
            soundSrc={soundSrc}
            onChange={saveSettings}
            onBrowserChange={enableBrowser}
          />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {filtered.length === 0 && <p className="text-center text-xs text-muted-foreground py-8">لا توجد إشعارات</p>}
            {(["today", "yesterday", "week", "older"] as const).map((b) =>
              grouped[b].length === 0 ? null : (
                <div key={b}>
                  <p className="px-3 py-1 text-[10px] font-bold text-muted-foreground bg-muted/60 sticky top-0">
                    {BUCKET_LABELS[b]}
                  </p>
                  {grouped[b].map((n) => {
                    const m = catMeta(n.category);
                    const Icon = m.icon;
                    return (
                      <div
                        key={n.id}
                        className={`px-3 py-2 border-b last:border-b-0 ${!n.read && !n.archived ? "bg-primary/5" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 h-7 w-7 rounded-lg grid place-items-center ${m.bg} ${m.color}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <button onClick={() => openNotif(n)} className="min-w-0 flex-1 text-right">
                            <p className="text-sm font-bold">{n.title}</p>
                            {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                            <p className="text-[10px] text-muted-foreground mt-1">{formatDate(n.created_at)}</p>
                          </button>
                          <div className="flex gap-1 shrink-0">
                            {!n.read && !n.archived && (
                              <button
                                onClick={() => markRead(n.id)}
                                title="تحديد كمقروء"
                                className="p-1 hover:bg-muted rounded"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                            {!n.archived ? (
                              <button onClick={() => archive(n.id)} title="أرشفة" className="p-1 hover:bg-muted rounded">
                                <Archive className="h-3 w-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => unarchive(n.id)}
                                title="استرجاع"
                                className="p-1 hover:bg-muted rounded"
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              onClick={() => remove(n.id)}
                              title="حذف"
                              className="p-1 hover:bg-muted rounded text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ),
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ============================ settings panel ============================ */

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SettingsPanel({
  settings,
  soundSrc,
  onChange,
  onBrowserChange,
}: {
  settings: NotifSettings | null;
  soundSrc: string | null;
  onChange: (patch: Partial<NotifSettings>) => void;
  onBrowserChange: (v: boolean) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  if (!settings) return <p className="text-center text-xs text-muted-foreground py-8">جارٍ التحميل…</p>;

  function preview() {
    try {
      const a = new Audio(soundSrc || DEFAULT_SOUND);
      a.volume = 0.6;
      void a.play().catch(() => toast.error("تعذر تشغيل الصوت"));
    } catch {
      toast.error("تعذر تشغيل الصوت");
    }
  }

  function onPick(a: AssetSelection) {
    const isAudio =
      assetKind({ mime_type: a.mime_type, name: a.name, storage_path: a.storage_path }) === "audio" ||
      /\.(mp3|wav|ogg|m4a|aac|flac)(\?|$)/i.test(a.storage_path || a.url);
    if (!isAudio) {
      return toast.error("اختر ملف صوت (mp3, wav, ogg, m4a)");
    }

    onChange({ sound_url: a.url });
    toast.success("تم تعيين نغمة الإشعار");
  }


  return (
    <div className="max-h-96 overflow-y-auto p-3 space-y-3">
      <section>
        <p className="text-xs font-extrabold mb-1">التنبيهات</p>
        <Toggle label="صوت الإشعارات" checked={settings.sound_enabled} onChange={(v) => onChange({ sound_enabled: v })} />
        <Toggle label="إشعارات Toast" checked={settings.toast_enabled} onChange={(v) => onChange({ toast_enabled: v })} />
        <Toggle label="إشعارات المتصفح" checked={settings.browser_enabled} onChange={onBrowserChange} />
        <Toggle label="اهتزاز الهاتف" checked={settings.vibrate_enabled} onChange={(v) => onChange({ vibrate_enabled: v })} />
        <Toggle label="حركة الجرس" checked={settings.bell_animation} onChange={(v) => onChange({ bell_animation: v })} />
        <Toggle label="عداد الإشعارات" checked={settings.show_counter} onChange={(v) => onChange({ show_counter: v })} />
      </section>

      <section className="border-t pt-2">
        <p className="text-xs font-extrabold mb-1">أنواع الإشعارات</p>
        <Toggle label="الحجوزات" checked={settings.cat_bookings} onChange={(v) => onChange({ cat_bookings: v })} />
        <Toggle label="الخصومات" checked={settings.cat_coupons} onChange={(v) => onChange({ cat_coupons: v })} />
        <Toggle label="الحافلات" checked={settings.cat_buses} onChange={(v) => onChange({ cat_buses: v })} />
        <Toggle label="الفنادق" checked={settings.cat_hotels} onChange={(v) => onChange({ cat_hotels: v })} />
        <Toggle label="النظام" checked={settings.cat_system} onChange={(v) => onChange({ cat_system: v })} />
      </section>

      <section className="border-t pt-2">
        <p className="text-xs font-extrabold mb-1">وضع عدم الإزعاج</p>
        <Toggle label="تفعيل عدم الإزعاج" checked={settings.dnd_enabled} onChange={(v) => onChange({ dnd_enabled: v })} />
        {settings.dnd_enabled && (
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div>
              <Label className="text-[10px]">من</Label>
              <Input
                type="time"
                className="h-8 text-xs"
                value={(settings.dnd_start ?? "22:00").slice(0, 5)}
                onChange={(e) => onChange({ dnd_start: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-[10px]">إلى</Label>
              <Input
                type="time"
                className="h-8 text-xs"
                value={(settings.dnd_end ?? "07:00").slice(0, 5)}
                onChange={(e) => onChange({ dnd_end: e.target.value })}
              />
            </div>
          </div>
        )}
      </section>

      <section className="border-t pt-2">
        <p className="text-xs font-extrabold mb-1 flex items-center gap-1">
          <Volume2 className="h-3.5 w-3.5" /> نغمة الإشعار
        </p>
        <p className="text-[10px] text-muted-foreground mb-2 break-all">
          {settings.sound_url ? settings.sound_url.split("/").pop() : "النغمة الافتراضية"}
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={preview}>
            <Play className="h-3 w-3 ml-1" /> معاينة
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            {settings.sound_url ? "تغيير" : "اختيار من المكتبة"}
          </Button>
          {settings.sound_url && (
            <>
              <Button size="sm" variant="outline" onClick={() => onChange({ sound_url: null })}>
                <Trash2 className="h-3 w-3 ml-1" /> حذف
              </Button>
              <Button size="sm" variant="outline" onClick={() => onChange({ sound_url: null })}>
                <RotateCcw className="h-3 w-3 ml-1" /> الافتراضية
              </Button>
            </>
          )}
        </div>
        <AssetPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={onPick} />
      </section>
    </div>
  );
}
