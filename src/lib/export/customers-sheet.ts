import ExcelJS from "exceljs";
import type { TravelCustomer } from "@/lib/customers";
import { cleanPhone } from "@/lib/customers";

export const CUSTOMER_HEADERS = ["الاسم الكامل", "رقم الهوية", "رقم الجوال", "رقم الواتساب", "نفس رقم الواتساب", "الجنسية", "ملاحظات", "نشط"] as const;

export type CustomerImport = Pick<TravelCustomer, "full_name" | "id_number" | "contact_phone" | "whatsapp_phone" | "same_whatsapp" | "nationality" | "notes" | "active">;

const text = (cell: ExcelJS.Cell) => {
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("text" in value) return String(value.text ?? "").trim();
    if ("result" in value) return String(value.result ?? "").trim();
  }
  return String(value ?? "").trim();
};

export async function makeCustomersWorkbook(rows: TravelCustomer[] = []): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("العملاء", { views: [{ rightToLeft: true }] });
  sheet.addRow([...CUSTOMER_HEADERS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = [{ width: 32 }, { width: 23 }, { width: 22 }, { width: 22 }, { width: 20 }, { width: 20 }, { width: 40 }, { width: 12 }];
  for (const row of rows) sheet.addRow([
    row.full_name, row.id_number, row.contact_phone, row.whatsapp_phone || "",
    row.same_whatsapp ? "نعم" : "لا", row.nationality || "", row.notes || "", row.active ? "نعم" : "لا",
  ]);
  for (let i = 2; i <= sheet.rowCount; i++) {
    for (const column of [2, 3, 4]) sheet.getRow(i).getCell(column).numFmt = "@";
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export async function parseCustomersWorkbook(file: File): Promise<{ rows: CustomerImport[]; errors: string[] }> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error("اختر ملف Excel بصيغة xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet || CUSTOMER_HEADERS.some((h, i) => text(sheet.getRow(1).getCell(i + 1)) !== h)) {
    throw new Error("عناوين الأعمدة غير مطابقة للنموذج؛ نزّل النموذج واستخدمه دون تغيير العناوين");
  }
  const rows: CustomerImport[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (let n = 2; n <= sheet.rowCount; n++) {
    const cells = CUSTOMER_HEADERS.map((_, i) => text(sheet.getRow(n).getCell(i + 1)));
    if (cells.every((v) => !v)) continue;
    const [full_name, id_number, contact_phone, whatsapp_phone, same, nationality, notes, active] = cells;
    const same_whatsapp = !whatsapp_phone || same === "نعم";
    if (full_name.length < 2 || !id_number || cleanPhone(contact_phone).length < 9 || (!same_whatsapp && cleanPhone(whatsapp_phone).length < 9)) {
      errors.push(`الصف ${n}: الاسم والهوية والجوال والواتساب (عند اختلافه) مطلوبة وصحيحة`);
      continue;
    }
    if (seen.has(id_number)) { errors.push(`الصف ${n}: رقم الهوية مكرر في الملف`); continue; }
    seen.add(id_number);
    rows.push({ full_name, id_number, contact_phone, whatsapp_phone: same_whatsapp ? contact_phone : whatsapp_phone,
      same_whatsapp, nationality: nationality || null, notes: notes || null, active: active !== "لا" });
  }
  return { rows, errors };
}