// Shared rooming/pricing reference data for the official trip sheet.
// (The legacy settlement workbook generator was removed — the official
// "نموذج الحافلة" in official-bus-sheet.ts is the only print template.)

export const ROOM_ROWS = [
  "فردي",
  "ثنائي",
  "ثلاثي",
  "رباعي",
  "خماسي",
  "خماسي مشترك",
  "مشترك رباعي",
  "مشترك مشرف",
] as const;

/** Room capacity used to convert people → rooms and cost → cost per person. */
export const ROOM_CAPACITY: Record<string, number> = {
  فردي: 1,
  ثنائي: 2,
  ثلاثي: 3,
  رباعي: 4,
  خماسي: 5,
  "خماسي مشترك": 5,
  "مشترك رباعي": 4,
  "مشترك مشرف": 4,
};

export interface HotelPricing {
  hotel: string;
  sale: Record<string, number>;
  cost: Record<string, number>;
  extensionSale: number;
  extensionCost: number;
}

export interface RepCommission {
  name: string;
  rate: number;
}
