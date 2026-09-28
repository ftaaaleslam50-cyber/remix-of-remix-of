// منطق نقل مقاعد الذهاب إلى العودة — دوال نقية (بدون واجهة) لسهولة الاختبار.
export interface PlanBooking {
  id: string;
  name: string;
  created_at: string;
  bus_id: string | null;        // حافلة الذهاب
  seats: string[];              // مقاعد الذهاب
  return_bus_id: string | null; // موزّع مسبقًا؟
  return_seats: string[];
}
export interface PlanBus { id: string; capacity: number }
export type PlanStatus = "same" | "moved" | "review";
export interface PlanItem {
  bookingId: string;
  name: string;
  from: string[];
  to: string[];
  status: PlanStatus;
  targetBusId: string | null;
  reason?: string;
}

const validSeat = (s: string, cap: number) => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= cap;
};

/** mapping: حافلة الذهاب → حافلة العودة. الأقدم حجزًا (created_at) يحتفظ بمقعده عند التعارض. */
export function planCopy(bookings: PlanBooking[], buses: PlanBus[], mapping: Record<string, string>): PlanItem[] {
  const cap = new Map(buses.map((b) => [b.id, b.capacity]));
  const taken = new Map<string, Set<string>>(buses.map((b) => [b.id, new Set<string>()]));
  // المقاعد الموزّعة يدويًا من قبل لها الأولوية دائمًا
  for (const b of bookings) {
    if (b.return_bus_id && b.return_seats.length > 0) b.return_seats.forEach((s) => taken.get(b.return_bus_id!)?.add(s));
  }
  const todo = bookings
    .filter((b) => !b.return_bus_id || b.return_seats.length === 0)
    .sort((a, z) => a.created_at.localeCompare(z.created_at));

  const out: PlanItem[] = [];
  for (const b of todo) {
    const review = (reason: string): PlanItem => ({ bookingId: b.id, name: b.name, from: b.seats, to: [], status: "review", targetBusId: null, reason });
    const target = b.bus_id ? mapping[b.bus_id] : undefined;
    if (!target || !cap.has(target)) { out.push(review("لم تُحدَّد حافلة عودة مقابلة")); continue; }
    if (b.seats.length === 0) { out.push(review("لا توجد مقاعد ذهاب")); continue; }
    const capacity = cap.get(target)!;
    const used = taken.get(target)!;

    // 1) نفس المقاعد إن كانت صالحة وفاضية
    if (b.seats.every((s) => validSeat(s, capacity) && !used.has(s))) {
      b.seats.forEach((s) => used.add(s));
      out.push({ bookingId: b.id, name: b.name, from: b.seats, to: b.seats, status: "same", targetBusId: target });
      continue;
    }

    // 2) نقل المجموعة كاملة لأقرب مقاعد فاضية (يفضَّل تجاور المقاعد)
    const need = b.seats.length;
    const free: number[] = [];
    for (let i = 1; i <= capacity; i++) if (!used.has(String(i))) free.push(i);
    if (free.length < need) { out.push(review("لا توجد مقاعد كافية في حافلة العودة")); continue; }
    const nums = b.seats.map(Number).filter((n) => Number.isFinite(n));
    const center = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : capacity / 2;
    const freeSet = new Set(free);
    let best: number[] | null = null, bestScore = Infinity;
    for (let start = 1; start + need - 1 <= capacity; start++) {
      let ok = true;
      for (let k = 0; k < need; k++) if (!freeSet.has(start + k)) { ok = false; break; }
      if (!ok) continue;
      const score = Math.abs(start + (need - 1) / 2 - center);
      if (score < bestScore) { bestScore = score; best = Array.from({ length: need }, (_, k) => start + k); }
    }
    if (!best) best = [...free].sort((a, z) => Math.abs(a - center) - Math.abs(z - center)).slice(0, need).sort((a, z) => a - z);
    const to = best.map(String);
    to.forEach((s) => used.add(s));
    out.push({ bookingId: b.id, name: b.name, from: b.seats, to, status: "moved", targetBusId: target, reason: "تعارض أو مقعد غير موجود في حافلة العودة" });
  }
  return out;
}
