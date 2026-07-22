// Pricing engine: reads from pricing_matrix (package × room).
import type { Package, PricingCell, RoomType } from "./types";

export const ROOM_LABEL: Record<RoomType, string> = {
  "1": "فردي",
  "2": "ثنائي",
  "3": "ثلاثي",
  "4": "رباعي",
  "5": "خماسي",
};

// Price per person = the exact value stored for the selected room_type column.
//
// Pricing logic:
// - Individual / Singles:
//   The booking flow must pass room_type = "5".
//   Therefore, the hotel price is always taken from column 5 (خماسي).
//
// - Families:
//   The booking flow must pass the room_type that matches the number
//   of passengers:
//   1 passenger → column 1
//   2 passengers → column 2
//   3 passengers → column 3
//   4 passengers → column 4
//   5 passengers → column 5
//
// Important:
// - passenger_count is not used to select the price here.
// - room_type is the pricing column selector.
// - No fallback to base_price.
// - No nearest-price fallback.
// - If an exact active price is not found, return 0.
export function getPackagePrice(
  pkg: Package | null,
  room: RoomType,
  _passengerCount: number,
  pricing: PricingCell[],
): number {
  if (!pkg) return 0;

  const exact = pricing.find((p) => p.package_id === pkg.id && p.active && String(p.room_type) === String(room));

  return exact ? Number(exact.price) || 0 : 0;
}
