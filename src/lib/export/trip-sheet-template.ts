// Shared helpers for the official trip sheet ("نموذج الحافلة").
// All legacy print templates were removed — see official-bus-sheet.ts.

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function dayNameFromDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return AR_DAYS[d.getDay()];
}
