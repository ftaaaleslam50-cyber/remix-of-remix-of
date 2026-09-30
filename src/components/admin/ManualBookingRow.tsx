// Inline (spreadsheet-style) manual booking editor rendered inside the admin
// bookings table. Handles both "new booking" and "edit existing booking".
// It mirrors every field of the public booking wizard: customer data, booking
// type & passengers, trip / bus / trip-mode, seats, hotel + extension nights,
// coupon & discount, representative data and notes.
import { fetchTripBusesWithLinks } from "@/lib/trip-bus-links";
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
import { getPackagePrice, roomDisplayLabel, ROOM_LABEL } from "@/lib/booking/pricing";
import type { Package, PricingCell, RoomType } from "@/lib/booking/types";
import { sar } from "@/lib/format";
import { formatReturnOption } from "@/lib/trip-dates";
import { writeAudit } from "@/lib/audit";
import { storeBookingProfit } from "@/lib/profit";
import { CustomerCombobox } from "@/components/admin/CustomerCombobox";
import { customersTable, customerWhatsapp, type TravelCustomer, idImageUrl, uploadCustomerId } from "@/lib/customers";
import { Upload, Trash2 } from "lucide-react";

const ID_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** رفع صورة الهوية إلى التخزين الخاص؛ يحفظ المسار. الروابط القديمة تبقى معروضة كما هي. */
function IdImageUpload({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    let alive = true;
    setPreview(null);
    if (value) idImageUrl(value).then((u) => alive && setPreview(u));
    return () => { alive = false; };
  }, [value]);

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!ID_IMAGE_TYPES.includes(file.type)) return void toast.error("الصيغ المدعومة: JPG / PNG / WEBP");
    setUploading(true);
    try {
      onChange(await uploadCustomerId(file));
      toast.success("تم رفع صورة الهوية");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {value && (
        <a href={preview ?? undefined} target="_blank" rel="noreferrer" className="shrink-0">
          {preview ? (
            <img src={preview} alt="صورة الهوية" className="h-12 w-16 rounded border object-cover" />
          ) : (
            <div className="h-12 w-16 rounded border bg-muted grid place-items-center"><Loader2 className="h-3 w-3 animate-spin" /></div>
          )}
        </a>
      )}
      <label className="inline-flex">
        <input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <span className={`cursor-pointer inline-flex items-center gap-1 h-9 px-3 rounded-lg border bg-background text-xs font-bold hover:bg-muted ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {value ? "إعادة الرفع" : "رفع صورة الهوية"}
        </span>
      </label>
      {value && (
        <Button type="button" size="sm" variant="outline" onClick={() => onChange("")} title="حذف الصورة">
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

export type TripMode = "round" | "outbound" | "return" | "round_open";

const TRIP_MODE_LABEL: Record<TripMode, string> = {
  round: "ذهاب وعودة",
  outbound: "ذهاب فقط",
  return: "عودة فقط",
  round_open: "ذهاب وعودة في رحلة أخرى",
};

export interface ManualBookingDraft {
  id?: string;
  booking_code?: string;
  customer_name: string;
  contact_phone: string;
  whatsapp_phone: string;
  id_number: string;
  id_image_url: string;
  nationality: string;
  booking_source: string;
  booking_type: "individual" | "family";
  passenger_count: number;
  male_count: number;
  female_count: number;
  room_type: RoomType;
  package_id: string | null;
  extension_nights: number;
  trip_id: string | null;
  bus_id: string | null;
  trip_mode: TripMode;
  seat_numbers: string[];
  actual_return_day: string;
  coupon_code: string;
  discount_amount: number;
  rep_name: string;
  rep_phone: string;
  rep_whatsapp: string;
  rep_profile_id: string | null;
  notes: string;
  status: string;
  total_price: number | null;
}

const EMPTY: ManualBookingDraft = {
  customer_name: "",
  contact_phone: "",
  whatsapp_phone: "",
  id_number: "",
  id_image_url: "",
  nationality: "",
  booking_source: "Admin",
  booking_type: "family",
  passenger_count: 1,
  male_count: 1,
  female_count: 0,
  room_type: "1",
  package_id: null,
  extension_nights: 0,
  trip_id: null,
  bus_id: null,
  trip_mode: "round",
  seat_numbers: [],
  actual_return_day: "",
  coupon_code: "",
  discount_amount: 0,
  rep_name: "",
  rep_phone: "",
  rep_whatsapp: "",
  rep_profile_id: null,
  notes: "",
  status: "confirmed",
  total_price: null,
};

interface TripOpt {
  id: string;
  name: string;
  departure_day: string | null;
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
  round_trip_price: number | null;
  outbound_price: number | null;
  return_price: number | null;
  open_return_price: number | null;
  direction?: string | null;
  linked?: boolean;
  assigned_date?: string | null;
}

function newCode(): string {
  return `ZT-${new Date().getFullYear()}-${Math.floor(Math.random() * 900000 + 100000)}`;
}

/** سعر الحافلة للفرد حسب نوع الرحلة (مع رجوع للسعر القديم عند عدم التعبئة). */
function busPriceFor(bus: BusOpt | null, mode: TripMode): number {
  if (!bus) return 0;
  const legacy = Number(bus.price_addition ?? 0) || 0;
  const v =
    Number(
      (mode === "outbound"
        ? bus.outbound_price
        : mode === "return"
          ? bus.return_price
          : mode === "round_open"
            ? (Number(bus.open_return_price ?? 0) || bus.round_trip_price)
            : bus.round_trip_price) ?? 0,
    ) || 0;
  return v > 0 ? v : mode === "round" || mode === "round_open" ? legacy : v;
}

export function ManualBookingRow({
  colSpan,
  initial,
  defaultTripId,
  defaultBusId,
  ownerId,
  extraPayload,
  onClose,
  onSaved,
}: {
  colSpan: number;
  initial?: Partial<ManualBookingDraft> | null;
  defaultTripId?: string;
  defaultBusId?: string;
  /** ربط الحجز الجديد بحساب المُنشئ (المندوب) ليظهر في "حجوزاتي". */
  ownerId?: string;
  /** حقول إضافية تُحفظ مع الحجز (مثل ربط رحلة العودة وتاريخها). */
  extraPayload?: Record<string, unknown>;
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
  const [priceOverride, setPriceOverride] = useState<string>("");
  // عميل محفوظ مختار من «العملاء» — لا يُحدَّث سجله إلا بموافقة صريحة.
  const [picked, setPicked] = useState<TravelCustomer | null>(null);
  const [updateSaved, setUpdateSaved] = useState(false);
  const customerChanged = !!picked && (
    picked.full_name !== d.customer_name.trim() ||
    picked.id_number !== d.id_number.trim() ||
    picked.contact_phone !== d.contact_phone.trim() ||
    customerWhatsapp(picked) !== (d.whatsapp_phone || d.contact_phone).trim()
  );

  async function syncCustomer() {
    const name = d.customer_name.trim();
    const idn = d.id_number.trim();
    const phone = d.contact_phone.trim();
    const wa = (d.whatsapp_phone || phone).trim();
    const row = {
      full_name: name, id_number: idn, contact_phone: phone,
      whatsapp_phone: wa, same_whatsapp: wa === phone,
      nationality: d.nationality.trim() || null,
      id_image_url: d.id_image_url.trim() || null,
    };
    if (picked) {
      if (!customerChanged || !updateSaved) return;
      const { error } = await customersTable().update(row as never).eq("id", picked.id);
      if (error) toast.error(`تعذّر تحديث بيانات العميل: ${error.message}`);
      else toast.success("تم تحديث بيانات العميل المحفوظة");
      return;
    }
    if (d.id || !name || !idn || !phone) return;
    const { error } = await customersTable().insert(row as never);
    if (!error) toast.success("تم حفظ العميل في قائمة العملاء");
  }

  const set = <K extends keyof ManualBookingDraft>(k: K, v: ManualBookingDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }));

  const { data: trips = [] } = useQuery({
    queryKey: ["mb-trips"],
    queryFn: async () =>
      ((
        await supabase
          .from("trips")
          .select("id,name,departure_day,return_day,return_options")
          .eq("active", true)
          .order("display_order")
      ).data as unknown as TripOpt[]) ?? [],
  });

  const returnCtx = typeof extraPayload?.return_trip_id === "string" ? `return:${extraPayload.return_trip_id}` : "";
  const busTripKey = returnCtx || d.trip_id || "";
  const { data: buses = [] } = useQuery({
    queryKey: ["mb-buses", busTripKey],
    queryFn: async () => {
      const COLS =
        "id,name,bus_number,capacity,layout,layout_id,blocked_seats,price_addition,round_trip_price,outbound_price,return_price,open_return_price,direction,assigned_date,trip_id";
      if (!busTripKey) {
        const { data } = await supabase
          .from("buses")
          .select(COLS)
          .order("assigned_date", { ascending: true, nullsFirst: false })
          .order("bus_number");
        return (data as unknown as BusOpt[]) ?? [];
      }
      return fetchTripBusesWithLinks<BusOpt>(busTripKey, COLS);
    },
  });

  const { data: packages = [] } = useQuery({
    queryKey: ["mb-packages"],
    queryFn: async () =>
      ((await supabase.from("packages").select("*").eq("active", true).order("display_order"))
        .data as unknown as Package[]) ?? [],
  });

  // دليل المناديب — من حسابات المستخدمين (نوع الحساب: مندوب)
  const { data: reps = [] } = useQuery({
    queryKey: ["rep-profiles", "active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,mobile_phone,whatsapp_phone")
        .eq("account_type", "representative")
        .eq("active", true)
        .order("full_name");
      return ((data ?? []) as {
        id: string;
        full_name: string | null;
        mobile_phone: string | null;
        whatsapp_phone: string | null;
      }[]).map((p) => ({
        id: p.id,
        user_id: p.id,
        name: p.full_name ?? "",
        phone: p.mobile_phone ?? "",
        whatsapp: p.whatsapp_phone ?? "",
      })).filter((r) => r.name);
    },
    staleTime: 60_000,
  });

  const { data: pricing = [] } = useQuery({
    queryKey: ["mb-pricing"],
    queryFn: async () =>
      ((await supabase.from("pricing_matrix").select("*")).data as unknown as PricingCell[]) ?? [],
  });

  const busFromList = buses.find((b) => b.id === d.bus_id) ?? null;

  // When editing a booking whose bus is not linked to the selected trip (or the
  // trip list hasn't loaded), fetch that bus directly so its custom layout and
  // pricing are still used instead of the default seat map.
  const { data: busDirect = null } = useQuery({
    queryKey: ["mb-bus-direct", d.bus_id],
    enabled: !!d.bus_id && !busFromList,
    queryFn: async () =>
      ((
        await supabase
          .from("buses")
          .select(
            "id,name,bus_number,capacity,layout,layout_id,blocked_seats,price_addition,round_trip_price,outbound_price,return_price,open_return_price",
          )
          .eq("id", d.bus_id!)
          .maybeSingle()
      ).data as unknown as BusOpt) ?? null,
  });

  const bus = busFromList ?? busDirect;

  const { data: layoutRow } = useQuery({
    queryKey: ["mb-layout", bus?.layout_id ?? null],
    enabled: !!bus?.layout_id,
    queryFn: async () =>
      (await supabase.from("bus_layouts").select("layout_json").eq("id", bus!.layout_id!).maybeSingle()).data as {
        layout_json: LayoutJson;
      } | null,
  });

  // Seats already taken on this bus (excluding the booking being edited).
  // Uses the public occupancy RPC so non-admin staff (representatives) also
  // see the real occupancy instead of an empty bus.
  const { data: reserved = [] } = useQuery({
    queryKey: ["mb-reserved", d.bus_id, d.booking_code ?? ""],
    enabled: !!d.bus_id,
    refetchInterval: 1_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_bus_occupancy" as never, {
        _trip_id: d.trip_id ?? null,
        _bus_id: d.bus_id,
        _exclude_code: d.booking_code ?? null,
      } as never);
      if (error) throw error;
      return ((data ?? []) as { seat_numbers: string[] }[]).flatMap((r) => r.seat_numbers ?? []);
    },
  });

  // Gender of already-reserved seats (pale blue / pale pink shading).
  const { data: reservedGenders = {} } = useQuery({
    queryKey: ["mb-reserved-genders", d.bus_id, d.booking_code ?? ""],
    enabled: !!d.bus_id,
    refetchInterval: 1_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_bus_seat_genders" as never, {
        _trip_id: d.trip_id ?? null,
        _bus_id: d.bus_id,
        _exclude_code: d.booking_code ?? null,
      } as never);
      if (error) throw error;
      const map: Record<string, "male" | "female"> = {};
      for (const row of (data ?? []) as { seat_genders: Record<string, string> | null }[]) {
        for (const [seat, g] of Object.entries(row.seat_genders ?? {})) {
          if (g === "male" || g === "female") map[seat] = g;
        }
      }
      return map;
    },
  });



  // Individual bookings always price off the shared 5-bed column.
  useEffect(() => {
    if (d.booking_type === "individual") set("room_type", "5");
  }, [d.booking_type]);

  // "عودة فقط"/"ذهاب فقط": no actual-return picker for outbound-only trips.
  useEffect(() => {
    if (d.trip_mode === "outbound" && d.actual_return_day) set("actual_return_day", "");
  }, [d.trip_mode]);

  const pkg = packages.find((p) => p.id === d.package_id) ?? null;
  const noHotel = !d.package_id;
  const noBus = !d.bus_id;
  const hotelPerPerson = noHotel ? 0 : getPackagePrice(pkg, d.room_type, d.passenger_count, pricing);
  const busPerPerson = noBus ? 0 : busPriceFor(bus, d.trip_mode);
  const pricePerPerson = hotelPerPerson + busPerPerson;
  const subtotal = pricePerPerson * Math.max(1, d.passenger_count);
  const extensionNights = noHotel ? 0 : Math.max(0, Math.min(10, d.extension_nights));
  const extensionPerNight = noHotel ? 0 : Number(pkg?.extension_price ?? 0);
  const extensionTotal = extensionPerNight * extensionNights;
  const discount = Math.max(0, Math.min(Number(d.discount_amount) || 0, subtotal));
  const computedTotal = Math.max(0, subtotal - discount) + extensionTotal;
  const total = priceOverride.trim() ? Number(priceOverride) || 0 : computedTotal;

  const selectedTrip = trips.find((x) => x.id === d.trip_id) ?? null;
  const returnOptions = useMemo(() => {
    // خيارات العودة: خيارات الرحلة + تواريخ كل حافلات العودة (مرتبة تصاعديًا).
    const tripOpts = selectedTrip
      ? [selectedTrip.return_day ?? "", ...((selectedTrip.return_options ?? []) as string[])]
          .flatMap((s) => String(s).split(/[,،]/))
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const busDates = buses
      .filter((b) => b.direction === "return" && b.assigned_date)
      .map((b) => b.assigned_date as string)
      .sort();
    return Array.from(new Set([...busDates, ...tripOpts]));
  }, [selectedTrip, buses]);

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
    if (d.male_count + d.female_count !== d.passenger_count) {
      return toast.error("مجموع الذكور والإناث يجب أن يساوي عدد الأفراد");
    }
    if (!noBus && d.seat_numbers.length && d.seat_numbers.length !== d.passenger_count) {
      return toast.error("عدد المقاعد المختارة لا يساوي عدد الأفراد");
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
      extension_nights: extensionNights,
      trip_id: d.trip_id,
      bus_id: d.bus_id,
      trip_mode: d.trip_mode,
      seat_numbers: d.seat_numbers,
      no_hotel: noHotel,
      no_bus: noBus,
      customer_name: d.customer_name.trim(),
      id_number: d.id_number.trim(),
      id_image_url: d.id_image_url.trim() || null,
      nationality: d.nationality.trim() || null,
      booking_source: d.booking_source.trim() || "Admin",
      contact_phone: d.contact_phone.trim(),
      whatsapp_phone: (d.whatsapp_phone || d.contact_phone).trim(),
      rep_name: d.rep_name.trim() || null,
      rep_phone: d.rep_phone.trim() || null,
      rep_whatsapp: d.rep_whatsapp.trim() || null,
      rep_profile_id: ownerId ?? d.rep_profile_id ?? null,
      price_per_person: Math.round(total / Math.max(1, d.passenger_count)),
      total_price: total,
      coupon_code: d.coupon_code.trim().toUpperCase() || null,
      discount_amount: discount,
      status: d.status,
      notes: d.notes.trim() || null,
      actual_return_day: d.trip_mode === "outbound" ? null : d.actual_return_day || selectedTrip?.return_day || null,
      // أي تاريخ عودة حقيقي (ISO) يُعتمد في كل النظام، لا في «رحلة أخرى» فقط.
      ...(/^\d{4}-\d{2}-\d{2}$/.test(d.actual_return_day) ? { return_date: d.actual_return_day } : {}),
      ...(extraPayload ?? {}),
    };

    const linkedRepresentative = reps.find((r) => r.name === d.rep_name.trim() && r.user_id);
    const trustedOwnerId = ownerId ?? linkedRepresentative?.user_id ?? undefined;
    const { error } = d.id
      ? await supabase.from("bookings").update(payload as never).eq("id", d.id)
      : await supabase
          .from("bookings")
          .insert((trustedOwnerId ? { ...payload, created_by: trustedOwnerId } : payload) as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    void syncCustomer();
    void storeBookingProfit(code);
    void writeAudit(d.id ? "booking.manual_update" : "booking.manual_create", "bookings", d.id ?? code, { code });
    toast.success(d.id ? "تم تحديث الحجز" : `تم إنشاء الحجز ${code}`);
    onSaved();
  }

  const cell = "h-9 text-xs";
  const sel = `${cell} w-full rounded-md border px-2 bg-white`;

  return (
    <tr className="bg-amber-50/60">
      <td colSpan={colSpan} className="p-4 align-top">
        <div className="rounded-2xl border-2 border-dashed border-[color:var(--color-gold)]/60 bg-white p-4 space-y-4">
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

          {/* 1) نوع الحجز والأفراد */}
          <Section title="١) نوع الحجز والأفراد">
            <Field label="نوع الحجز">
              <select
                className={sel}
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
                    seat_numbers: p.seat_numbers.slice(0, n),
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
            <Field label={`نوع الغرفة (${roomDisplayLabel(d.room_type, d.booking_type, !!d.package_id)})`}>
              <select
                className={sel}
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
            <Field label="الحالة">
              <select className={sel} value={d.status} onChange={(e) => set("status", e.target.value)}>
                <option value="confirmed">مؤكَّد</option>
                <option value="pending">قيد المراجعة</option>
                <option value="cancelled">ملغي</option>
              </select>
            </Field>
          </Section>

          {/* 2) الرحلة والحافلة */}
          <Section title="٢) الرحلة والحافلة">
            <Field label="الرحلة">
              <select
                className={sel}
                value={d.trip_id ?? ""}
                onChange={(e) =>
                  setD((p) => ({ ...p, trip_id: e.target.value || null, bus_id: null, seat_numbers: [], actual_return_day: "" }))
                }
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
                className={sel}
                value={d.bus_id ?? ""}
                onChange={(e) => setD((p) => ({ ...p, bus_id: e.target.value || null, seat_numbers: [] }))}
              >
                <option value="">بدون حافلة</option>
                {(() => {
                  const byDate = (a: BusOpt, b: BusOpt) =>
                    (a.assigned_date ?? "9999-12-31").localeCompare(b.assigned_date ?? "9999-12-31") || a.bus_number - b.bus_number;
                  const out = buses.filter((b) => b.direction !== "return").sort(byDate);
                  const ret = buses.filter((b) => b.direction === "return").sort(byDate);
                  const opt = (b: BusOpt) => (
                    <option key={b.id} value={b.id}>
                      {b.name || `حافلة ${b.bus_number}`}
                      {b.assigned_date ? ` — ${b.assigned_date}` : ""}
                      {b.linked === undefined ? "" : b.linked ? " — مرتبطة" : " — غير مرتبطة"}
                    </option>
                  );
                  return (
                    <>
                      {out.length > 0 && <option disabled>── حافلات الذهاب ──</option>}
                      {out.map(opt)}
                      {ret.length > 0 && <option disabled>──────────── حافلات العودة ──</option>}
                      {ret.map(opt)}
                    </>
                  );
                })()}
              </select>
            </Field>
            <Field label="نوع الرحلة">
              <select
                className={sel}
                value={d.trip_mode}
                disabled={noBus}
                onChange={(e) => set("trip_mode", e.target.value as TripMode)}
              >
                {(Object.keys(TRIP_MODE_LABEL) as TripMode[]).map((m) => (
                  <option key={m} value={m}>
                    {TRIP_MODE_LABEL[m]} — {sar(busPriceFor(bus, m))}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الذهاب">
              <Input className={cell} value={selectedTrip?.departure_day ?? "-"} readOnly />
            </Field>
            {d.trip_mode === "round_open" && (
              <Field label="تاريخ العودة (رحلة أخرى)">
                <Input
                  type="date"
                  className={cell}
                  value={d.actual_return_day}
                  onChange={(e) => set("actual_return_day", e.target.value)}
                />
              </Field>
            )}
            {d.trip_mode !== "outbound" && d.trip_mode !== "round_open" && (
              <Field label="العودة الفعلية">
                <select className={sel} value={d.actual_return_day} onChange={(e) => set("actual_return_day", e.target.value)}>
                  <option value="">—</option>
                  {returnOptions.map((r) => (
                    <option key={r} value={r}>
                      {formatReturnOption(r)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={`المقاعد (${d.seat_numbers.length}/${d.passenger_count})`}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={noBus}
                className="h-9 w-full text-xs justify-start"
                onClick={() => setSeatOpen(true)}
              >
                <LayoutGrid className="h-3 w-3 ml-1" />
                {d.seat_numbers.length ? d.seat_numbers.join(", ") : "اختيار المقاعد"}
              </Button>
            </Field>
          </Section>

          {/* 3) الفندق والتمديد */}
          <Section title="٣) الفندق والتمديد">
            <Field label="الفندق">
              <select
                className={sel}
                value={d.package_id ?? ""}
                onChange={(e) => setD((p) => ({ ...p, package_id: e.target.value || null, extension_nights: e.target.value ? p.extension_nights : 0 }))}
              >
                <option value="">بدون فندق (نقل فقط)</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ليالي التمديد (0-10)">
              <Input
                type="number"
                min={0}
                max={10}
                className={cell}
                disabled={noHotel}
                value={d.extension_nights}
                onChange={(e) => set("extension_nights", Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              />
            </Field>
            <Field label="سعر ليلة التمديد">
              <Input className={cell} value={sar(extensionPerNight)} readOnly />
            </Field>
            <Field label="سعر الفندق/فرد">
              <Input className={cell} value={sar(hotelPerPerson)} readOnly />
            </Field>
            <Field label="سعر الحافلة/فرد">
              <Input className={cell} value={sar(busPerPerson)} readOnly />
            </Field>
            <Field label="الإجمالي/فرد">
              <Input className={cell} value={sar(pricePerPerson)} readOnly />
            </Field>
          </Section>

          {/* 4) بيانات المعتمر */}
          <Section title="٤) بيانات المعتمر">
            <Field label="الاسم">
              <CustomerCombobox
                className={cell}
                value={d.customer_name}
                selected={!!picked}
                onChange={(v) => set("customer_name", v)}
                onPick={(c) => {
                  setPicked(c);
                  setUpdateSaved(false);
                  setD((p) => ({
                    ...p,
                    customer_name: c.full_name,
                    id_number: c.id_number,
                    contact_phone: c.contact_phone,
                    whatsapp_phone: customerWhatsapp(c),
                    id_image_url: c.id_image_url || p.id_image_url,
                    nationality: c.nationality || p.nationality,
                  }));
                }}
                onNew={() => setPicked(null)}
              />
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
            <Field label="صورة الهوية">
              <IdImageUpload value={d.id_image_url} onChange={(v) => set("id_image_url", v)} />
            </Field>
          </Section>
          {picked && customerChanged && (
            <label className="flex items-center gap-2 text-xs rounded-xl border border-warning/50 bg-warning/10 p-2">
              <input type="checkbox" checked={updateSaved} onChange={(e) => setUpdateSaved(e.target.checked)} />
              تحديث بيانات العميل المحفوظة «{picked.full_name}» بالبيانات المعدّلة
            </label>
          )}
          {!picked && !d.id && d.customer_name.trim() && d.id_number.trim() && (
            <div className="text-[11px] text-muted-foreground">سيُحفظ هذا العميل تلقائيًا في «العملاء» بعد حفظ الحجز (إن لم يكن رقم هويته مسجلًا).</div>
          )}

          {/* 5) المندوب والمصدر */}
          <Section title="٥) المندوب ومصدر الحجز">
            <Field label="مصدر الحجز">
              <Input className={cell} value={d.booking_source} onChange={(e) => set("booking_source", e.target.value)} />
            </Field>
            <Field label="اسم المندوب">
              <Input
                className={cell}
                list="rep-directory"
                value={d.rep_name}
                onChange={(e) => {
                  const name = e.target.value;
                  const match = reps.find((r) => r.name === name);
                  if (match) {
                    setD((p) => ({
                      ...p,
                      rep_name: name,
                      rep_phone: match.phone || p.rep_phone,
                      rep_whatsapp: match.whatsapp || match.phone || p.rep_whatsapp,
                      booking_source: match.name,
                      rep_profile_id: match.id,
                    }));
                  } else {
                    set("rep_name", name);
                  }
                }}
              />
              <datalist id="rep-directory">
                {reps.map((r) => (
                  <option key={r.id} value={r.name} />
                ))}
              </datalist>
            </Field>
            <Field label="جوال المندوب">
              <Input className={cell} dir="ltr" value={d.rep_phone} onChange={(e) => set("rep_phone", e.target.value)} />
            </Field>
            <Field label="واتساب المندوب">
              <Input className={cell} dir="ltr" value={d.rep_whatsapp} onChange={(e) => set("rep_whatsapp", e.target.value)} />
            </Field>
          </Section>

          {/* 6) الخصم والإجمالي */}
          <Section title="٦) الخصم والإجمالي">
            <Field label="كود الخصم">
              <Input className={cell} dir="ltr" value={d.coupon_code} onChange={(e) => set("coupon_code", e.target.value)} />
            </Field>
            <Field label="قيمة الخصم">
              <Input
                type="number"
                min={0}
                className={cell}
                value={d.discount_amount}
                onChange={(e) => set("discount_amount", Math.max(0, Number(e.target.value) || 0))}
              />
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
            <div className="sm:col-span-2 md:col-span-4 xl:col-span-3">
              <Label className="text-[10px] mb-1 block text-muted-foreground">ملاحظات</Label>
              <Input className={cell} value={d.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </Section>

          <p className="text-xs text-muted-foreground">
            الإجمالي المحفوظ: <b className="text-primary">{sar(total)}</b> — (فندق {sar(hotelPerPerson)} + حافلة{" "}
            {sar(busPerPerson)}) × {d.passenger_count} − خصم {sar(discount)} + تمديد {sar(extensionTotal)}
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
                reservedGenders={reservedGenders}
                maxSelectable={d.passenger_count}
                genders={seatGenders}
                onChange={(s) => set("seat_numbers", s)}
              />
            ) : (
              <BusSeatMap
                selected={d.seat_numbers}
                reserved={reserved}
                reservedGenders={reservedGenders}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3">
      <p className="mb-2 text-[11px] font-extrabold text-primary">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">{children}</div>
    </div>
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
