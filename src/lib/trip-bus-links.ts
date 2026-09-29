// حافلات الرحلة المختارة في الفلاتر: المضافة للرحلة (مرتبطة) +
// حافلات نفس يوم الرحلة غير المضافة لها (غير مرتبطة).
import { supabase } from "@/integrations/supabase/client";

const weekdayOf = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).getDay() : null);

/** tripId يقبل البادئة `return:` لرحلات العودة. */
export async function fetchTripBusesWithLinks<T extends { id: string; assigned_date?: string | null; direction?: string | null }>(
  tripId: string,
  cols: string,
  opts: { activeOnly?: boolean } = {},
): Promise<(T & { linked: boolean })[]> {
  const returnId = tripId.startsWith("return:") ? tripId.slice(7) : null;
  let date: string | null = null;
  let weekday: number | null = null;
  let linkIds: string[] = [];
  if (returnId) {
    const [{ data: rt }, { data: links }] = await Promise.all([
      supabase.from("return_trips").select("return_date,weekday").eq("id", returnId).maybeSingle(),
      supabase.from("return_trip_buses").select("bus_id").eq("return_trip_id", returnId),
    ]);
    date = (rt as { return_date: string | null } | null)?.return_date ?? null;
    weekday = weekdayOf(date) ?? ((rt as { weekday: number | null } | null)?.weekday ?? null);
    linkIds = (links ?? []).map((x: { bus_id: string }) => x.bus_id);
  } else {
    const [{ data: t }, { data: links }] = await Promise.all([
      supabase.from("trips").select("departure_date").eq("id", tripId).maybeSingle(),
      supabase.from("trip_buses").select("bus_id").eq("trip_id", tripId),
    ]);
    date = (t as { departure_date: string | null } | null)?.departure_date ?? null;
    weekday = weekdayOf(date);
    linkIds = (links ?? []).map((x: { bus_id: string }) => x.bus_id);
  }
  let q = supabase.from("buses").select(cols).order("assigned_date", { ascending: true, nullsFirst: false }).order("bus_number");
  if (opts.activeOnly) q = q.eq("active", true);
  const all = (((await q).data ?? []) as unknown as (T & { trip_id?: string | null })[]);
  const linked = new Set(linkIds);
  return all
    .map((b) => ({ ...b, linked: linked.has(b.id) || (!returnId && b.trip_id === tripId) }))
    .filter((b) => {
      if (b.linked) return true;
      if (!b.assigned_date) return false;
      if ((b.direction === "return") !== Boolean(returnId)) return false;
      return date ? b.assigned_date === date : weekday !== null && weekdayOf(b.assigned_date) === weekday;
    });
}
