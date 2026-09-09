/** الأسبوع في الموقع يبدأ من السبت وينتهي الجمعة. */
export function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  // السبت = 6 → بداية الأسبوع
  x.setDate(x.getDate() - ((x.getDay() + 1) % 7));
  return x;
}

/** هل التاريخ ضمن الأسبوع الحالي (السبت → الجمعة)؟ */
export function isCurrentWeek(value?: string | Date | null) {
  if (!value) return false;
  const dt = typeof value === "string" ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  const start = startOfWeek(new Date());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return dt >= start && dt < end;
}

/** فرق الأسابيع بين التاريخ والأسبوع الحالي (0 = هذا الأسبوع، 1 = الأسبوع القادم) */
export function weekOffset(value?: string | Date | null): number | null {
  if (!value) return null;
  const dt = typeof value === "string" ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return Math.round((startOfWeek(dt).getTime() - startOfWeek(new Date()).getTime()) / (7 * 86400000));
}

/** هل التاريخ ضمن الأسبوع القادم (السبت → الجمعة)؟ */
export const isNextWeek = (value?: string | Date | null) => weekOffset(value) === 1;
