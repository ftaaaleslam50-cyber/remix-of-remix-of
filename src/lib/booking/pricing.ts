// Pricing engine: reads hotel pricing based on room type and passenger count.
import type { Package, PricingCell, RoomType } from "./types";

export const ROOM_LABEL: Record<RoomType, string> = {
  "1": "فردي",
  "2": "ثنائي",
  "3": "ثلاثي",
  "4": "رباعي",
  "5": "خماسي",
};

/**
 * حساب سعر الفندق حسب:
 *
 * 1. العائلات / الغرف الخاصة:
 *    - 1 فرد  => عمود 1
 *    - 2 أفراد => عمود 2
 *    - 3 أفراد => عمود 3
 *    - 4 أفراد => عمود 4
 *    - 5 أفراد أو أكثر => عمود 5
 *
 * 2. الأفراد / العزاب:
 *    - يتم التعامل مع الحجز كجزء من الفرد الواحد
 *    - لذلك يتم استخدام سعر العمود 5
 *
 * ملاحظة:
 * السعر هنا يعتمد على الفندق + عدد الأفراد + نوع الغرفة.
 * لا يعتمد على الرحلة.
 */
export function getPackagePrice(
  pkg: Package | null,
  room: RoomType,
  passengerCount: number,
  pricing: PricingCell[],
): number {
  if (!pkg) return 0;

  const pkgCells = pricing.filter((p) => p.package_id === pkg.id && p.active);

  if (!pkgCells.length) {
    return Number(pkg.base_price) || 0;
  }

  /**
   * تحديد عمود التسعير:
   *
   * الغرفة 5 = أفراد / عزاب
   * أو في حالة الغرف الخاصة:
   * نستخدم عدد الأفراد مباشرة مع الحد الأقصى 5.
   */
  let pricingPassengerCount: number;

  if (room === "5") {
    // أفراد / عزاب:
    // يتم حساب الشخص أو الأشخاص كجزء من الفرد الواحد
    // وبالتالي استخدام عمود 5.
    pricingPassengerCount = 5;
  } else {
    // عائلات / غرفة خاصة:
    // عدد الأفراد يحدد عمود الفندق.
    pricingPassengerCount = Math.min(Math.max(Number(passengerCount) || 1, 1), 5);
  }

  /**
   * البحث عن السعر المطابق لعمود الفندق المطلوب.
   */
  const exact = pkgCells.find((p) => p.passenger_count === pricingPassengerCount);

  if (exact) {
    return Number(exact.price) || 0;
  }

  /**
   * في حال عدم وجود العمود المطلوب:
   * نستخدم أقرب سعر متاح، مع الحفاظ على عدم كسر النظام.
   */
  const nearest = pkgCells.reduce((best, cur) =>
    Math.abs(cur.passenger_count - pricingPassengerCount) < Math.abs(best.passenger_count - pricingPassengerCount)
      ? cur
      : best,
  );

  return Number(nearest.price) || 0;
}
