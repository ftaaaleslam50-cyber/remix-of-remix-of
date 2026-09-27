import { supabase } from "@/integrations/supabase/client";

export interface TravelCustomer {
  id: string;
  full_name: string;
  id_number: string;
  contact_phone: string;
  whatsapp_phone: string | null;
  same_whatsapp: boolean;
  id_image_url: string | null;
  nationality: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export const customersTable = () => supabase.from("travel_customers" as never);

/** Digits only; Saudi local numbers (05xxxxxxxx) become 9665xxxxxxxx. */
export function cleanPhone(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = `966${d.slice(1)}`;
  else if (d.startsWith("5") && d.length === 9) d = `966${d}`;
  return d;
}

export const waLink = (phone: string | null | undefined) => `https://wa.me/${cleanPhone(phone)}`;
export const customerWhatsapp = (c: Pick<TravelCustomer, "same_whatsapp" | "contact_phone" | "whatsapp_phone">) =>
  c.same_whatsapp ? c.contact_phone : c.whatsapp_phone || c.contact_phone;

/** Escape characters that have meaning inside a PostgREST or() filter. */
const esc = (s: string) => s.replace(/[%,()*\\]/g, " ").trim();

export async function searchCustomers(q: string, limit = 8, offset = 0, includeInactive = false) {
  let query = customersTable().select("*", { count: "exact" }).order("full_name").range(offset, offset + limit - 1);
  if (!includeInactive) query = query.eq("active" as never, true as never);
  const s = esc(q);
  if (s) query = query.or(`full_name.ilike.%${s}%,id_number.ilike.%${s}%,contact_phone.ilike.%${s}%,whatsapp_phone.ilike.%${s}%`);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: (data ?? []) as unknown as TravelCustomer[], count: count ?? 0 };
}

/** Private id-uploads bucket paths get a short-lived signed URL; full URLs pass through. */
export async function idImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase.storage.from("id-uploads").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export async function uploadCustomerId(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `customers/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("id-uploads").upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}
