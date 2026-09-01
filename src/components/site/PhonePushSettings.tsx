import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getPushPermission, hasCurrentPushSubscription, registerPushSubscription, removeCurrentPushSubscription, type PushPermissionState } from '@/lib/push-notifications';

export function PhonePushSettings({ userId }: { userId: string }) {
  const [permission, setPermission] = useState<PushPermissionState>(() => getPushPermission());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void hasCurrentPushSubscription(userId).then(setEnabled); }, [userId]);

  async function enable() {
    setBusy(true);
    const result = await registerPushSubscription(userId);
    setBusy(false);
    setPermission(getPushPermission());
    if (result.ok) { setEnabled(true); toast.success('تم تفعيل إشعارات الهاتف'); }
    else if (result.reason === 'denied') toast.error('تم رفض الإذن. اسمح بالإشعارات من إعدادات المتصفح أو الهاتف.');
    else if (result.reason === 'unsupported') toast.error('هذا المتصفح لا يدعم إشعارات الهاتف.');
    else toast.error('تعذر تفعيل إشعارات الهاتف، حاول مرة أخرى.');
  }

  return (
    <section className="surface-card p-5 space-y-4" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">{enabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}</span>
        <div className="min-w-0 flex-1"><h2 className="font-extrabold">إشعارات الهاتف</h2><p className="text-sm text-muted-foreground mt-1">استقبل تحديثات الحجوزات حتى عند إغلاق الموقع.</p></div>
        <span className={`text-xs font-bold whitespace-nowrap ${enabled ? 'text-emerald-600' : 'text-muted-foreground'}`}>{enabled ? 'مفعلة' : 'غير مفعلة'}</span>
      </div>
      {permission === 'denied' && <p className="text-xs text-destructive">تم منع الإشعارات. افتح إعدادات المتصفح أو الهاتف واسمح بها ثم أعد المحاولة.</p>}
      {permission === 'unsupported' && <p className="text-xs text-muted-foreground">تحتاج هذه الميزة إلى Android Chrome أو Safari الحديث بعد إضافة الموقع إلى الشاشة الرئيسية.</p>}
      {!enabled && permission !== 'denied' && permission !== 'unsupported' && <Button onClick={enable} disabled={busy} className="w-full h-11 rounded-xl font-bold"><Smartphone className="h-4 w-4 ml-2" />{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تفعيل إشعارات الهاتف'}</Button>}
      {enabled && <p className="text-xs text-emerald-700">ستصل الإشعارات إلى قائمة إشعارات جهازك، ويمكن ربط أكثر من جهاز بحسابك.</p>}
    </section>
  );
}
