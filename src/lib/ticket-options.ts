// خيارات عرض التذكرة (الويب + PDF) — تُخزَّن في app_settings.ticket_template (jsonb).
export interface TicketOptions {
  show_qr: boolean;
  show_id_number: boolean;
  show_phones: boolean;
  show_hotel: boolean;
  show_room: boolean;
  show_bus_info: boolean;
  show_supervisor: boolean;
  show_booking_notes: boolean;
  show_id_image: boolean;
  show_prices: boolean;
  show_booking_date: boolean;
  show_seat_maps: boolean;
  show_notes_image: boolean;
  footer_text: string;
}

export const DEFAULT_TICKET_OPTIONS: TicketOptions = {
  show_qr: true,
  show_id_number: true,
  show_phones: true,
  show_hotel: true,
  show_room: true,
  show_bus_info: true,
  show_supervisor: true,
  show_booking_notes: true,
  show_id_image: true,
  show_prices: true,
  show_booking_date: true,
  show_seat_maps: true,
  show_notes_image: true,
  footer_text: "يرجى إبراز التذكرة عند الصعود للباص.",
};

export const TICKET_OPTION_LABELS: { key: Exclude<keyof TicketOptions, "footer_text">; label: string; hint?: string }[] = [
  { key: "show_qr", label: "رمز QR" },
  { key: "show_id_number", label: "رقم الهوية" },
  { key: "show_phones", label: "أرقام الجوال والواتساب" },
  { key: "show_hotel", label: "الفندق" },
  { key: "show_room", label: "نوع الغرفة" },
  { key: "show_bus_info", label: "بيانات الباص (الرقم/الاسم/اللوحة)" },
  { key: "show_supervisor", label: "اسم المشرف" },
  { key: "show_booking_notes", label: "ملاحظات الحجز" },
  { key: "show_id_image", label: "صورة الهوية", hint: "في التذكرة على الويب" },
  { key: "show_prices", label: "الأسعار (سعر الفرد والإجمالي والخصم)" },
  { key: "show_booking_date", label: "تاريخ الحجز" },
  { key: "show_seat_maps", label: "صفحات مخططات المقاعد" },
  { key: "show_notes_image", label: "صفحة التنبيهات الهامة (الانفوجرافيك)" },
];

export function parseTicketOptions(raw: unknown): TicketOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...DEFAULT_TICKET_OPTIONS };
  for (const { key } of TICKET_OPTION_LABELS) if (typeof o[key] === "boolean") out[key] = o[key] as boolean;
  if (typeof o.footer_text === "string") out.footer_text = o.footer_text;
  return out;
}
