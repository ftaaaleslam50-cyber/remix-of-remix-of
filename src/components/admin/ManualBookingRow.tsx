// Inline (spreadsheet-style) manual booking editor rendered inside the admin
// bookings table. Handles both "new booking" and "edit existing booking".
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Loader2, X, LayoutGrid } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BusSeatMap } from "@/components/booking/BusSeatMap";
import { LayoutSeatMap, type LayoutJson } from "@/components/booking/LayoutSeatMap";
import { getPackagePrice, ROOM_LABEL } from "@/lib/booking/pricing";
import type { Package, PricingCell, RoomType } from "@/lib/booking/types";
import { sar } from "@/lib/format";
import { writeAudit } from "@/lib/audit";

export interface ManualBookingDraft {
  id?: string;
  booking_code?: string;
  customer_name: string;
  contact_phone: string;
  whatsapp_phone: string;
  id_number: string;
  nationality: string;
  booking_source: string;
  booking_type: "individual" | "family";
  passenger_count: number;
  male_count: number;
  female_count: number;
  room_type: RoomType;
  package_id: string | null;
  trip_id: string | null;
  bus_id: string | null;
  seat_numbers: string[];
  actual_return_day: string;
  notes: string;
  status: string;
  total_price: number | null;
}

const EMPTY: ManualBookingDraft = {
  customer_name: "",
  contact_phone: "",
  whatsapp_phone: "",
  id_number: "",
  nationality: "",
  booking_source: "Admin",
  booking_type: "family",
  passenger_count: 1,
  male_count: 1,
  female_count: 0,
  room_type: "1",
  package_id: null,
  trip_id: null,
  bus_id: null,
  seat_numbers: [],
  actual_return_day: "",
  notes: "",
  status: "confirmed",
  total_price: null,
};

interface TripOpt {
  id: string;
  name: string;
  return_day: string | null;
  return_options: string[] | null;
}
interface BusOpt {
  id: string;
  name: string | null;
  bus_number: number;
  capacity: number;
  layout: "A" | "B" | null;
  layout_id: string | null;
  blocked_seats: string[] | null;
  price_addition: number | null;
}

