// Display-only helpers for the booking "return" value.
// When a booking has hotel extension nights, we show the extension label
// instead of the stored return date. The stored value is never modified.

export function extensionLabel(nights: number): string {
  if (nights === 1) return "تمديد ليلة واحدة";
  if (nights === 2) return "تمديد ليلتين";
  return `تمديد ${nights} ليال`;
}

export function returnDisplay(
  originalReturn: string | null | undefined,
  extensionNights: number | null | undefined,
  fallback = "-"
): string {
  const n = Number(extensionNights ?? 0);
  if (n > 0) return extensionLabel(n);
  return originalReturn || fallback;
}
