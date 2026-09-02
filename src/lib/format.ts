export const sar = (n: number) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(n) + " ريال";

export const num = (n: number) =>
  new Intl.NumberFormat("ar-SA").format(n);

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date(iso));

const DATE_TIME = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Riyadh",
});

/** Date + time in Riyadh time, e.g. "2 سبتمبر 2026، 7:19 ص" */
export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return DATE_TIME.format(d);
};
