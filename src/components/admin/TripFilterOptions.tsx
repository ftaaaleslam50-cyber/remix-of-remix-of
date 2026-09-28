import type { TripFilterOption } from "@/lib/trip-filter";

export function TripFilterOptions({ outbound, returning }: { outbound: TripFilterOption[]; returning: TripFilterOption[] }) {
  return (
    <>
      {outbound.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      {returning.map((t) => <option key={t.id} value={`return:${t.id}`}>{t.name}</option>)}
    </>
  );
}