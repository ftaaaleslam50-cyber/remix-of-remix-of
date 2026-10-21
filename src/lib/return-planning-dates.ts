import { isTripFinished } from "./trip-dates";

export interface PlanningReturnTrip {
  id: string;
  return_date: string | null;
  return_time: string | null;
  weekday: number;
}
interface PlanningLink { return_trip_id: string; trip_date: string }

/** Planning follows the real extended date, not the original return template. */
export function planningTripId(date: string, storedId: string | null, trips: PlanningReturnTrip[], links: PlanningLink[]): string | null {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const onDate = new Set(links.filter((l) => l.trip_date === date).map((l) => l.return_trip_id));
  for (const trip of trips) if (trip.return_date === date) onDate.add(trip.id);
  const stored = trips.find((trip) => trip.id === storedId);
  if (stored && (onDate.has(stored.id) || stored.weekday === weekday)) return stored.id;
  if (onDate.size === 1) return [...onDate][0] ?? null;
  if (onDate.size > 1) return null;
  const matching = trips.filter((trip) => trip.weekday === weekday);
  return matching.length === 1 ? matching[0]?.id ?? null : null;
}

export function riyadhToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
}

/** Unknown departure time remains visible until the end of its Riyadh day. */
export function isUpcomingReturn(date: string | null, time: string | null, now: Date = new Date()): boolean {
  return Boolean(date) && !isTripFinished(date, time ?? "23:59:59", now);
}