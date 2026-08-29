// Real-date helpers for the weekly trip system.
// Trips stay weekly templates; each template carries the real date of its
// current occurrence (departure_date/return_date) plus a real departure_time.

const AR_DATE = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const AR_DATE_COMPACT = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  weekday: "short",
  day: "numeric",
  month: "short",
});

const AR_DATE_SHORT = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  day: "numeric",
  month: "short",
});

/** "2026-08-29" -> "السبت 29 أغسطس 2026" */
export function formatTripDate(date?: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  return AR_DATE.format(d);
}

/** Compact: "29 أغسطس" (day + month only, no weekday, no year). */
export function formatTripDateShort(date?: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  return AR_DATE_SHORT.format(d);
}

/** Compact: "السبت 29 أغسطس" (short weekday + day + month, no year). */
export function formatTripDateCompact(date?: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  return AR_DATE_COMPACT.format(d);
}

/** Stored return-option: ISO dates become Arabic labels, legacy text passes through. */
export function formatReturnOption(s?: string | null): string {
  if (!s) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatTripDate(s) : s;
}

/** "22:00:00" -> "10:00 مساءً" */
export function formatTripTime(time?: string | null): string {
  if (!time) return "";
  const [hRaw, mRaw] = String(time).split(":");
  const h = Number(hRaw);
  const m = mRaw ?? "00";
  if (Number.isNaN(h)) return String(time);
  const period = h >= 12 ? "مساءً" : "صباحاً";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.padStart(2, "0")} ${period}`;
}

/** Departure deadline (Riyadh, UTC+3) as an absolute instant. */
export function tripDeadline(date?: string | null, time?: string | null): Date | null {
  if (!date) return null;
  const t = (time ?? "23:59:00").slice(0, 5);
  const d = new Date(`${date}T${t}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True once the trip's departure moment has passed. */
export function isTripFinished(date?: string | null, time?: string | null, now: Date = new Date()): boolean {
  const dl = tripDeadline(date, time);
  return dl ? dl.getTime() <= now.getTime() : false;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Next weekly occurrence of a date. */
export function nextOccurrence(date: string, weeks = 1): string {
  return addDays(date, 7 * Math.max(1, weeks));
}

/** Real return date after hotel extension nights. */
export function actualReturnDate(returnDate?: string | null, extensionNights?: number | null): string | null {
  if (!returnDate) return null;
  const n = Math.max(0, Number(extensionNights ?? 0));
  return n > 0 ? addDays(returnDate, n) : returnDate;
}

/** Formatted real return date, e.g. "الاثنين 7 سبتمبر 2026". */
export function actualReturnDisplay(
  returnDate?: string | null,
  extensionNights?: number | null,
  fallback = "-",
): string {
  const d = actualReturnDate(returnDate, extensionNights);
  return d ? formatTripDate(d) : fallback;
}
