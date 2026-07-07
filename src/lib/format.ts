export const sar = (n: number) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 }).format(n) + " ريال";

export const num = (n: number) =>
  new Intl.NumberFormat("ar-SA").format(n);

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date(iso));