function newCode(): string {
  return `ZT-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

export function ManualBookingRow({
  colSpan,
  initial,
  defaultTripId,
  defaultBusId,
  onClose,
  onSaved,
}: {
  colSpan: number;
  initial?: Partial<ManualBookingDraft> | null;
  defaultTripId?: string;
  defaultBusId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [d, setD] = useState<ManualBookingDraft>({
    ...EMPTY,
    trip_id: defaultTripId || null,
    bus_id: defaultBusId || null,
    ...(initial ?? {}),
  } as ManualBookingDraft);
  const [saving, setSaving] = useState(false);
  const [seatOpen, setSeatOpen] = useState(false);
  const [priceOverride, setPriceOverride] = useState<string>(
    initial?.total_price != null ? String(initial.total_price) : "",
  );

  const set = <K extends keyof ManualBookingDraft>(k: K, v: ManualBookingDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  const { data: trips = [] } = useQuery({
    queryKey: ["mb-trips"],
    queryFn: async () =>
      ((await supabase.from("trips").select("id,name,return_day,return_options").eq("active", true).order("display_order"))
        .data as unknown as TripOpt[]) ?? [],
  });

  const { data: buses = [] } = useQuery({
    queryKey: ["mb-buses", d.trip_id],
    queryFn: async () => {
      const base = supabase
        .from("buses")
        .select("id,name,bus_number,capacity,layout,layout_id,blocked_seats,price_addition")
        .order("bus_number");
      if (!d.trip_id) return ((await base).data as unknown as BusOpt[]) ?? [];
      const { data: links } = await supabase.from("trip_buses").select("bus_id").eq("trip_id", d.trip_id);
      const ids = (links ?? []).map((x: { bus_id: string }) => x.bus_id);
      const q = ids.length ? base.or(`id.in.(${ids.join(",")}),trip_id.eq.${d.trip_id}`) : base.eq("trip_id", d.trip_id);
      return ((await q).data as unknown as BusOpt[]) ?? [];
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["mb-packages"],
    queryFn: async () =>
      ((await supabase.from("packages").select("*").eq("active", true).order("display_order"))
        .data as unknown as Package[]) ?? [],
  });

  const { data: pricing = [] } = useQuery({
    queryKey: ["mb-pricing"],
    queryFn: async () =>
      ((await supabase.from("pricing_matrix").select("*")).data as unknown as PricingCell[]) ?? [],
  });

  const bus = buses.find((b) => b.id === d.bus_id) ?? null;

  const { data: layoutRow } = useQuery({
    queryKey: ["mb-layout", bus?.layout_id ?? null],
    enabled: !!bus?.layout_id,
    queryFn: async () =>
      (await supabase.from("bus_layouts").select("layout_json").eq("id", bus!.layout_id!).maybeSingle()).data as {
        layout_json: LayoutJson;
      } | null,
  });

  // Seats already taken on this bus (excluding the booking being edited).
  const { data: reserved = [] } = useQuery({
    queryKey: ["mb-reserved", d.bus_id, d.booking_code ?? ""],
    enabled: !!d.bus_id,
    queryFn: async () => {
      let q = supabase.from("bookings").select("seat_numbers,booking_code").eq("bus_id", d.bus_id!).neq("status", "cancelled").is("deleted_at", null);
      if (d.booking_code) q = q.neq("booking_code", d.booking_code);
      const { data } = await q;
      return ((data ?? []) as { seat_numbers: string[] }[]).flatMap((r) => r.seat_numbers ?? []);
    },
  });

  // Individual bookings always price off the shared 5-bed column.
  useEffect(() => {
    if (d.booking_type === "individual") set("room_type", "5");
  }, [d.booking_type]);

  const pkg = packages.find((p) => p.id === d.package_id) ?? null;
  const hotelPrice = getPackagePrice(pkg, d.room_type, d.passenger_count, pricing);
  const busPrice = Number(bus?.price_addition ?? 0);
  const computedTotal = (hotelPrice + busPrice) * Math.max(1, d.passenger_count);
  const total = priceOverride.trim() ? Number(priceOverride) || 0 : computedTotal;

  const returnOptions = useMemo(() => {
    const t = trips.find((x) => x.id === d.trip_id);
    if (!t) return [] as string[];
    return [t.return_day ?? "", ...((t.return_options ?? []) as string[])]
      .flatMap((s) => String(s).split(/[,،]/))
      .map((s) => s.trim())
      .filter(Boolean);
  }, [trips, d.trip_id]);

  // Gender map: the first male_count selected seats are male, the rest female.
  const seatGenders = useMemo(() => {
    const m: Record<string, "male" | "female"> = {};
    d.seat_numbers.forEach((s, i) => {
      m[s] = i < d.male_count ? "male" : "female";
    });
    return m;
  }, [d.seat_numbers, d.male_count]);

  async function save() {
    if (!d.customer_name.trim()) return toast.error("أدخل اسم العميل");
    if (!d.contact_phone.trim()) return toast.error("أدخل رقم الجوال");
    if (d.male_count + d.female_count !== d.passenger_count) {
      return toast.error("مجموع الذكور والإناث يجب أن يساوي عدد الأفراد");
    }
    setSaving(true);
    const code = d.booking_code ?? newCode();
    const payload = {
      booking_code: code,
      booking_type: d.booking_type,
      passenger_count: d.passenger_count,
      male_count: d.male_count,
      female_count: d.female_count,
      seat_genders: seatGenders,
      room_type: d.room_type,
      package_id: d.package_id,
      trip_id: d.trip_id,
      bus_id: d.bus_id,
      seat_numbers: d.seat_numbers,
      no_hotel: !d.package_id,
      no_bus: !d.bus_id,
      customer_name: d.customer_name.trim(),
      id_number: d.id_number.trim(),
      nationality: d.nationality.trim() || null,
      booking_source: d.booking_source.trim() || "Admin",
      contact_phone: d.contact_phone.trim(),
      whatsapp_phone: (d.whatsapp_phone || d.contact_phone).trim(),
      price_per_person: Math.round(total / Math.max(1, d.passenger_count)),
      total_price: total,
      discount_amount: 0,
      status: d.status,
      notes: d.notes.trim() || null,
      actual_return_day: d.actual_return_day || null,
    };

    const { error } = d.id
      ? await supabase.from("bookings").update(payload as never).eq("id", d.id)
      : await supabase.from("bookings").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    void writeAudit(d.id ? "booking.manual_update" : "booking.manual_create", "bookings", d.id ?? code, { code });
    toast.success(d.id ? "تم تحديث الحجز" : `تم إنشاء الحجز ${code}`);
    onSaved();
  }

  const cell = "h-9 text-xs";

  return (
    <tr className="bg-amber-50/60">
      <td colSpan={colSpan} className="p-4 align-top">
        <div className="rounded-2xl border-2 border-dashed border-[color:var(--color-gold)]/60 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="font-extrabold text-sm">
              {d.id ? `تعديل الحجز ${d.booking_code}` : "حجز يدوي جديد"}
            </h4>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving} className="rounded-full">
                {saving ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : <Check className="h-3 w-3 ml-1" />}
                حفظ
              </Button>
              <Button size="sm" variant="outline" onClick={onClose} className="rounded-full">
                <X className="h-3 w-3 ml-1" /> إلغاء
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
            <Field label="الاسم">
              <Input className={cell} value={d.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
            </Field>
            <Field label="الجوال">
              <Input className={cell} dir="ltr" value={d.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} />
            </Field>
            <Field label="واتساب">
              <Input className={cell} dir="ltr" value={d.whatsapp_phone} onChange={(e) => set("whatsapp_phone", e.target.value)} />
            </Field>
            <Field label="رقم الهوية">
              <Input className={cell} dir="ltr" value={d.id_number} onChange={(e) => set("id_number", e.target.value)} />
            </Field>
            <Field label="الجنسية">
              <Input className={cell} value={d.nationality} onChange={(e) => set("nationality", e.target.value)} />
            </Field>
            <Field label="مصدر الحجز">
              <Input className={cell} value={d.booking_source} onChange={(e) => set("booking_source", e.target.value)} />
            </Field>

            <Field label="نوع الحجز">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.booking_type}
                onChange={(e) => set("booking_type", e.target.value as "individual" | "family")}
              >
                <option value="family">عائلة</option>
                <option value="individual">أفراد</option>
              </select>
            </Field>
            <Field label="عدد الأفراد">
              <Input
                type="number"
                min={1}
                className={cell}
                value={d.passenger_count}
                onChange={(e) => {
                  const n = Math.max(1, Number(e.target.value) || 1);
                  setD((p) => ({
                    ...p,
                    passenger_count: n,
                    male_count: Math.min(p.male_count, n),
                    female_count: Math.max(0, n - Math.min(p.male_count, n)),
                    room_type: p.booking_type === "individual" ? "5" : (String(Math.min(5, n)) as RoomType),
                  }));
                }}
              />
            </Field>
            <Field label="ذكور">
              <Input
                type="number"
                min={0}
                className={cell}
                value={d.male_count}
                onChange={(e) => {
                  const m = Math.min(d.passenger_count, Math.max(0, Number(e.target.value) || 0));
                  setD((p) => ({ ...p, male_count: m, female_count: p.passenger_count - m }));
                }}
              />
            </Field>
            <Field label="إناث">
              <Input type="number" className={cell} value={d.female_count} readOnly />
            </Field>
            <Field label="الفندق">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.package_id ?? ""}
                onChange={(e) => set("package_id", e.target.value || null)}
              >
                <option value="">بدون فندق</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="نوع الغرفة">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.room_type}
                disabled={d.booking_type === "individual"}
                onChange={(e) => set("room_type", e.target.value as RoomType)}
              >
                {(["1", "2", "3", "4", "5"] as RoomType[]).map((r) => (
                  <option key={r} value={r}>
                    {ROOM_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="الرحلة">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.trip_id ?? ""}
                onChange={(e) => setD((p) => ({ ...p, trip_id: e.target.value || null, bus_id: null, seat_numbers: [] }))}
              >
                <option value="">بدون رحلة</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الحافلة">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.bus_id ?? ""}
                onChange={(e) => setD((p) => ({ ...p, bus_id: e.target.value || null, seat_numbers: [] }))}
              >
                <option value="">بدون حافلة</option>
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || `حافلة ${b.bus_number}`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="العودة الفعلية">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.actual_return_day}
                onChange={(e) => set("actual_return_day", e.target.value)}
              >
                <option value="">—</option>
                {returnOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المقاعد">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!d.bus_id}
                className="h-9 w-full text-xs justify-start"
                onClick={() => setSeatOpen(true)}
              >
                <LayoutGrid className="h-3 w-3 ml-1" />
                {d.seat_numbers.length ? d.seat_numbers.join(", ") : "اختيار المقاعد"}
              </Button>
            </Field>
            <Field label="الحالة">
              <select
                className={`${cell} w-full rounded-md border px-2 bg-white`}
                value={d.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="confirmed">مؤكَّد</option>
                <option value="pending">قيد المراجعة</option>
                <option value="cancelled">ملغي</option>
              </select>
            </Field>
            <Field label={`الإجمالي (محسوب: ${sar(computedTotal)})`}>
              <Input
                type="number"
                min={0}
                className={cell}
                placeholder={String(computedTotal)}
                value={priceOverride}
                onChange={(e) => setPriceOverride(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2 md:col-span-4 xl:col-span-6">
              <Label className="text-[10px] mb-1 block text-muted-foreground">ملاحظات</Label>
              <Input className={cell} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            الإجمالي المحفوظ: <b className="text-primary">{sar(total)}</b> — (سعر الفندق {sar(hotelPrice)} + الحافلة{" "}
            {sar(busPrice)}) × {d.passenger_count}
          </p>
        </div>

        <Dialog open={seatOpen} onOpenChange={setSeatOpen}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>اختيار المقاعد ({d.seat_numbers.length}/{d.passenger_count})</DialogTitle>
            </DialogHeader>
            {layoutRow?.layout_json ? (
              <LayoutSeatMap
                layout={layoutRow.layout_json}
                selected={d.seat_numbers}
                reserved={reserved}
                maxSelectable={d.passenger_count}
                genders={seatGenders}
                onChange={(s) => set("seat_numbers", s)}
              />
            ) : (
              <BusSeatMap
                selected={d.seat_numbers}
                reserved={reserved}
                maxSelectable={d.passenger_count}
                blocked={bus?.blocked_seats ?? []}
                layout={(bus?.layout as "A" | "B") ?? "A"}
                genders={seatGenders}
                onChange={(s) => set("seat_numbers", s)}
              />
            )}
            <Button className="rounded-full" onClick={() => setSeatOpen(false)}>
              تم
            </Button>
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] mb-1 block text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
