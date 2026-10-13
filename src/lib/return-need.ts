// حساب احتياج حافلات العودة — دوال نقية.

/** المعادلة التخطيطية عند سعة موحدة (افتراضيًا 48) والحد الإضافي T. */
export function plannedBuses(passengers: number, threshold: number, capacity = 48) {
  const P = Math.max(0, Math.floor(passengers));
  if (P <= 0 || capacity <= 0) return { buses: 0, overflow: 0 };
  const q = Math.floor(P / capacity);
  const r = P % capacity;
  const buses = Math.max(1, q + (r > threshold ? 1 : 0));
  return { buses, overflow: Math.max(0, P - buses * capacity) };
}

export type ReturnState = "na" | "pending" | "confirmed";

export function returnStateOf(b: {
  trip_mode?: string | null;
  actual_return_date?: string | null;
  return_bus_id?: string | null;
  return_seat_numbers?: string[] | null;
  passenger_count?: number | null;
}): ReturnState {
  if (b.trip_mode === "outbound" || !b.actual_return_date) return "na";
  const n = b.return_seat_numbers?.length ?? 0;
  if (b.return_bus_id && n > 0) return "confirmed";
  return "pending";
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ReturnBusOcc {
  bus_id: string;
  return_trip_id: string;
  return_trip_name: string;
  bus_name: string | null;
  bus_number: number;
  capacity: number;
  layout_id: string | null;
  seat_labels: string[];
  taken: string[];
}

export const freeSeatsOf = (b: ReturnBusOcc) => (roomOf(b) > 0 ? b.seat_labels.filter((s) => !b.taken.includes(s)) : []);

export const roomOf = (b: ReturnBusOcc) =>
  Math.max(0, Math.min(b.capacity, b.seat_labels.length) - b.taken.filter((s) => b.seat_labels.includes(s)).length);

/** أفضل حافلة عودة: أكثر تطابق مع مقاعد الذهاب ولديها سعة كافية. */
export function suggestReturn(buses: ReturnBusOcc[], outboundSeats: string[], count: number) {
  let best: { bus: ReturnBusOcc; same: string[] } | null = null;
  for (const b of buses) {
    if (roomOf(b) < count) continue;
    const same = outboundSeats.filter((s) => b.seat_labels.includes(s) && !b.taken.includes(s)).slice(0, count);
    if (!best || same.length > best.same.length) best = { bus: b, same };
  }
  return best;
}

/**
 * وضع خطوة مقاعد العودة:
 * - none: لا توجد حافلات مربوطة أو لا توجد مقاعد متاحة إطلاقًا → قيد التسكين.
 * - single: توجد حافلة واحدة على الأقل تستوعب كل الركاب → يختار العميل.
 * - admin: المقاعد متاحة لكن موزعة على أكثر من حافلة. الحجز يحمل حافلة عودة واحدة فقط
 *   (return_bus_id) ولا يمكن ضمان توزيع متعدد ذريًا، فيُعرض للعميل أن الإدارة ستسكّنه دون إسناد جزئي.
 */
export type ReturnStepMode = "none" | "single" | "admin";
export function returnStepMode(buses: ReturnBusOcc[], count: number): ReturnStepMode {
  if (count <= 0) return "none";
  if (buses.some((b) => roomOf(b) >= count)) return "single";
  const total = buses.reduce((s, b) => s + roomOf(b), 0);
  return total > 0 ? "admin" : "none";
}
