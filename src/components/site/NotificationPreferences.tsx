import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { DEFAULT_PREFS, NOTIF_CATEGORIES, loadPrefs, savePrefs, type NotifPrefs } from "@/hooks/useUserNotifications";
import { currentPushEndpoint, deletePushDevice, deviceLabel, listPushDevices, setPushDeviceActive, type PushDevice } from "@/lib/push-notifications";
import { formatDateTime } from "@/lib/format";

function Row({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0"><span className="block text-sm font-bold">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function NotificationPreferences({ userId }: { userId: string }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void loadPrefs(userId).then((p) => { setPrefs(p); setLoading(false); }); }, [userId]);

  const set = (patch: Partial<NotifPrefs>) => setPrefs((p) => ({ ...p, ...patch }));
  const catOn = (k: string) => prefs.categories[k] !== false;

  async function save() {
    setSaving(true);
    const { error } = await savePrefs(userId, prefs);
    setSaving(false);
    if (error) toast.error("تعذّر حفظ الإعدادات"); else toast.success("تم حفظ إعدادات الإشعارات");
  }

  if (loading) return <section className="surface-card p-5 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></section>;

  return (
    <section className="surface-card p-5 space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <span className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0"><SlidersHorizontal className="h-5 w-5" /></span>
        <div><h2 className="font-extrabold">إعدادات الإشعارات</h2><p className="text-sm text-muted-foreground">تحكم بما يصلك وكيف يصلك.</p></div>
      </div>

      <div className="divide-y">
        <Row label="الإشعارات" hint="إيقافها يوقف كل الإشعارات غير الأمنية" checked={prefs.enabled} onChange={(v) => set({ enabled: v })} />
        <Row label="إشعارات الهاتف" checked={prefs.push_enabled} onChange={(v) => set({ push_enabled: v })} disabled={!prefs.enabled} />
        <Row label="التنبيه داخل الموقع" checked={prefs.toast_enabled} onChange={(v) => set({ toast_enabled: v })} disabled={!prefs.enabled} />
        <Row label="الصوت" checked={prefs.sound_enabled} onChange={(v) => set({ sound_enabled: v })} disabled={!prefs.enabled} />
        <Row label="الاهتزاز" hint="إذا كان الجهاز يدعمه" checked={prefs.vibrate_enabled} onChange={(v) => set({ vibrate_enabled: v })} disabled={!prefs.enabled} />
        <Row label="حركة الجرس" checked={prefs.bell_animation} onChange={(v) => set({ bell_animation: v })} />
        <div className="py-2 space-y-2">
          <Row label="ساعات الهدوء" hint="لا صوت ولا إشعارات هاتف خلالها، عدا العاجل" checked={prefs.dnd_enabled} onChange={(v) => set({ dnd_enabled: v })} />
          {prefs.dnd_enabled && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">من<Input type="time" value={prefs.dnd_start} onChange={(e) => set({ dnd_start: e.target.value })} /></label>
              <label className="text-xs">إلى<Input type="time" value={prefs.dnd_end} onChange={(e) => set({ dnd_end: e.target.value })} /></label>
            </div>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-sm mb-1">التصنيفات</h3>
        <div className="grid sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0">
          {NOTIF_CATEGORIES.map((c) => (
            <Row key={c.key} label={c.label} checked={catOn(c.key)} disabled={!prefs.enabled}
              onChange={(v) => set({ categories: { ...prefs.categories, [c.key]: v } })} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-1">تنبيهات أمان الحساب تصلك دائمًا.</p>
      </div>

      <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl font-bold">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ الإعدادات"}
      </Button>
    </section>
  );
}

export function PushDevices({ userId, refreshKey = 0 }: { userId: string; refreshKey?: number }) {
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    const [list, ep] = await Promise.all([listPushDevices(userId), currentPushEndpoint()]);
    setDevices(list); setCurrent(ep);
  }
  useEffect(() => { void reload(); }, [userId, refreshKey]);

  async function toggle(d: PushDevice) {
    setBusy(d.id);
    await setPushDeviceActive(d.id, !d.is_active);
    await reload(); setBusy(null);
  }
  async function del(d: PushDevice) {
    const isCurrent = d.endpoint === current;
    if (!confirm(isCurrent ? "هذا هو الجهاز الحالي. سيتوقف وصول الإشعارات إليه. هل تريد المتابعة؟" : "حذف هذا الجهاز من حسابك؟")) return;
    setBusy(d.id);
    await deletePushDevice(d.id);
    await reload(); setBusy(null);
    toast.success("تم حذف الجهاز");
  }

  if (!devices.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-bold text-sm">الأجهزة المسجلة</h3>
      {devices.map((d) => (
        <div key={d.id} className="flex items-center gap-3 rounded-xl border p-3">
          <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold truncate">{deviceLabel(d.user_agent)} {d.endpoint === current && <span className="text-xs text-primary">(هذا الجهاز)</span>}</p>
            <p className="text-[11px] text-muted-foreground">{d.is_active ? "مفعّل" : "معطّل"} • آخر تحديث {formatDateTime(d.updated_at)}</p>
          </div>
          <Switch checked={d.is_active} disabled={busy === d.id} onCheckedChange={() => toggle(d)} />
          <button onClick={() => del(d)} disabled={busy === d.id} className="p-2 rounded-lg hover:bg-muted text-destructive" title="حذف"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  );
}
