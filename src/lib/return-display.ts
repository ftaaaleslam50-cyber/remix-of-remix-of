import { formatTripDate, formatTripDateCompact, actualReturnDate } from "./trip-dates";

// Display-only helpers for the booking "return" value.
// When a booking has hotel extension nights, we show the extension label
// instead of the stored return date. The stored value is never modified.

export function extensionLabel(nights: number): string {
  if (nights === 1) return "تمديد ليلة واحدة";
  if (nights === 2) return "تمديد ليلتين";
  return `تمديد ${nights} ليال`;
}

export const NO_RETURN_LABEL = "بدون عودة";

/** Departure label: prefers the real date, falls back to the weekly day text. */
export function departureDisplay(
  departureDate?: string | null,
  departureDay?: string | null,
  fallback = "-",
  tripMode?: string | null,
  compact = false,
): string {
  if (tripMode === "return") return "بدون ذهاب";
  if (departureDate) return compact ? formatTripDateCompact(departureDate) : formatTripDate(departureDate);
  return departureDay || fallback;
}


/**
 * Actual return: original return date + extension nights (real date when available).
 * The extension-nights count itself is shown in its own dedicated field, never
 * appended here.
 */
export function returnActualDisplay(
  returnDate?: string | null,
  returnDay?: string | null,
  extensionNights?: number | null,
  tripMode?: string | null,
  fallback = "-",
  _compact = false,
): string {
  if (tripMode === "outbound") return NO_RETURN_LABEL;
  const n = Math.max(0, Number(extensionNights ?? 0));
  const real = actualReturnDate(returnDate, n);
  if (real) return formatTripDate(real);
  return returnDay || fallback;
}

/** "رحلة الخميس — السبت 29 أغسطس 2026" (compact: "رحلة الخميس — السبت 29 أغسطس") */
export function tripWithDate(
  name?: string | null,
  departureDate?: string | null,
  departureDay?: string | null,
  compact = false,
): string {
  const base = name || "-";
  const d = departureDate
    ? compact ? formatTripDateCompact(departureDate) : formatTripDate(departureDate)
    : departureDay || "";
  return d ? `${base} — ${d}` : base;
}

export function returnDisplay(
  originalReturn: string | null | undefined,
  extensionNights: number | null | undefined,
  fallback = "-",
  tripMode?: string | null
): string {
  if (tripMode === "outbound") return NO_RETURN_LABEL;
  const n = Number(extensionNights ?? 0);
  if (n > 0) return extensionLabel(n);
  return originalReturn || fallback;
}
