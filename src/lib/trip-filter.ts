export interface TripFilterOption { id: string; name: string }

/** Return trips have their own IDs and booking relationship. */
export function matchesTripFilter(booking: { trip_id?: string | null; return_trip_id?: string | null }, value: string) {
  if (!value) return true;
  return value.startsWith("return:")
    ? booking.return_trip_id === value.slice("return:".length)
    : booking.trip_id === value;
}