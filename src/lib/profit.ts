// حساب أرباح الحجز — دالة مشتركة بين شاشة "الحسابات والتصفية" (حساب لحظي)
// وبين حفظ الحجوزات (تخزين gross_profit / rep_share / company_share).
import { supabase } from "@/integrations/supabase/client";
import { ROOM_CAPACITY } from "@/lib/export/rooming";

const n = (v: unknown) => Number(v) || 0;

export interface ProfitInput {
  /** إجمالي الباقة كما هو مدفوع في الحجز. */
  packageTotal: number;
  /** عدد ليالي التمديد. */
  nights: number;
  /** سعر بيع ليلة التمديد. */
  extSale: number;
  /** تكلفة ليلة التمديد. */
  extNightCost: number;
  /** تكلفة السرير للفرد في الفندق. */
  bedCost: number;
  /** نصيب الفرد من مصاريف الحافلة. */
  seatCost: number;
  /** نصيب الفرد من الأسرّة الفارغة. */
  emptyBedShare: number;
  /** عدد الأفراد. */
  count: number;
  /** نسبة عمولة المندوب (0 → 1). */
  rate: number;
}

export interface ProfitResult {
  extensionTotal: number;
  grandTotal: number;
  costPerPerson: number;
  groupCost: number;
  extensionCost: number;
  extensionProfit: number;
  grossProfit: number;
  rate: number;
  repShare: number;
  companyShare: number;
}

/** نفس منطق الحساب المستخدم في شاشة الحسابات والتصفية. */
export function computeBookingProfit(i: ProfitInput): ProfitResult {
  const extensionTotal = i.extSale * i.nights;
  const grandTotal = i.packageTotal + extensionTotal;
  const costPerPerson = i.bedCost + i.seatCost + i.emptyBedShare;
  const groupCost = costPerPerson * i.count;
  const extensionCost = i.nights * i.extNightCost;
  const extensionProfit = extensionTotal - extensionCost;
  const grossProfit = grandTotal + extensionProfit - (groupCost + extensionCost);
  const repShare = grossProfit * i.rate;
  return {
    extensionTotal,
    grandTotal,
    costPerPerson,
    groupCost,
    extensionCost,
    extensionProfit,
    grossProfit,
    rate: i.rate,
    repShare,
    companyShare: grossProfit - repShare,
  };
}

type RefRow = {
  hotel_night_prices?: Record<string, number> | null;
  extension?: Record<string, { sale?: number; cost?: number }> | null;
  commissions?: Record<string, number> | null;
  bus_expenses?: Record<string, number> | null;
};

const ROOM_LABELS: Record<string, string> = {
  "1": "فردي",
  "2": "ثنائي",
  "3": "ثلاثي",
  "4": "رباعي",
  "5": "خماسي",
};

/**
 * يحسب ويحفظ أرباح حجز واحد داخل جدول الحجوزات.
 * يُستدعى بعد أي حفظ/تعديل سعر. لا يرمي أخطاء — الفشل صامت حتى لا يعطّل الحفظ.
 */
export async function storeBookingProfit(bookingCode: string): Promise<void> {
  try {
    const { data: bRaw } = await supabase
      .from("bookings")
      .select(
        "id,total_price,passenger_count,room_type,booking_type,extension_nights,booking_source,rep_profile_id,bus_id,package_id,packages(name)",
      )
      .eq("booking_code", bookingCode)
      .maybeSingle();
    const b = bRaw as unknown as
      | {
          id: string;
          total_price: number | null;
          passenger_count: number | null;
          room_type: string | null;
          booking_type: string | null;
          extension_nights: number | null;
          booking_source: string | null;
          rep_profile_id: string | null;
          bus_id: string | null;
          package_id: string | null;
          packages: { name: string } | null;
        }
      | null;
    if (!b) return;

    const [{ data: refRaw }, { data: hotelRaw }] = await Promise.all([
      supabase.from("settlement_reference").select("*").eq("id", 1).maybeSingle(),
      b.package_id
        ? supabase.from("packages").select("extension_price").eq("id", b.package_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const ref = (refRaw ?? {}) as RefRow;
    const hotel = b.packages?.name ?? "";
    const nightPrice = n(ref.hotel_night_prices?.[hotel]);
    const extSale = n(ref.extension?.[hotel]?.sale ?? (hotelRaw as { extension_price?: number } | null)?.extension_price ?? 0);
    const extNightCost = n(ref.extension?.[hotel]?.cost);

    const roomLabel = !hotel
      ? "خماسي"
      : b.booking_type === "individual"
        ? "خماسي مشترك"
        : (ROOM_LABELS[String(b.room_type ?? "5")] ?? "خماسي");
    const bedCost = hotel ? nightPrice / (ROOM_CAPACITY[roomLabel] ?? 5) : 0;

    // نصيب الفرد من مصاريف الحافلة = إجمالي المصاريف ÷ ركاب نفس الحافلة.
    const be = ref.bus_expenses ?? {};
    const busTotal = n(be["busCost"]) + n(be["driverTip"]) + n(be["taxi"]) + n(be["supervisor"]) + n(be["extra"]);
    let seatCost = 0;
    if (busTotal > 0 && b.bus_id) {
      const { data: mates } = await supabase
        .from("bookings")
        .select("passenger_count")
        .eq("bus_id", b.bus_id)
        .neq("status", "cancelled")
        .is("deleted_at", null);
      const total = (mates ?? []).reduce((s, r) => s + n((r as { passenger_count: number }).passenger_count), 0);
      seatCost = total > 0 ? busTotal / total : 0;
    }

    // نسبة العمولة: الجديدة من ملف المندوب، وإلا الطريقة القديمة بالاسم.
    let rate = 0;
    if (b.rep_profile_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("commission_rate")
        .eq("id", b.rep_profile_id)
        .maybeSingle();
      rate = n((prof as { commission_rate?: number | null } | null)?.commission_rate);
    }
    if (!rate) rate = n(ref.commissions?.[b.booking_source || "الموقع"]);

    const r = computeBookingProfit({
      packageTotal: n(b.total_price),
      nights: n(b.extension_nights),
      extSale,
      extNightCost,
      bedCost,
      seatCost,
      emptyBedShare: 0,
      count: n(b.passenger_count),
      rate,
    });

    await supabase
      .from("bookings")
      .update({
        gross_profit: Math.round(r.grossProfit),
        rep_share: Math.round(r.repShare),
        company_share: Math.round(r.companyShare),
      } as never)
      .eq("id", b.id);
  } catch {
    /* الحفظ الأساسي أهم — تجاهل أي خطأ هنا */
  }
}
