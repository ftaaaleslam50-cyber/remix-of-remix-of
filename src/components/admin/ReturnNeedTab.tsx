// تبويب «إدارة العودة والاحتياج»: الإعدادات + احتياج الحافلات لكل رحلة عودة وتاريخ + تقرير الإسنادات غير الصالحة.
// قراءة فقط للبيانات؛ لا يعدّل أي حجز أو حافلة تلقائيًا.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { plannedBuses, returnStateOf } from "@/lib/return-need";
import { formatTripDate } from "@/lib/trip-dates";
import { isUpcomingReturn, planningTripId, riyadhToday, type PlanningReturnTrip } from "@/lib/return-planning-dates";

interface Bk {
  id: string; booking_code: string; customer_name: string; passenger_count: number; trip_mode: string;
  actual_return_date: string | null; return_trip_id: string | null; return_bus_id: string | null;
  return_seat_numbers: string[] | null;
}
interface Link { return_trip_id: string; trip_date: string; bus_id: string }
interface BusRow { id: string; name: string | null; bus_number: number; capacity: number; layout_id: string | null; direction?: string | null; status?: string | null }
interface RT extends PlanningReturnTrip { name: string }


export function ReturnNeedTab() {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => new Date());
  const today = riyadhToday(now);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  const { data: settings } = useQuery({
    queryKey: ["return_need_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("return_seat_selection_enabled,return_extra_threshold,return_planning_capacity,return_extra_bus_enabled").eq("id", 1).maybeSingle();
      return (data ?? { return_seat_selection_enabled: true, return_extra_threshold: 15, return_planning_capacity: 48, return_extra_bus_enabled: true }) as {
        return_extra_bus_enabled: boolean; return_seat_selection_enabled: boolean; return_extra_threshold: number; return_planning_capacity: number;
      };
    },
  });
  const [form, setForm] = useState({ enabled: true, T: 15, cap: 48, extra: true });
  useEffect(() => {
    if (settings) setForm({ enabled: settings.return_seat_selection_enabled, T: settings.return_extra_threshold, cap: settings.return_planning_capacity, extra: settings.return_extra_bus_enabled ?? true });
  }, [settings]);

  async function saveSettings() {
    if (form.T < 0 || form.cap < 1) return toast.error("قيم غير صالحة");
    const { error } = await supabase.from("app_settings").update({
      return_seat_selection_enabled: form.enabled, return_extra_threshold: form.T, return_planning_capacity: form.cap, return_extra_bus_enabled: form.extra,
    } as never).eq("id", 1);
    if (error) return toast.error("تعذر الحفظ: " + error.message);
    toast.success("تم حفظ إعدادات العودة");
    void qc.invalidateQueries({ queryKey: ["return_need_settings"] });
  }

  const { data, isLoading, isError, error: loadError, refetch, isFetching } = useQuery({
    retry: 1,
    refetchInterval: 5000,
    queryKey: ["return_need_data", today],
    queryFn: async () => {
      const [bk, links, rts, buses] = await Promise.all([
        supabase.from("bookings").select("id,booking_code,customer_name,passenger_count,trip_mode,actual_return_date,return_trip_id,return_bus_id,return_seat_numbers")
          .is("deleted_at", null).neq("status", "cancelled").not("actual_return_date", "is", null).gte("actual_return_date", today).limit(5000),
        supabase.from("return_trip_buses").select("return_trip_id,trip_date,bus_id").gte("trip_date", today),
        supabase.from("return_trips").select("id,name,return_date,return_time,weekday"),
        supabase.from("buses").select("id,name,bus_number,capacity,layout_id,direction,status"),
      ]);
      const firstErr = bk.error ?? links.error ?? rts.error ?? buses.error;
      if (firstErr) throw new Error(firstErr.message);
      const bookings = (bk.data ?? []) as unknown as Bk[];
      const busIds = Array.from(new Set([...(links.data ?? []).map((l) => l.bus_id), ...bookings.map((b) => b.return_bus_id).filter(Boolean) as string[]]));
      const labels: Record<string, string[]> = {};
      await Promise.all(busIds.map(async (id) => {
        // استدعاء مباشر يحافظ على سياق العميل (this)؛ الاستدعاء المنفصل كان يفشل بصمت.
        const { data, error } = await supabase.rpc("bus_seat_labels" as never, { _bus_id: id } as never);
        if (error) throw new Error(`تعذر قراءة مخطط الحافلة: ${error.message}`);
        labels[id] = (data as unknown as string[] | null) ?? [];
      }));
      return { bookings, links: (links.data ?? []) as Link[], rts: (rts.data ?? []) as RT[], buses: (buses.data ?? []) as BusRow[], labels };
    },
  });

  async function addReturnBus(tripId: string, date: string, linked: Set<string>) {
    if (!data) return;
    const busyOnDate = new Set(data.links.filter((l) => l.trip_date === date).map((l) => l.bus_id));
    const pick = data.buses
      .filter((b) => (b.direction ?? "outbound") === "return" && (b.status ?? "active") === "active" && !linked.has(b.id) && !busyOnDate.has(b.id))
      .sort((a, z) => a.bus_number - z.bus_number)[0];
    if (!pick) return toast.error("لا توجد حافلة عودة متاحة في الأسطول لهذا التاريخ — أضف حافلة عودة من إدارة الحافلات أولًا");
    if (!confirm(`ربط ${pick.name || `حافلة ${pick.bus_number}`} برحلة العودة بتاريخ ${date}؟`)) return;
    const { error } = await supabase.from("return_trip_buses").insert({ return_trip_id: tripId, trip_date: date, bus_id: pick.id } as never);
    if (error) return toast.error("تعذر الإضافة: " + error.message);
    toast.success("تمت إضافة حافلة العودة");
    void refetch();
  }

  const T = form.T, CAP = form.cap;
  const report = useMemo(() => {
    if (!data) return null;
    const busById = new Map(data.buses.map((b) => [b.id, b]));
    const rtName = new Map(data.rts.map((r) => [r.id, r.name]));
    const upcoming = (date: string | null, tripId: string | null) => isUpcomingReturn(date, data.rts.find((r) => r.id === tripId)?.return_time ?? null, now);
    const links = data.links.filter((l) => upcoming(l.trip_date, l.return_trip_id));
    const bookings = data.bookings.filter((b) => b.actual_return_date && upcoming(b.actual_return_date, planningTripId(b.actual_return_date, b.return_trip_id, data.rts, links)));
    const linkKey = (t: string, d: string, b: string) => `${t}|${d}|${b}`;
    const linkSet = new Set(data.links.map((l) => linkKey(l.return_trip_id, l.trip_date, l.bus_id)));
    // رحلات العودة المعروفة لكل تاريخ (للحجوزات غير المسندة)
    const tripsOnDate = new Map<string, Set<string>>();

    type G = { key: string; tripId: string | null; date: string; pax: number; confirmed: number; pending: number; invalid: number; busIds: Set<string> };
    const groups = new Map<string, G>();
    const g = (tripId: string | null, date: string) => {
      const key = `${tripId ?? "?"}|${date}`;
      let x = groups.get(key);
      if (!x) groups.set(key, (x = { key, tripId, date, pax: 0, confirmed: 0, pending: 0, invalid: 0, busIds: new Set() }));
      return x;
    };
    for (const l of links) g(l.return_trip_id, l.trip_date).busIds.add(l.bus_id);

    const issues: { code: string; name: string; date: string; problem: string; action: string }[] = [];
    const pending: { code: string; name: string; date: string; pax: number; reason: string; buses: { name: string; free: number }[] }[] = [];
    // تكرارات وتجاوز السعة لكل حافلة/تاريخ
    const seatOwners = new Map<string, string[]>();
    const usedPerBus = new Map<string, number>();
    for (const b of bookings) {
      if (!b.return_bus_id || !b.actual_return_date) continue;
      for (const s of b.return_seat_numbers ?? []) {
        const k = `${b.return_bus_id}|${b.actual_return_date}|${s}`;
        seatOwners.set(k, [...(seatOwners.get(k) ?? []), b.booking_code]);
      }
      const k2 = `${b.return_bus_id}|${b.actual_return_date}`;
      usedPerBus.set(k2, (usedPerBus.get(k2) ?? 0) + (b.return_seat_numbers?.length ?? 0));
    }

    for (const b of bookings) {
      const date = b.actual_return_date;
      if (!date) continue;
      const st = returnStateOf(b);
      if (b.trip_mode === "outbound") {
        if ((b.return_seat_numbers?.length ?? 0) > 0) issues.push({ code: b.booking_code, name: b.customer_name, date, problem: "ذهاب فقط ولديه مقاعد عودة", action: "إزالة إسناد العودة يدويًا" });
        continue;
      }
      const inferred = planningTripId(date, b.return_trip_id, data.rts, links);
      const grp = g(inferred, date);
      grp.pax += b.passenger_count;
      if (st !== "confirmed") {
        grp.pending += b.passenger_count;
        if (st === "pending") {
          const linked = links.filter((l) => l.trip_date === date && (!inferred || l.return_trip_id === inferred));
          const free = linked.map((l) => {
            const bu = busById.get(l.bus_id);
            const lab = data.labels[l.bus_id]?.length ?? bu?.capacity ?? 0;
            const cap = bu ? Math.min(bu.capacity, lab || bu.capacity) : 0;
            return { name: bu ? bu.name || `حافلة ${bu.bus_number}` : "?", free: Math.max(0, cap - (usedPerBus.get(`${l.bus_id}|${date}`) ?? 0)) };
          });
          const reason = linked.length === 0
            ? "لا توجد حافلة مربوطة بتاريخ العودة"
            : free.some((f) => f.free >= b.passenger_count)
              ? "لم يُختر مقعد عودة / لم ينجح الإسناد"
              : free.reduce((x, f) => x + f.free, 0) >= b.passenger_count
                ? "لا توجد حافلة واحدة تتسع للحجز كاملًا — يحتاج توزيعًا يدويًا"
                : "المقاعد المتاحة غير كافية لجميع الأفراد";
          pending.push({ code: b.booking_code, name: b.customer_name, date, pax: b.passenger_count, reason, buses: free });
        }
        continue;
      }
      const probs: string[] = [];
      const bus = busById.get(b.return_bus_id!);
      const labels = data.labels[b.return_bus_id!] ?? [];
      const seats = b.return_seat_numbers ?? [];
      if (!bus) probs.push("حافلة العودة غير موجودة");
      if (!b.return_trip_id || !linkSet.has(linkKey(b.return_trip_id, date, b.return_bus_id!))) probs.push("الحافلة غير مربوطة بالرحلة في هذا التاريخ");
      const bad = seats.filter((s) => !labels.includes(s));
      if (bad.length) probs.push(`مقاعد غير موجودة في المخطط: ${bad.join("، ")}`);
      const dup = seats.filter((s) => (seatOwners.get(`${b.return_bus_id}|${date}|${s}`)?.length ?? 0) > 1);
      if (dup.length) probs.push(`مقاعد مكررة مع حجز آخر: ${dup.join("، ")}`);
      if (seats.length !== b.passenger_count) probs.push(`عدد المقاعد ${seats.length} لا يساوي الركاب ${b.passenger_count}`);
      const used = usedPerBus.get(`${b.return_bus_id}|${date}`) ?? 0;
      if (bus && used > Math.min(bus.capacity, labels.length || bus.capacity)) probs.push(`الحافلة تجاوزت سعتها (${used}/${bus.capacity})`);
      if (probs.length) {
        grp.invalid += b.passenger_count;
        issues.push({ code: b.booking_code, name: b.customer_name, date, problem: probs.join(" • "), action: "أعد التسكين من قسم العودة أو اربط الحافلة بالتاريخ" });
      } else grp.confirmed += b.passenger_count;
    }

    const rows = [...groups.values()].sort((a, z) => a.date.localeCompare(z.date)).map((x) => {
      const capReal = [...x.busIds].reduce((s, id) => {
        const bu = busById.get(id); if (!bu) return s;
        const l = data.labels[id]?.length ?? bu.capacity;
        return s + Math.min(bu.capacity, l || bu.capacity);
      }, 0);
      const plan = plannedBuses(x.pax, form.extra ? T : Number.MAX_SAFE_INTEGER, CAP);
      return { ...x, name: x.tripId ? rtName.get(x.tripId) ?? "رحلة عودة" : "غير محددة (أكثر من رحلة أو بلا رحلة)", capReal, plan, shortage: Math.max(0, x.pax - capReal) };
    });

    const busWarn = data.buses.filter((bu) => data.labels[bu.id] && data.labels[bu.id].length > 0 && data.labels[bu.id].length !== bu.capacity)
      .map((bu) => ({ bu, layout: data.labels[bu.id].length }));
    pending.sort((a, z) => a.date.localeCompare(z.date));
    return { rows, issues, busWarn, pending };
  }, [data, T, CAP, form.extra, now]);

  return (
    <div className="space-y-6" dir="rtl">
      <section className="surface-card p-4 space-y-4">
        <h3 className="font-extrabold">إعدادات مقاعد العودة</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-sm font-bold">إضافة حافلة عودة جديدة عند تجاوز الباقي للحد T</span>
            <Switch checked={form.extra} onCheckedChange={(v) => setForm({ ...form, extra: v })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
            <span className="text-sm font-bold">اختيار مقعد العودة للعملاء أثناء الحجز</span>
            <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          </label>
          <div>
            <Label className="text-xs">الحد الإضافي T (ركاب)</Label>
            <Input type="number" min={0} value={form.T} onChange={(e) => setForm({ ...form, T: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div>
            <Label className="text-xs">السعة التخطيطية للحافلة</Label>
            <Input type="number" min={1} value={form.cap} onChange={(e) => setForm({ ...form, cap: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          المعادلة التخطيطية: إذا زاد الباقي بعد القسمة على {CAP} عن {T} راكبًا تُقترح حافلة إضافية، وإلا يبقى الباقي غير مسند. هذا تقدير فقط — المقاعد الفعلية تُحدد من الحافلات الحقيقية المربوطة بالرحلة والتاريخ.
        </p>
        <Button className="rounded-full" onClick={saveSettings}>حفظ الإعدادات</Button>
      </section>

      <section className="surface-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold">احتياج حافلات العودة لكل رحلة وتاريخ</h3>
          <Button variant="outline" size="sm" className="rounded-full" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "جارٍ التحديث…" : "تحديث"}</Button>
        </div>
        {isError ? (
          <div role="alert" className="rounded-xl border border-destructive/50 p-3 text-sm text-destructive space-y-2">
            <div className="font-bold">تعذر تحميل بيانات الاحتياج</div>
            <div className="text-xs">{(loadError as Error | null)?.message ?? "خطأ غير معروف"}</div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => refetch()}>إعادة المحاولة</Button>
          </div>
        ) : isLoading || !report ? <p className="text-sm text-muted-foreground">جارٍ التحميل…</p> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>التاريخ</TableHead><TableHead>رحلة العودة</TableHead><TableHead>الركاب</TableHead>
                  <TableHead>حافلات مربوطة</TableHead><TableHead>السعة الفعلية</TableHead><TableHead>مقاعد مؤكدة</TableHead>
                  <TableHead>غير مسندين</TableHead><TableHead>غير صالحة</TableHead><TableHead>التخطيط ({CAP})</TableHead><TableHead>المؤشر</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rows.map((r) => {
                  const need = r.plan.buses > r.busIds.size || r.shortage > 0;
                  return (
                    <TableRow key={r.key}>
                      <TableCell className="whitespace-nowrap">{formatTripDate(r.date)}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="font-bold">{r.pax}</TableCell>
                      <TableCell>{r.busIds.size}</TableCell>
                      <TableCell>{r.capReal}</TableCell>
                      <TableCell>{r.confirmed}</TableCell>
                      <TableCell>{r.pending}</TableCell>
                      <TableCell>{r.invalid > 0 ? <Badge variant="destructive">{r.invalid}</Badge> : 0}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.plan.buses} حافلة{r.plan.overflow ? ` + ${r.plan.overflow} غير مسند` : ""}</TableCell>
                      <TableCell>
                        {need ? <Badge className="bg-warning text-warning-foreground">جهّز {Math.max(r.plan.buses - r.busIds.size, 0) || "حافلات"} إضافية{r.shortage ? ` (نقص ${r.shortage} مقعد)` : ""}</Badge>
                          : <Badge variant="secondary">كافٍ</Badge>}
                        {need && form.extra && r.tripId && (
                          <Button size="sm" variant="outline" className="rounded-full mt-1 block" onClick={() => addReturnBus(r.tripId!, r.date, r.busIds)}>إضافة حافلة عودة</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {report.rows.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">لا توجد عودات قادمة</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">لإتاحة حافلة للعملاء: اختر حافلة حقيقية من الأسطول واربطها برحلة العودة والتاريخ من قسم العودة. زر «إضافة حافلة عودة» يربط أول حافلة عودة متاحة من الأسطول بالتاريخ، ولا ينقل إسنادات تلقائيًا.</p>
      </section>

      <section className="surface-card p-4 space-y-3">
        <h3 className="font-extrabold">حجوزات بانتظار توزيع مقاعد العودة يدويًا {report ? `(${report.pending.length})` : ""}</h3>
        <p className="text-xs text-muted-foreground">لا يُوزَّع أي حجز تلقائيًا على أكثر من حافلة، ولا يُعتبر مؤكدًا حتى تعتمد الإدارة الإسناد.</p>
        {isError && <p className="text-sm text-destructive">غير متاح بسبب خطأ التحميل أعلاه.</p>}
        {!isError && !report && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {report && report.pending.length === 0 && <p className="text-sm text-muted-foreground">لا توجد حجوزات بانتظار التوزيع.</p>}
        {report && report.pending.length > 0 && (
          <div className="overflow-x-auto max-h-[480px]">
            <Table>
              <TableHeader><TableRow><TableHead>الحجز</TableHead><TableHead>العميل</TableHead><TableHead>تاريخ العودة</TableHead><TableHead>الركاب</TableHead><TableHead>الحافلات المرتبطة (المتاح)</TableHead><TableHead>السبب</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.pending.map((p) => (
                  <TableRow key={p.code}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell><TableCell>{p.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatTripDate(p.date)}</TableCell><TableCell>{p.pax}</TableCell>
                    <TableCell className="text-xs">{p.buses.length ? p.buses.map((b) => `${b.name}: ${b.free}`).join("، ") : "—"}</TableCell>
                    <TableCell className="text-xs">{p.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="surface-card p-4 space-y-3">
        <h3 className="font-extrabold">تقرير الإسنادات غير الصالحة {report ? `(${report.issues.length})` : ""}</h3>
        {isError && <p className="text-sm text-destructive">التقرير غير متاح بسبب خطأ التحميل أعلاه.</p>}
        {!isError && !report && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
        {report && report.issues.length === 0 && <p className="text-sm text-muted-foreground">لا توجد مشكلات.</p>}
        {report && report.issues.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>الحجز</TableHead><TableHead>العميل</TableHead><TableHead>التاريخ</TableHead><TableHead>المشكلة</TableHead><TableHead>الإجراء</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.issues.map((i) => (
                  <TableRow key={i.code + i.problem}>
                    <TableCell className="font-mono text-xs">{i.code}</TableCell><TableCell>{i.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatTripDate(i.date)}</TableCell><TableCell className="text-destructive text-xs">{i.problem}</TableCell>
                    <TableCell className="text-xs">{i.action}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {report && report.busWarn.length > 0 && (
          <div className="rounded-xl border border-warning/50 p-3 text-xs space-y-1">
            <div className="font-bold">حافلات تختلف سعتها المسجلة عن مخططها (راجع السعة الفعلية):</div>
            {report.busWarn.map(({ bu, layout }) => (
              <div key={bu.id}>{bu.name || `حافلة ${bu.bus_number}`}: السعة {bu.capacity} — مقاعد المخطط {layout}</div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
