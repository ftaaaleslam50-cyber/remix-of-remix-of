// Pricing engine: reads from pricing_matrix (package × room × passengers).
import type { Package, PricingCell, RoomType } from "./types";

export const ROOM_LABEL: Record<RoomType, string> = {
  "1": "فردي",
  "2": "ثنائي",
  "3": "ثلاثي",
  "4": "رباعي",
  "5": "خماسي",
};

// Room type is intentionally IGNORED for pricing.
// Pricing = package × passenger_count only (season/trip discounts handled elsewhere).
export function getPackagePrice(
  pkg: Package | null,
  _room: RoomType,
  passengerCount: number,
  pricing: PricingCell[],
): number {
  if (!pkg) return 0;
  const pkgCells = pricing.filter((p) => p.package_id === pkg.id && p.active);
  if (!pkgCells.length) return Number(pkg.base_price) || 0;
  const exact = pkgCells.find((p) => p.passenger_count === passengerCount);
  if (exact) return Number(exact.price);
  const nearest = pkgCells.reduce((best, cur) =>
    Math.abs(cur.passenger_count - passengerCount) < Math.abs(best.passenger_count - passengerCount) ? cur : best,
  );
  return Number(nearest.price);
}
