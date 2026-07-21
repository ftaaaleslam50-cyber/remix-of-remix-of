// Pricing engine: reads from pricing_matrix (package × room).
import type { Package, PricingCell, RoomType } from "./types";

export const ROOM_LABEL: Record<RoomType, string> = {
  "1": "فردي",
  "2": "ثنائي",
  "3": "ثلاثي",
  "4": "رباعي",
  "5": "خماسي",
};

// Price per person = the value stored for the selected room_type column.
// passenger_count is NOT used to select the price — the room (column) is the selector.
export function getPackagePrice(
  pkg: Package | null,
  room: RoomType,
  _passengerCount: number,
  pricing: PricingCell[],
): number {
  if (!pkg) return 0;
  const pkgCells = pricing.filter((p) => p.package_id === pkg.id && p.active);
  if (!pkgCells.length) return Number(pkg.base_price) || 0;
  const exact = pkgCells.find((p) => p.room_type === room);
  if (exact) return Number(exact.price);
  const nearest = pkgCells.reduce((best, cur) =>
    Math.abs(Number(cur.room_type) - Number(room)) < Math.abs(Number(best.room_type) - Number(room)) ? cur : best,
  );
  return Number(nearest.price);
}
