import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Star,
  Upload,
  Users,
  User,
  Calendar,
  Loader2,
  X,
  Package as PackageIcon,
  Ticket,
  Shuffle,
  MousePointerClick,
  Mars,
  Venus,
} from "lucide-react";

import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { NAV_LINKS } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BusSeatMap, pickRandomSeats } from "@/components/booking/BusSeatMap";
import { LayoutSeatMap, pickRandomLayoutSeats, type LayoutJson } from "@/components/booking/LayoutSeatMap";
import { supabase } from "@/integrations/supabase/client";
import { getClientIp, getDeviceId } from "@/lib/client-ip";
import { BRAND } from "@/lib/brand";
import { sar } from "@/lib/format";
import { getPackagePrice, ROOM_LABEL } from "@/lib/booking/pricing";
import type { BookingType, Bus, Package, PricingCell, RoomType, Trip } from "@/lib/booking/types";

export const Route = createFileRoute("/booking")({
  head: () => ({
    meta: [
      { title: `الحجز | ${BRAND.name}` },
      { name: "description", content: "احجز رحلة العمرة الخاصة بك — باقات مرنة، مقاعد محددة، تأكيد فوري." },
    ],
  }),
  component: BookingPage,
});

// Booking steps. "الرحلة والحافلة" hosts the "No Bus" option; picking it drops "المقاعد".
const BASE_STEPS = ["نوع الحجز", "عدد الأفراد", "الرحلة والحافلة", "المقاعد", "الفندق", "البيانات", "التأكيد"] as const;

function BookingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  const [bookingType, setBookingType] = useState<BookingType | null>(null);
  const [passengerCount, setPassengerCount] = useState(1);
  const [maleCount, setMaleCount] = useState(1);
  const [femaleCount, setFemaleCount] = useState(0);
  const [seatGenders, setSeatGenders] = useState<Record<string, "male" | "female">>({});
  const [activeGender, setActiveGender] = useState<"male" | "female">("male");
  const [packageId, setPackageId] = useState<string | null>(null);
  const [roomType, setRoomType] = useState<RoomType>("5");
  const [tripId, setTripId] = useState<string | null>(null);
  const [seatMode, setSeatMode] = useState<"manual" | "random">("manual");
  const [seats, setSeats] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    prize_type: "percent" | "fixed";
    prize_value: number;
    label?: string | null;
  } | null>(null);
  const [customer, setCustomer] = useState({
    customer_name: "",
    id_number: "",
    contact_phone: "",
    whatsapp_phone: "",
    nationality: "",
    same_whatsapp: true,
  });
  const [idFile, setIdFile] = useState<File | null>(null);
  const [profileIdImagePath, setProfileIdImagePath] = useState<string | null>(null);
  const [profileIdImageSignedUrl, setProfileIdImageSignedUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [noHotel, setNoHotel] = useState(false);
  const [noBus, setNoBus] = useState(false);
  const [busId, setBusId] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<"customer" | "representative">("customer");
  const [repName, setRepName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [actualReturnDay, setActualReturnDay] = useState<string>("");
  // Hotel stay extension (0 = no extension, max 5 nights). Only applies when a hotel is selected.
  const [extensionNights, setExtensionNights] = useState<number>(0);

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("packages" as never)
        .select("*")
        .eq("active", true)
        .order("display_order");
      return (data as unknown as Package[]) ?? [];
    },
  });

  const {
    data: pricing = [],
    isLoading: pricingLoading,
    error: pricingError,
  } = useQuery({
    queryKey: ["pricing_matrix"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pricing_matrix" as never)
        .select("*")
        .eq("active", true);

      if (error) {
        console.error("[pricing_matrix]", error);
        throw error;
      }

      return (data as unknown as PricingCell[]) ?? [];
    },
  });

  const { data: trips = [] } = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*").eq("active", true).order("display_order");
      if (error) throw error;
      return (data ?? []) as Trip[];
    },
  });

  const { data: buses = [] } = useQuery({
    queryKey: ["buses", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      // Buses are linked to trips via the trip_buses join table (with a legacy
      // buses.trip_id fallback for older data).
      const { data: joins } = await supabase.from("trip_buses").select("bus_id").eq("trip_id", tripId!);
      const joinIds = (joins ?? []).map((r) => r.bus_id).filter(Boolean) as string[];

      let query = supabase.from("buses").select("*").in("status", ["active"]);
      if (joinIds.length > 0) {
        query = query.or(`id.in.(${joinIds.join(",")}),trip_id.eq.${tripId}`);
      } else {
        query = query.eq("trip_id", tripId!);
      }
      const { data, error } = await query
        .order("is_active_booking", { ascending: false })
        .order("priority", { ascending: true })
        .order("bus_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as (Bus & {
        name?: string | null;
        status?: string;
        priority?: number;
        is_active_booking?: boolean;
      })[];
    },
  });

  // Load reserved-seat counts for all candidate buses to pick the first with room.
  const { data: busReserved = {} } = useQuery({
    queryKey: ["bus_reserved_all", tripId, editingCode],
    enabled: !!tripId && buses.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("bookings")
        .select("bus_id,seat_numbers,booking_code")
        .eq("trip_id", tripId!)
        .neq("status", "cancelled");
      if (editingCode) q = q.neq("booking_code", editingCode);
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const b of (data ?? []) as { bus_id: string; seat_numbers: string[] }[]) {
        if (!b.bus_id) continue;
        (map[b.bus_id] ??= []).push(...(b.seat_numbers ?? []));
      }
      return map;
    },
  });

  // User-selected bus (from Bus step). No auto-fallback: until the user picks a
  // bus explicitly, there is no active bus and therefore no bus price/details.
  const activeBus = useMemo(() => {
    if (noBus) return null;
    if (!busId) return null;
    return buses.find((b) => b.id === busId) ?? null;
  }, [buses, busId, noBus]);

  // Fetch the assigned bus_layouts row for the active bus (if any).
  const activeLayoutId = (activeBus as { layout_id?: string | null } | null)?.layout_id ?? null;
  const { data: activeLayout = null } = useQuery({
    queryKey: ["bus_layout", activeLayoutId],
    enabled: !!activeLayoutId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bus_layouts")
        .select("layout_json,seat_count")
        .eq("id", activeLayoutId!)
        .maybeSingle();
      return (data as { layout_json: LayoutJson; seat_count: number } | null) ?? null;
    },
  });

  const bookedSeats = activeBus ? (busReserved[activeBus.id] ?? []) : [];
  const remainingSeats = activeBus
    ? (activeBus.capacity ?? 49) - (activeBus.blocked_seats ?? ["A2"]).length - bookedSeats.length
    : 0;

  // Room type follows booking type + passenger count automatically:
  // - individual bookings always price against the shared 5-person room column.
  // - family bookings use the column that matches the passenger count (1-5).
  useEffect(() => {
    if (bookingType === "individual") {
      setRoomType("5");
    } else if (bookingType === "family") {
      const r = String(Math.min(Math.max(passengerCount, 1), 5)) as RoomType;
      setRoomType(r);
    }
  }, [bookingType, passengerCount]);
  useEffect(() => {
    if (seats.length > passengerCount) setSeats(seats.slice(0, passengerCount));
  }, [passengerCount]);

  // Keep the gender split consistent with the total headcount.
  useEffect(() => {
    if (maleCount + femaleCount !== passengerCount) {
      const m = Math.min(maleCount, passengerCount);
      setMaleCount(m);
      setFemaleCount(passengerCount - m);
    }
  }, [passengerCount]);
  useEffect(() => {
    if (customer.same_whatsapp) setCustomer((c) => ({ ...c, whatsapp_phone: c.contact_phone }));
  }, [customer.same_whatsapp, customer.contact_phone]);

  // (Removed) Previously auto-selected first package when noHotel — hotel price is now 0 for "no hotel".

  // Auto-populate customer fields from signed-in user's profile
  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,mobile_phone,whatsapp_phone,national_id,national_id_image_url,nationality,account_type")
        .eq("id", user.id)
        .maybeSingle();
      if (!prof) return;
      const acct = (
        (prof as { account_type?: string }).account_type === "representative" ? "representative" : "customer"
      ) as "customer" | "representative";
      setAccountType(acct);
      if (acct === "representative") setRepName((prof.full_name ?? "").trim());
      setCustomer((c) => ({
        ...c,
        customer_name: c.customer_name || (prof.full_name ?? ""),
        id_number: c.id_number || (prof.national_id ?? ""),
        contact_phone: c.contact_phone || (prof.mobile_phone ?? ""),
        whatsapp_phone: c.whatsapp_phone || (prof.whatsapp_phone ?? prof.mobile_phone ?? ""),
        nationality: c.nationality || ((prof as { nationality?: string | null }).nationality ?? ""),
      }));
      const idPath = (prof as { national_id_image_url?: string | null }).national_id_image_url ?? null;
      if (idPath) {
        setProfileIdImagePath(idPath);
        const { data: signed } = await supabase.storage.from("id-uploads").createSignedUrl(idPath, 3600);
        if (signed?.signedUrl) setProfileIdImageSignedUrl(signed.signedUrl);
      }
    })();
  }, []);

  // Apply pending coupon from the wheel, a coupon link (/booking?coupon=CODE),
  // or the coupon already bound to this visitor's IP (survives reloads/revisits).
  const [autoCoupon, setAutoCoupon] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const fromUrl = new URLSearchParams(window.location.search).get("coupon");
      const pending = localStorage.getItem("pending_coupon");
      const code = (fromUrl || pending || "").trim().toUpperCase();
      const ip = await getClientIp();

      if (code) {
        setCouponInput(code);
        localStorage.removeItem("pending_coupon");
        setAutoCoupon(code);
        if (ip) {
          const { data: userRes } = await supabase.auth.getUser();
          await supabase.rpc("bind_coupon_to_ip" as never, {
            _code: code,
            _ip: ip,
            _source: fromUrl ? "link" : "wheel",
            _device_id: getDeviceId(),
            _user_id: userRes.user?.id ?? null,
          } as never);
        }
        return;
      }

      // No explicit code: restore the coupon bound to this IP, if any.
      if (!ip) return;
      const { data } = await supabase.rpc("get_coupon_for_ip" as never, { _ip: ip } as never);
      const row = (data as unknown as Array<{ code: string }> | null)?.[0];
      if (row?.code) {
        setCouponInput(row.code);
        setAutoCoupon(row.code);
      }
    })();
  }, []);


  // Prefill from an existing booking when the user clicks "تعديل الحجز" on the ticket page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const editCode = localStorage.getItem("edit_booking_code");
    if (!editCode) return;
    localStorage.removeItem("edit_booking_code");
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select(
          "booking_type,passenger_count,room_type,package_id,trip_id,seat_numbers,customer_name,id_number,contact_phone,whatsapp_phone,coupon_code,extension_nights",
        )
        .eq("booking_code", editCode)
        .maybeSingle();
      if (!data) return;
      setBookingType(data.booking_type as BookingType);
      setPassengerCount(data.passenger_count);
      setRoomType((data.room_type ?? "5") as RoomType);
      setPackageId(data.package_id ?? null);
      setExtensionNights(Number(data.extension_nights ?? 0));
      setTripId(data.trip_id ?? null);
      setSeats(data.seat_numbers ?? []);
      setCustomer((c) => ({
        ...c,
        customer_name: data.customer_name ?? "",
        id_number: data.id_number ?? "",
        contact_phone: data.contact_phone ?? "",
        whatsapp_phone: data.whatsapp_phone ?? "",
        same_whatsapp: (data.contact_phone ?? "") === (data.whatsapp_phone ?? ""),
      }));
      if (data.coupon_code) setCouponInput(data.coupon_code);
      setEditingCode(editCode);
      toast.info("تم تحميل بيانات الحجز — سيتم تحديث نفس الحجز عند التأكيد");
    })();
  }, []);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const selectedTripRaw = trips.find((t) => t.id === tripId) ?? null;
  const selectedTrip = selectedTripRaw
    ? {
        ...selectedTripRaw,
        return_options: (selectedTripRaw.return_options ?? [])
          .flatMap((s: string) => String(s).split(/[,،]/))
          .map((s: string) => s.trim())
          .filter(Boolean),
      }
    : null;
  const transportOnly = noHotel;
  const STEPS: readonly string[] = noBus ? BASE_STEPS.filter((s) => s !== "المقاعد") : BASE_STEPS;
  const stepName = STEPS[step] ?? STEPS[STEPS.length - 1];

  // Clamp step index when steps array shrinks/grows (e.g., user picks transport pkg mid-flow).
  useEffect(() => {
    if (step > STEPS.length - 1) setStep(STEPS.length - 1);
  }, [STEPS.length, step]);

  // Pricing = passengers × (bus per-person + hotel per-person).
  // Bus per-person = activeBus.price_addition (0 when noBus or no bus selected yet).
  // Hotel per-person = getPackagePrice(pkg, room, count, pricing) (0 when noHotel).
  const busPerPerson = !noBus && activeBus?.price_addition ? Number(activeBus.price_addition) : 0;
  const hotelPerPerson = useMemo(
    () => (noHotel || !selectedPackage ? 0 : getPackagePrice(selectedPackage, roomType, passengerCount, pricing)),
    [noHotel, selectedPackage, roomType, passengerCount, pricing],
  );
  const pricePerPerson = hotelPerPerson + busPerPerson;

  const subtotal = pricePerPerson * passengerCount;
  const discount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.prize_type === "percent") return Math.round(subtotal * (appliedCoupon.prize_value / 100));
    return Math.min(appliedCoupon.prize_value, subtotal);
  }, [appliedCoupon, subtotal]);
  // Hotel extension is an independent add-on: nights × the selected hotel's per-night extension price.
  // It never applies without a hotel and never affects the base/coupon math.
  const effectiveExtensionNights = noHotel || !selectedPackage ? 0 : extensionNights;
  const extensionPricePerNight =
    noHotel || !selectedPackage ? 0 : Number((selectedPackage as { extension_price?: number }).extension_price ?? 0);
  const extensionTotal = extensionPricePerNight * effectiveExtensionNights;
  const total = Math.max(0, subtotal - discount) + extensionTotal;

  async function applyCoupon(codeArg?: string) {
    const code = (codeArg ?? couponInput).trim().toUpperCase();
    if (!code) return;

    const { data } = await supabase.rpc("validate_coupon" as never, { _code: code } as never);
    const rows =
      (data as unknown as Array<{
        code: string;
        prize_type: "percent" | "fixed";
        prize_value: number;
        used: boolean;
        expiry_date: string;
        label?: string | null;
        active?: boolean;
        max_uses?: number | null;
        usage_count?: number;
      }> | null) ?? [];
    const c = rows[0] ?? null;
    if (!c) {
      toast.error("الكود غير موجود");
      setAppliedCoupon(null);
      return;
    }
    if (c.active === false) {
      toast.error("الكود معطّل");
      setAppliedCoupon(null);
      return;
    }
    if (new Date(c.expiry_date) < new Date()) {
      toast.error("الكود منتهي الصلاحية");
      setAppliedCoupon(null);
      return;
    }
    // Multi-use enforcement: if max_uses is set, allow while usage_count < max_uses;
    // otherwise fall back to single-use `used` flag.
    if (c.max_uses != null) {
      if ((c.usage_count ?? 0) >= c.max_uses) {
        toast.error("تم استنفاد استخدامات الكود");
        setAppliedCoupon(null);
        return;
      }
    } else if (c.used) {
      toast.error("الكود مستخدم مسبقاً");
      setAppliedCoupon(null);
      return;
    }
    setAppliedCoupon({ code: c.code, prize_type: c.prize_type, prize_value: Number(c.prize_value), label: c.label });
    toast.success("تم تطبيق كود الخصم");
  }

  // Auto-validate a coupon that arrived through a QR link and tell the customer what happened.
  useEffect(() => {
    if (!autoCoupon) return;
    setAutoCoupon(null);
    void applyCoupon(autoCoupon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCoupon]);


  function canProceed(): boolean {
    return validationMessage() === null;
  }
  void canProceed;


  /** Arabic reason the current step is incomplete, or null when the user may continue. */
  function validationMessage(): string | null {
    switch (stepName) {
      case "نوع الحجز":
        return bookingType ? null : "يجب اختيار نوع الحجز (أفراد أو عوائل) للمتابعة";
      case "عدد الأفراد":
        if (passengerCount <= 0) return "يجب تحديد عدد الأفراد";
        if (maleCount + femaleCount !== passengerCount)
          return `مجموع الذكور والإناث (${maleCount + femaleCount}) يجب أن يساوي عدد الأفراد (${passengerCount})`;
        return null;
      case "الرحلة والحافلة": {
        if (noBus) return null;
        if (!tripId) return "يجب اختيار الرحلة أولاً";
        if (!busId) return "يجب اختيار الحافلة للمتابعة";
        const ro = selectedTrip?.return_options ?? [];
        if (ro.length > 1 && !actualReturnDay) return "يجب اختيار موعد العودة";
        return null;
      }
      case "المقاعد":
        return seats.length === passengerCount
          ? null
          : `يجب اختيار ${passengerCount} مقعد (تم اختيار ${seats.length})`;
      case "الفندق":
        return noHotel || packageId ? null : "يجب اختيار الفندق أو تحديد «بدون فندق»";
      case "البيانات": {
        if (customer.customer_name.trim().length <= 1) return "يجب إدخال اسم العميل بشكل صحيح";
        if (!/^\+?\d{9,15}$/.test(customer.contact_phone.replace(/\s/g, ""))) return "يجب إدخال رقم جوال صحيح للتواصل";
        if (!/^\+?\d{9,15}$/.test(customer.whatsapp_phone.replace(/\s/g, ""))) return "يجب إدخال رقم واتساب صحيح";
        if (!idFile && !editingCode && !profileIdImagePath) return "يجب إرفاق صورة الهوية";
        return null;
      }
      default:
        return null;
    }
  }


  async function uploadIdImage(): Promise<string | null> {
    if (!idFile) return null;
    const ext = idFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("id-uploads").upload(path, idFile, {
      contentType: idFile.type,
      cacheControl: "3600",
    });
    if (error) throw error;
    return path;
  }

  function generateBookingCode(): string {
    const year = new Date().getFullYear();
    const n = Math.floor(Math.random() * 900000 + 100000);
    return `ZT-${year}-${n}`;
  }

  async function submitBooking() {
    if (!noHotel && !selectedPackage) return;
    if (!noBus && (!activeBus || !selectedTrip)) return;
    // Booking availability gate (create + edit). Server enforces it too.
    const blocked = await bookingBlockedMessage();
    if (blocked) return toast.error(blocked);
    setSubmitting(true);
    try {

      const uploadedPath = await uploadIdImage();
      // Fall back to the user's saved profile ID image when no new file was uploaded.
      const id_image_url = uploadedPath ?? profileIdImagePath ?? null;
      const code = editingCode ?? generateBookingCode();

      const source = accountType === "representative" && repName ? repName : "Website";

      const payload = {
        booking_code: code,
        booking_type: bookingType!,
        passenger_count: passengerCount,
        male_count: maleCount,
        female_count: femaleCount,
        seat_genders: seatGenders,
        room_type: roomType,
        package_id: noHotel ? null : selectedPackage!.id,
        trip_id: tripId,
        bus_id: noBus ? null : activeBus!.id,
        seat_numbers: noBus ? [] : seats,
        no_hotel: noHotel,
        no_bus: noBus,
        customer_name: customer.customer_name.trim(),
        id_number: customer.id_number.trim(),
        nationality: customer.nationality.trim() || null,
        booking_source: source,
        contact_phone: customer.contact_phone.trim(),
        whatsapp_phone: customer.whatsapp_phone.trim(),
        // Only overwrite id_image_url when a new file was uploaded (edit mode may keep the old one).
        ...(id_image_url ? { id_image_url } : {}),
        price_per_person: pricePerPerson,
        total_price: total,
        coupon_code: appliedCoupon?.code ?? null,
        discount_amount: discount,
        status: "confirmed",
        notes: notes.trim() || null,
        actual_return_day: (actualReturnDay || selectedTrip?.return_day || null) as string | null,
        extension_nights: effectiveExtensionNights,
      };

      if (editingCode) {
        // UPDATE existing booking — no duplicates. Authenticated users only reach this path.
        const { error } = await supabase
          .from("bookings")
          .update(payload as never)
          .eq("booking_code", editingCode);
        if (error) throw error;
      } else {
        // Attach created_by so authenticated users can see the booking in "My Bookings".
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const insertPayload = { ...payload, created_by: user?.id ?? null };
        // Do NOT chain .select() — guests have no SELECT policy on bookings,
        // which would surface as a false RLS-violation error on insert.
        const { error } = await supabase.from("bookings").insert(insertPayload as never);
        if (error) throw error;
      }

      // Increment coupon usage via secure RPC (validates + increments atomically).
      // RPC resolves booking id from booking_code server-side (SECURITY DEFINER),
      // so guests never need SELECT on bookings.
      if (appliedCoupon && !editingCode) {
        await supabase.rpc(
          "redeem_coupon" as never,
          {
            _code: appliedCoupon.code,
            _booking_code: code,
          } as never,
        );
      }

      const cache = {
        booking_code: code,
        booking_type: bookingType,
        passenger_count: passengerCount,
        room_type: roomType,
        customer_name: customer.customer_name.trim(),
        id_number: customer.id_number.trim(),
        contact_phone: customer.contact_phone.trim(),
        whatsapp_phone: customer.whatsapp_phone.trim(),
        seat_numbers: seats,
        price_per_person: pricePerPerson,
        total_price: total,
        discount_amount: discount,
        coupon_code: appliedCoupon?.code ?? null,
        id_image_url,
        created_at: new Date().toISOString(),
        packages: selectedPackage ? { name: selectedPackage.name } : null,
        trips: selectedTrip
          ? { name: selectedTrip.name, departure_day: selectedTrip.departure_day, return_day: selectedTrip.return_day }
          : null,
        buses: activeBus ? { bus_number: activeBus.bus_number } : null,
      };
      try {
        localStorage.setItem(`booking:${code}`, JSON.stringify(cache));
      } catch {
        /* ignore */
      }
      toast.success(editingCode ? "تم تحديث الحجز بنجاح 🌹" : "تم تأكيد الحجز بنجاح 🌹");
      setEditingCode(null);
      navigate({ to: "/ticket/$code", params: { code } });
    } catch (e: unknown) {
      console.error("[booking submit]", e);
      const anyE = e as { message?: string; error?: string; details?: string; hint?: string } | null;
      const msg =
        anyE?.message || anyE?.error || anyE?.details || anyE?.hint || (typeof e === "string" ? e : "حدث خطأ");
      toast.error("تعذر إتمام الحجز: " + msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <BookingFocusLayout>
      <section className="relative">
        <div className="absolute inset-0 -z-10" style={{ background: "var(--gradient-navy)" }} />
        <div className="container-luxe py-4 md:py-10 text-white">
          <h1 className="text-lg md:text-4xl font-extrabold">احجز رحلتك للعمرة</h1>
          <p className="mt-1 md:mt-2 text-white/75 max-w-2xl text-xs md:text-base hidden sm:block">
            أكمل الخطوات التالية لحجز رحلتك بكل سهولة وراحة.
          </p>
        </div>
      </section>

      <section className="container-luxe -mt-4 md:-mt-8 relative z-10 pb-36 md:pb-40">

        <Stepper steps={STEPS} step={step} />

        <div className="surface-card p-3 md:p-8 mt-3 md:mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepName}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {stepName === "نوع الحجز" && <StepBookingType value={bookingType} onChange={setBookingType} />}
              {stepName === "عدد الأفراد" && (
                <StepCount
                  value={passengerCount}
                  onChange={setPassengerCount}
                  maleCount={maleCount}
                  femaleCount={femaleCount}
                  setMaleCount={setMaleCount}
                  setFemaleCount={setFemaleCount}
                />
              )}
              {stepName === "الرحلة والحافلة" && (
                <StepTripBus
                  trips={trips}
                  tripId={tripId}
                  onSelectTrip={(id) => {
                    setNoBus(false);
                    setTripId(id);
                    setBusId(null);
                    setSeats([]);
                    setActualReturnDay("");
                  }}
                  buses={buses}
                  busReserved={busReserved}
                  busId={busId}
                  onSelectBus={(id) => {
                    setNoBus(false);
                    setBusId(id);
                  }}
                  noBus={noBus}
                  onSelectNoBus={() => {
                    setNoBus(true);
                    setBusId(null);
                    setTripId(null);
                    setSeats([]);
                    setActualReturnDay("");
                  }}
                  returnOptions={selectedTrip?.return_options ?? []}
                  actualReturnDay={actualReturnDay}
                  setActualReturnDay={setActualReturnDay}
                />
              )}
              {stepName === "الفندق" && (
                <StepPackage
                  packages={packages}
                  pricing={pricing}
                  value={noHotel ? null : packageId}
                  noHotel={noHotel}
                  onChange={(id) => {
                    setNoHotel(false);
                    setPackageId(id);
                  }}
                  onSelectNoHotel={() => {
                    setNoHotel(true);
                    setPackageId(null);
                    setExtensionNights(0);
                  }}
                  extensionNights={effectiveExtensionNights}
                  onExtensionChange={setExtensionNights}
                  extensionPricePerNight={extensionPricePerNight}
                  passengerCount={passengerCount}
                  roomType={roomType}
                />
              )}
              {stepName === "المقاعد" && (
                <StepSeats
                  count={passengerCount}
                  seats={seats}
                  reserved={bookedSeats}
                  genders={seatGenders}
                  activeGender={activeGender}
                  onActiveGenderChange={setActiveGender}
                  maleCount={maleCount}
                  femaleCount={femaleCount}
                  onChange={(next) => {
                    const added = next.filter((s) => !seats.includes(s));
                    const removed = seats.filter((s) => !next.includes(s));
                    const g = { ...seatGenders };
                    for (const r of removed) delete g[r];
                    for (const a of added) {
                      const usedMale = Object.values(g).filter((v) => v === "male").length;
                      const usedFemale = Object.values(g).filter((v) => v === "female").length;
                      let pick: "male" | "female" | null = null;
                      if (activeGender === "male" && usedMale < maleCount) pick = "male";
                      else if (activeGender === "female" && usedFemale < femaleCount) pick = "female";
                      else if (usedMale < maleCount) pick = "male";
                      else if (usedFemale < femaleCount) pick = "female";
                      if (!pick) {
                        toast.warning("اكتمل عدد المقاعد لهذا الجنس. عدّل التوزيع في خطوة عدد الأفراد.");
                        return;
                      }
                      g[a] = pick;
                    }
                    setSeatGenders(g);
                    setSeats(next);
                  }}
                  bus={activeBus}
                  layout={activeLayout?.layout_json ?? null}
                  remainingSeats={remainingSeats}
                  mode={seatMode}
                  onModeChange={(m) => {
                    setSeatMode(m);
                    if (m === "random") {
                      const auto = activeLayout?.layout_json
                        ? pickRandomLayoutSeats(passengerCount, activeLayout.layout_json, bookedSeats)
                        : pickRandomSeats(
                            passengerCount,
                            bookedSeats,
                            activeBus?.blocked_seats ?? ["A2"],
                            ((activeBus as { layout?: string } | null)?.layout as "A" | "B") ?? "A",
                          );
                      const g: Record<string, "male" | "female"> = {};
                      auto.forEach((sid, i) => {
                        g[sid] = i < maleCount ? "male" : "female";
                      });
                      setSeatGenders(g);
                      setSeats(auto);
                    }
                  }}
                />
              )}
              {stepName === "البيانات" && (
                <StepCustomer
                  customer={customer}
                  setCustomer={setCustomer}
                  idFile={idFile}
                  setIdFile={setIdFile}
                  accountType={accountType}
                  repName={repName}
                  setRepName={setRepName}
                  existingIdImageUrl={profileIdImageSignedUrl}
                  notes={notes}
                  setNotes={setNotes}
                  returnOptions={selectedTrip?.return_options ?? []}
                  defaultReturnDay={selectedTrip?.return_day ?? ""}
                  actualReturnDay={actualReturnDay}
                  setActualReturnDay={setActualReturnDay}
                />
              )}

              {stepName === "التأكيد" && (
                <StepConfirm
                  bookingType={bookingType}
                  passengerCount={passengerCount}
                  maleCount={maleCount}
                  femaleCount={femaleCount}
                  roomType={roomType}
                  transportOnly={transportOnly}
                  noBus={noBus}
                  noHotel={noHotel}
                  bookingSource={accountType === "representative" && repName ? repName : "Website"}
                  pkg={selectedPackage}
                  trip={selectedTrip}
                  seats={seats}
                  customer={customer}
                  pricePerPerson={pricePerPerson}
                  subtotal={subtotal}
                  extensionNights={effectiveExtensionNights}
                  extensionTotal={extensionTotal}
                  discount={discount}
                  total={total}
                  busNumber={activeBus?.bus_number ?? 1}
                  couponInput={couponInput}
                  setCouponInput={setCouponInput}
                  appliedCoupon={appliedCoupon}
                  applyCoupon={() => void applyCoupon()}
                  clearCoupon={() => {
                    setAppliedCoupon(null);
                    setCouponInput("");
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>

        </div>
      </section>

      <PriceBar
        packageName={selectedPackage?.name}
        passengerCount={passengerCount}
        roomType={roomType}
        tripName={selectedTrip?.name}
        pricePerPerson={pricePerPerson}
        subtotal={subtotal}
        discount={discount}
        total={total}
      >
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-full md:h-11 md:px-6"
          >
            <ChevronRight className="h-4 w-4 ml-1" />
            السابق
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              size="sm"
              className="btn-primary-glow hover:btn-primary-glow-hover rounded-full md:h-11 md:px-6"
              onClick={() => {
                const msg = validationMessage();
                if (msg) {
                  toast.error(msg);
                  return;
                }
                setStep((s) => Math.min(STEPS.length - 1, s + 1));
              }}
            >
              التالي
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="btn-primary-glow hover:btn-primary-glow-hover rounded-full md:h-11 md:px-6"
              disabled={submitting}
              onClick={submitBooking}
            >
              {submitting && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
              تأكيد الحجز
              <Check className="h-4 w-4 mr-2" />
            </Button>
          )}
        </div>
      </PriceBar>

    </BookingFocusLayout>
  );
}

function Stepper({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <div className="surface-card p-4 md:p-5 overflow-x-auto">
      <ol className="flex items-center gap-2 min-w-max">
        {steps.map((label, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <li key={label} className="flex items-center gap-2">
              <div
                className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${done ? "bg-[color:var(--color-navy)] text-white" : active ? "btn-primary-glow text-white" : "bg-muted text-muted-foreground"}`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-xs md:text-sm font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </span>
              {i < steps.length - 1 && <div className="h-[2px] w-8 bg-border" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepHeader({ title, desc }: { title: string; desc?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-extrabold text-[color:var(--color-navy)]">{title}</h2>
      {desc && <p className="mt-2 text-muted-foreground">{desc}</p>}
    </div>
  );
}

function StepBookingType({ value, onChange }: { value: BookingType | null; onChange: (v: BookingType) => void }) {
  const options: { value: BookingType; label: string; desc: string; icon: typeof User }[] = [
    { value: "individual", label: " أفراد(عزاب)", desc: "حجز بمقعد فردي في غرفة خماسية مشتركة", icon: User },
    { value: "family", label: " عوائل أو غرفة خاصة", desc: "حجز عائلي أو حجز غرفة خاصة ", icon: Users },
  ];
  return (
    <div>
      <StepHeader title="نوع الحجز" desc="اختر طريقة الحجز التي تناسبك" />
      <div className="grid sm:grid-cols-2 gap-4">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={`text-right rounded-3xl border-2 p-6 transition-all bg-white ${active ? "border-primary shadow-[var(--shadow-red)] scale-[1.02]" : "border-border hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"}`}
            >
              <div
                className={`h-14 w-14 rounded-2xl flex items-center justify-center ${active ? "btn-primary-glow text-white" : "bg-muted text-[color:var(--color-navy)]"}`}
              >
                <o.icon className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-xl font-extrabold">{o.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{o.desc}</p>
              {active && (
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">
                  <CheckCircle2 className="h-4 w-4" /> تم الاختيار
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepCount({
  value,
  onChange,
  maleCount,
  femaleCount,
  setMaleCount,
  setFemaleCount,
}: {
  value: number;
  onChange: (n: number) => void;
  maleCount: number;
  femaleCount: number;
  setMaleCount: (n: number) => void;
  setFemaleCount: (n: number) => void;
}) {
  const sum = maleCount + femaleCount;
  const ok = sum === value;
  return (
    <div>
      <StepHeader title="عدد الأفراد" desc="يرجى تحديد عدد الأفراد وتوزيعهم" />
      <div className="mx-auto max-w-sm surface-card p-6 flex items-center justify-between">
        <Button
          size="icon"
          variant="outline"
          className="h-12 w-12 rounded-full"
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="text-5xl font-extrabold text-[color:var(--color-navy)]">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">عدد المقاعد المطلوبة</p>
        </div>
        <Button
          size="icon"
          className="h-12 w-12 rounded-full btn-primary-glow"
          onClick={() => onChange(Math.min(48, value + 1))}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <div className="mx-auto max-w-sm mt-4 grid grid-cols-2 gap-3">
        <div className="surface-card p-4 text-center">
          <p className="text-xs font-bold text-sky-700 flex items-center justify-center gap-1">
            <Mars className="h-4 w-4" /> عدد الذكور
          </p>
          <div className="mt-2 flex items-center justify-between">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              onClick={() => setMaleCount(Math.max(0, maleCount - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-2xl font-extrabold">{maleCount}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              onClick={() => setMaleCount(Math.min(value, maleCount + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="surface-card p-4 text-center">
          <p className="text-xs font-bold text-pink-600 flex items-center justify-center gap-1">
            <Venus className="h-4 w-4" /> عدد الإناث
          </p>
          <div className="mt-2 flex items-center justify-between">
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              onClick={() => setFemaleCount(Math.max(0, femaleCount - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="text-2xl font-extrabold">{femaleCount}</span>
            <Button
              size="icon"
              variant="outline"
              className="h-9 w-9 rounded-full"
              onClick={() => setFemaleCount(Math.min(value, femaleCount + 1))}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <p className={`mt-3 text-center text-xs font-bold ${ok ? "text-success" : "text-destructive"}`}>
        {ok ? "المجموع مطابق للعدد الإجمالي" : `مجموع الذكور والإناث (${sum}) يجب أن يساوي العدد الإجمالي (${value})`}
      </p>
    </div>
  );
}

function StepPackage({
  packages,
  pricing,
  value,
  onChange,
  onSelectNoHotel,
  noHotel,
  passengerCount,
  roomType,
  extensionNights,
  onExtensionChange,
  extensionPricePerNight,
}: {
  packages: Package[];
  pricing: PricingCell[];
  value: string | null;
  onChange: (id: string) => void;
  onSelectNoHotel: () => void;
  noHotel: boolean;
  passengerCount: number;
  roomType: RoomType;
  extensionNights: number;
  onExtensionChange: (n: number) => void;
  extensionPricePerNight: number;
}) {
  const [openPkg, setOpenPkg] = useState<Package | null>(null);
  return (
    <div>
      <StepHeader title="اختر الفندق" desc="اختر الفندق الأنسب لرحلتك" />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <button
          type="button"
          onClick={onSelectNoHotel}
          className={`text-right rounded-[20px] overflow-hidden bg-white border-2 transition-all cursor-pointer p-6 flex flex-col items-center justify-center gap-2 min-h-[280px] ${noHotel ? "border-primary shadow-[var(--shadow-red)]" : "border-dashed border-border hover:border-primary/40"}`}
        >
          <div
            className={`h-14 w-14 rounded-2xl flex items-center justify-center ${noHotel ? "btn-primary-glow text-white" : "bg-muted text-[color:var(--color-navy)]"}`}
          >
            <X className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-extrabold text-[color:var(--color-navy)]">بدون فندق</h3>
          <p className="text-sm text-muted-foreground text-center">مواصلات فقط — لن يتم حجز فندق</p>
          {noHotel && (
            <div className="inline-flex items-center gap-1 text-xs font-bold text-primary">
              <CheckCircle2 className="h-4 w-4" /> تم الاختيار
            </div>
          )}
        </button>
        {packages.map((p) => {
          const active = value === p.id;
          const price = getPackagePrice(p, roomType, passengerCount, pricing);
          return (
            <div
              key={p.id}
              className={`group rounded-[20px] overflow-hidden bg-white border-2 transition-all ${active ? "border-primary shadow-[var(--shadow-red)] scale-[1.01]" : "border-border hover:border-primary/40 hover:shadow-[var(--shadow-elegant)] cursor-pointer"}`}
            >
              <div
                onClick={() => onChange(p.id)}
                className="cursor-pointer"
              >
                <div className="relative h-40 overflow-hidden" style={{ background: "var(--gradient-navy)" }}>
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center text-white/60">
                      <PackageIcon className="h-14 w-14" />
                    </div>
                  )}
                  {typeof p.stars === "number" && p.stars > 0 ? (
                    <div className="absolute top-3 right-3 bg-white/95 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-0.5">
                      {Array.from({ length: p.stars }).map((_, i) => (
                        <Star key={i} className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      ))}
                    </div>
                  ) : (
                    p.tier &&
                    p.tier !== "basic" &&
                    p.tier !== "economy" && (
                      <div className="absolute top-3 right-3 bg-white/95 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1">
                        {p.tier.replace("stars", "")} <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      </div>
                    )
                  )}
                  {active && (
                    <div className="absolute top-3 left-3 h-9 w-9 rounded-full btn-primary-glow text-white flex items-center justify-center">
                      <Check className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="p-5 text-center">
                  <h3 className="text-lg font-extrabold text-[color:var(--color-navy)]">{p.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                  <p className="mt-3 text-primary font-extrabold text-xl">
                    {sar(price)} <span className="text-xs text-muted-foreground font-normal">للفرد</span>
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenPkg(p);
                    }}
                    className="mt-3 text-xs font-semibold text-[color:var(--color-navy)] underline-offset-2 hover:underline"
                  >
                    التفاصيل
                  </button>
                </div>
              </div>

              {/* Room extension — shown only for the selected hotel. */}
              {active && !noHotel && (
                <div className="px-5 pb-5 -mt-1">
                  <div className="surface-card p-4">
                    <Label className="font-semibold text-sm">عدد ليال التمديد</Label>
                    <select
                      value={String(extensionNights)}
                      onChange={(e) => onExtensionChange(Number(e.target.value))}
                      className="mt-2 h-11 w-full rounded-xl border-2 border-border bg-white px-3 text-sm font-semibold"
                    >
                      <option value="0">بدون تمديد</option>
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={String(n)}>
                          {n} {n === 1 ? "ليلة" : n === 2 ? "ليالي" : "ليال"}
                        </option>
                      ))}
                    </select>
                    {extensionNights > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        قيمة التمديد: <b className="text-primary">{sar(extensionPricePerNight * extensionNights)}</b> (
                        {sar(extensionPricePerNight)} × {extensionNights})
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Room extension now renders inside the selected hotel card. */}



      <Dialog open={!!openPkg} onOpenChange={(o) => !o && setOpenPkg(null)}>
        <DialogContent className="max-w-2xl">
          {openPkg && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{openPkg.name}</DialogTitle>
              </DialogHeader>
              {openPkg.image_url && (
                <img src={openPkg.image_url} alt={openPkg.name} className="rounded-xl w-full h-64 object-cover" />
              )}
              <p className="text-muted-foreground">{openPkg.description}</p>
              {openPkg.includes?.length > 0 && (
                <ul className="grid grid-cols-2 gap-2 text-sm">
                  {openPkg.includes.map((it, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" />
                      {it}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-lg font-bold text-primary">
                {sar(getPackagePrice(openPkg, roomType, passengerCount, pricing))} للفرد
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepRoom({ value, onChange, forced }: { value: RoomType; onChange: (v: RoomType) => void; forced: boolean }) {
  const rooms: RoomType[] = ["1", "2", "3", "4", "5"];
  return (
    <div>
      <StepHeader
        title="نوع الغرفة"
        desc={forced ? "حجز الأفراد يكون تلقائيًا في غرفة خماسية مشتركة" : "اختر نوع الغرفة المناسبة لعائلتك"}
      />
      {forced && (
        <div className="mb-4 rounded-2xl bg-accent/60 border border-[color:var(--color-gold)]/40 p-4 text-sm">
          🛈 حجز الأفراد يكون تلقائيًا في غرفة خماسية مشتركة.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {rooms.map((r) => {
          const active = value === r;
          return (
            <button
              key={r}
              type="button"
              disabled={forced && r !== "5"}
              onClick={() => onChange(r)}
              className={`rounded-2xl border-2 p-5 text-center bg-white transition-all ${active ? "border-primary shadow-[var(--shadow-red)]" : "border-border hover:border-primary/40"} ${forced && r !== "5" ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <p className="text-lg font-extrabold">{ROOM_LABEL[r]}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {r} {r === "1" ? "شخص" : "أشخاص"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepTripBus({
  trips,
  tripId,
  onSelectTrip,
  buses,
  busReserved,
  busId,
  onSelectBus,
  noBus,
  onSelectNoBus,
  returnOptions,
  actualReturnDay,
  setActualReturnDay,
}: {
  trips: Trip[];
  tripId: string | null;
  onSelectTrip: (id: string) => void;
  buses: (Bus & { name?: string | null })[];
  busReserved: Record<string, string[]>;
  busId: string | null;
  onSelectBus: (id: string) => void;
  noBus: boolean;
  onSelectNoBus: () => void;
  returnOptions: string[];
  actualReturnDay: string;
  setActualReturnDay: (v: string) => void;
}) {
  const hasMultipleReturns = returnOptions && returnOptions.length > 1;
  return (
    <div>
      <StepHeader title="اختر الرحلة والحافلة" desc="حدد موعد الرحلة، ثم اختر الحافلة المتاحة" />

      {/* No-transport shortcut — jumps straight to the Hotel step */}
      <button
        type="button"
        onClick={onSelectNoBus}
        className={`w-full text-right rounded-3xl border-2 p-5 mb-5 bg-white transition-all flex items-center gap-4 ${
          noBus ? "border-primary shadow-[var(--shadow-red)]" : "border-dashed border-border hover:border-primary/40"
        }`}
      >
        <div
          className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${
            noBus ? "btn-primary-glow text-white" : "bg-muted text-[color:var(--color-navy)]"
          }`}
        >
          <X className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-extrabold text-[color:var(--color-navy)]">بدون مواصلات</h3>
          <p className="text-sm text-muted-foreground">فندق فقط — الانتقال مباشرة إلى خطوة الفندق</p>
        </div>
        {noBus && <CheckCircle2 className="h-5 w-5 text-primary" />}
      </button>

      <div className="grid md:grid-cols-2 gap-4">
        {trips.map((t) => {
          const active = !noBus && tripId === t.id;
          const tripBuses = active ? buses : [];
          return (
            <div
              key={t.id}
              className={`rounded-3xl border-2 bg-white transition-all ${
                active ? "border-primary shadow-[var(--shadow-red)]" : "border-border hover:border-primary/40"
              }`}
            >
              <button type="button" onClick={() => onSelectTrip(t.id)} className="w-full text-right p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-primary uppercase tracking-wider">رحلة عمرة</p>
                    <h3 className="mt-1 text-lg font-extrabold text-[color:var(--color-navy)]">{t.name}</h3>
                    <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      الذهاب: {t.departure_day} • العودة: {t.return_day}
                    </div>
                  </div>
                  {active && (
                    <div className="h-9 w-9 rounded-full btn-primary-glow text-white flex items-center justify-center">
                      <Check className="h-5 w-5" />
                    </div>
                  )}
                </div>
              </button>

              {active && (
                <div className="border-t border-border p-4 space-y-2 bg-muted/30 rounded-b-3xl">
                  <p className="text-sm font-bold text-[color:var(--color-navy)] mb-1">
                    اختر حافلتك من الحافلات المتاحة
                  </p>
                  {tripBuses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">لا توجد حافلات متاحة لهذه الرحلة</p>
                  ) : (
                    tripBuses.map((b) => {
                      const cap = b.capacity ?? 49;
                      const blocked = (b.blocked_seats ?? ["A2"]).length;
                      const used = (busReserved[b.id] ?? []).length;
                      const available = Math.max(0, cap - blocked - used);
                      const full = available <= 0;
                      const selected = busId === b.id;
                      const busPrice = Number(b.price_addition ?? 0);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={full}
                          onClick={() => onSelectBus(b.id)}
                          className={`w-full text-right rounded-2xl border-2 p-3 flex items-center gap-3 transition-all bg-white ${
                            selected
                              ? "border-primary shadow-[var(--shadow-red)]"
                              : "border-border hover:border-primary/40"
                          } ${full ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          <div className="h-14 w-20 rounded-xl overflow-hidden bg-muted shrink-0">
                            {b.image_url ? (
                              <img src={b.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-2xl">🚌</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-sm text-[color:var(--color-navy)] truncate">
                              {b.name || `الحافلة رقم ${b.bus_number}`}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {b.bus_type ? `${b.bus_type} • ` : ""}السعة: {cap}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-xs">
                              <span className={`font-bold ${full ? "text-destructive" : "text-primary"}`}>
                                {full ? "مكتملة" : `${available} متاح`}
                              </span>
                              {busPrice > 0 && (
                                <span className="text-red-600 font-bold text-base">• {sar(busPrice)} للفرد</span>
                              )}
                            </div>
                          </div>
                          {selected && <Check className="h-5 w-5 text-primary shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tripId && hasMultipleReturns && !noBus && (
        <div className="mt-5 rounded-2xl border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-extrabold text-[color:var(--color-navy)] mb-2">اختر موعد العودة</p>
          <p className="text-xs text-muted-foreground mb-3">
            هذه الرحلة تحتوي على أكثر من موعد للعودة — يجب اختيار الموعد المناسب لك للمتابعة.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {returnOptions.map((d) => {
              const sel = actualReturnDay === d;
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() => setActualReturnDay(d)}
                  className={`rounded-xl border-2 p-3 text-right transition-all bg-white ${
                    sel ? "border-primary shadow-[var(--shadow-red)]" : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm">{d}</span>
                    {sel && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StepSeats({
  count,
  seats,
  reserved,
  onChange,
  bus,
  layout,
  remainingSeats,
  mode,
  onModeChange,
  genders,
  activeGender,
  onActiveGenderChange,
  maleCount,
  femaleCount,
}: {
  count: number;
  seats: string[];
  reserved: string[];
  onChange: (s: string[]) => void;
  genders: Record<string, "male" | "female">;
  activeGender: "male" | "female";
  onActiveGenderChange: (g: "male" | "female") => void;
  maleCount: number;
  femaleCount: number;
  bus: (Bus & { name?: string | null }) | null;
  layout: LayoutJson | null;
  remainingSeats: number;
  mode: "manual" | "random";
  onModeChange: (m: "manual" | "random") => void;
}) {
  const busLabel = bus?.name || `الحافلة رقم ${bus?.bus_number ?? 1}`;
  return (
    <div>
      <StepHeader title="اختر مقاعدك" desc={`اختر ${count} ${count === 1 ? "مقعد" : "مقاعد"} في ${busLabel}`} />
      <div className="mb-4 rounded-2xl bg-accent/50 border border-[color:var(--color-gold)]/40 p-3 text-sm text-center font-semibold">
        🚌 حافلتك: <span className="text-primary">{busLabel}</span> —{" "}
        <span className="text-primary">{remainingSeats}</span> مقعد متبقٍ
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-6">
        <button
          onClick={() => onModeChange("manual")}
          className={`rounded-2xl border-2 p-4 transition-all ${mode === "manual" ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <MousePointerClick className="h-6 w-6 mx-auto text-primary" />
          <p className="mt-2 font-bold text-sm">اختيار يدوي</p>
        </button>
        <button
          onClick={() => onModeChange("random")}
          className={`rounded-2xl border-2 p-4 transition-all ${mode === "random" ? "border-primary bg-primary/5" : "border-border"}`}
        >
          <Shuffle className="h-6 w-6 mx-auto text-primary" />
          <p className="mt-2 font-bold text-sm">اختيار عشوائي</p>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-4">
        <button
          onClick={() => onActiveGenderChange("male")}
          className={`rounded-2xl border-2 p-3 text-sm font-bold flex items-center justify-center gap-2 ${activeGender === "male" ? "border-sky-600 bg-sky-50 text-sky-700" : "border-border"}`}
        >
          <Mars className="h-4 w-4" /> ذكر ({Object.values(genders).filter((g) => g === "male").length}/{maleCount})
        </button>
        <button
          onClick={() => onActiveGenderChange("female")}
          className={`rounded-2xl border-2 p-3 text-sm font-bold flex items-center justify-center gap-2 ${activeGender === "female" ? "border-pink-500 bg-pink-50 text-pink-600" : "border-border"}`}
        >
          <Venus className="h-4 w-4" /> أنثى ({Object.values(genders).filter((g) => g === "female").length}/
          {femaleCount})
        </button>
      </div>

      <div className="rounded-2xl bg-accent/40 border border-border p-4 mb-6 flex items-center justify-between">
        <div className="font-semibold">
          المقاعد المختارة:{" "}
          <span className="text-primary">
            {seats.length} من {count}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {seats.map((s) => (
            <Badge
              key={s}
              variant="secondary"
              className={`font-bold ${genders[s] === "male" ? "bg-sky-600 text-white" : genders[s] === "female" ? "bg-pink-500 text-white" : ""}`}
            >
              {s}
            </Badge>
          ))}
        </div>
      </div>
      <div className="max-w-md mx-auto">
        {layout ? (
          <LayoutSeatMap
            layout={layout}
            selected={seats}
            reserved={reserved}
            maxSelectable={count}
            genders={genders}
            onChange={onChange}
          />
        ) : (
          <BusSeatMap
            selected={seats}
            reserved={reserved}
            maxSelectable={count}
            onChange={(next) => {
              if (next.length > seats.length && seats.length >= count) {
                toast.warning(
                  "لقد قمت باختيار جميع المقاعد المطلوبة. إذا أردت اختيار مقعد آخر، اضغط على أحد المقاعد التي قمت باختيارها لإلغاء اختياره أولًا، ثم اختر المقعد الجديد.",
                );
                return;
              }
              onChange(next);
            }}
            genders={genders}
            blocked={bus?.blocked_seats ?? ["A2"]}
            layout={((bus as { layout?: string } | null | undefined)?.layout as "A" | "B") ?? "A"}
          />
        )}
      </div>
    </div>
  );
}

type CustomerState = {
  customer_name: string;
  id_number: string;
  contact_phone: string;
  whatsapp_phone: string;
  nationality: string;
  same_whatsapp: boolean;
};
function StepCustomer({
  customer,
  setCustomer,
  idFile,
  setIdFile,
  accountType,
  repName,
  setRepName,
  existingIdImageUrl,
  notes,
  setNotes,
  returnOptions,
  defaultReturnDay,
  actualReturnDay,
  setActualReturnDay,
}: {
  customer: CustomerState;
  setCustomer: React.Dispatch<React.SetStateAction<CustomerState>>;
  idFile: File | null;
  setIdFile: (f: File | null) => void;
  accountType: "customer" | "representative";
  repName: string;
  setRepName: React.Dispatch<React.SetStateAction<string>>;
  existingIdImageUrl?: string | null;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;
  returnOptions: string[];
  defaultReturnDay: string;
  actualReturnDay: string;
  setActualReturnDay: React.Dispatch<React.SetStateAction<string>>;
}) {
  const hasMultipleReturns = returnOptions && returnOptions.length > 1;
  return (
    <div>
      <StepHeader title="بيانات الحجز" desc="أدخل بيانات صاحب الحجز" />
      <div className="grid md:grid-cols-2 gap-5 max-w-3xl">
        <div>
          <Label className="font-semibold">الاسم الكامل</Label>
          <Input
            className="mt-2 h-12 rounded-xl"
            value={customer.customer_name}
            onChange={(e) => setCustomer({ ...customer, customer_name: e.target.value })}
            placeholder="الاسم الثلاثي"
          />
        </div>
        <div>
          <Label className="font-semibold">رقم الهوية / الإقامة / الجواز</Label>
          <Input
            className="mt-2 h-12 rounded-xl"
            value={customer.id_number}
            onChange={(e) => setCustomer({ ...customer, id_number: e.target.value })}
            placeholder="1XXXXXXXXX"
          />
        </div>
        <div>
          <Label className="font-semibold">الجنسية</Label>
          <Input
            className="mt-2 h-12 rounded-xl"
            value={customer.nationality}
            onChange={(e) => setCustomer({ ...customer, nationality: e.target.value })}
            placeholder="السعودية"
          />
        </div>
        <div>
          <Label className="font-semibold">رقم جوال الاتصال</Label>
          <Input
            dir="ltr"
            className="mt-2 h-12 rounded-xl text-right"
            value={customer.contact_phone}
            onChange={(e) => setCustomer({ ...customer, contact_phone: e.target.value })}
            placeholder="05XXXXXXXX"
          />
        </div>
        <div>
          <Label className="font-semibold">رقم واتساب</Label>
          <Input
            dir="ltr"
            disabled={customer.same_whatsapp}
            className="mt-2 h-12 rounded-xl text-right disabled:opacity-60"
            value={customer.whatsapp_phone}
            onChange={(e) => setCustomer({ ...customer, whatsapp_phone: e.target.value })}
            placeholder="05XXXXXXXX"
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <Checkbox
              checked={customer.same_whatsapp}
              onCheckedChange={(v) => setCustomer({ ...customer, same_whatsapp: !!v })}
            />
            رقم الواتساب هو نفسه رقم التواصل
          </label>
        </div>
      </div>

      {accountType === "representative" && (
        <div className="mt-6 max-w-3xl">
          <Label className="font-semibold">مصدر الحجز (اسم المندوب)</Label>
          <Input
            className="mt-2 h-12 rounded-xl"
            value={repName}
            onChange={(e) => setRepName(e.target.value)}
            placeholder="اسم المندوب"
          />
          <p className="text-xs text-muted-foreground mt-1">يظهر هذا الاسم في تقارير الإدارة كمصدر للحجز.</p>
        </div>
      )}

      {hasMultipleReturns && (
        <div className="mt-6 max-w-3xl">
          <Label className="font-semibold">موعد العودة الفعلي</Label>
          <select
            value={actualReturnDay || defaultReturnDay}
            onChange={(e) => setActualReturnDay(e.target.value)}
            className="mt-2 h-12 w-full rounded-xl border px-3 text-sm bg-white"
          >
            {returnOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            تحتوي هذه الرحلة على أكثر من موعد للعودة، اختر الموعد المناسب لك.
          </p>
        </div>
      )}

      <div className="mt-6 max-w-3xl">
        <Label className="font-semibold">ملاحظات (اختياري)</Label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="أي طلبات أو ملاحظات خاصة بالحجز..."
          className="mt-2 w-full rounded-xl border p-3 text-sm bg-white resize-y min-h-[80px]"
        />
      </div>

      <div className="mt-6 max-w-3xl">
        <Label className="font-semibold">صورة الهوية</Label>
        {existingIdImageUrl && !idFile && (
          <div className="mt-2 rounded-2xl border-2 border-border p-3 flex items-center gap-3 bg-muted/30">
            <img
              src={existingIdImageUrl}
              alt="صورة الهوية من الملف الشخصي"
              className="h-16 w-24 object-cover rounded-lg border"
            />
            <div className="flex-1">
              <p className="text-sm font-semibold">تم استخدام صورة الهوية من ملفك الشخصي</p>
              <p className="text-xs text-muted-foreground">يمكنك رفع صورة أخرى لاستبدالها.</p>
            </div>
          </div>
        )}
        <IdUploader file={idFile} onChange={setIdFile} />
      </div>
    </div>
  );
}

function IdUploader({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      className={`mt-2 block rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onChange(f);
      }}
    >
      <input
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file ? (
        <div className="flex flex-col items-center gap-2">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <p className="font-semibold">{file.name}</p>
          <p className="text-xs text-muted-foreground">{Math.round(file.size / 1024)} KB</p>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onChange(null);
            }}
            className="text-xs font-semibold text-primary inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> إزالة
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Upload className="h-10 w-10" />
          <p className="font-semibold text-foreground">اسحب الملف هنا أو اضغط للاختيار</p>
          <p className="text-xs">JPG / PNG / PDF — حتى 10MB</p>
        </div>
      )}
    </label>
  );
}

function StepConfirm(props: {
  bookingType: BookingType | null;
  passengerCount: number;
  maleCount: number;
  femaleCount: number;
  roomType: RoomType;
  transportOnly: boolean;
  noBus: boolean;
  noHotel: boolean;
  pkg: Package | null;
  trip: Trip | null;
  seats: string[];
  customer: { customer_name: string; id_number: string; contact_phone: string; nationality: string };
  bookingSource: string;
  pricePerPerson: number;
  subtotal: number;
  extensionNights: number;
  extensionTotal: number;
  discount: number;
  total: number;
  busNumber: number;
  couponInput: string;
  setCouponInput: (v: string) => void;
  appliedCoupon: { code: string; prize_type: "percent" | "fixed"; prize_value: number; label?: string | null } | null;
  applyCoupon: () => void;
  clearCoupon: () => void;
}) {
  const rows: [string, string][] = [
    ["نوع الحجز", props.bookingType === "individual" ? "أفراد" : "عوائل"],
    ["عدد الأفراد", String(props.passengerCount)],
    ["الذكور / الإناث", `${props.maleCount} / ${props.femaleCount}`],
    ["الفندق", props.noHotel ? "بدون فندق" : (props.pkg?.name ?? "—")],
    ...(props.extensionNights > 0
      ? [["عدد ليال التمديد", `${props.extensionNights}`] as [string, string]]
      : []),
    ["الرحلة", props.trip?.name ?? "—"],
    ["الحافلة", props.noBus ? "بدون حافلة" : `رقم ${props.busNumber}`],
    ...(!props.noBus ? [["المقاعد", props.seats.join(", ")] as [string, string]] : []),
    ["الاسم", props.customer.customer_name],
    ["رقم الهوية", props.customer.id_number],
    ["الجنسية", props.customer.nationality || "—"],
    ["رقم التواصل", props.customer.contact_phone],
    ["مصدر الحجز", props.bookingSource],
  ];

  return (
    <div>
      <StepHeader title="مراجعة الحجز" desc="تأكد من البيانات قبل التأكيد" />
      <div className="grid md:grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k} className="surface-card p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{k}</span>
            <span className="font-bold text-left">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 surface-card p-5">
        <Label className="font-semibold flex items-center gap-2">
          <Ticket className="h-4 w-4 text-primary" /> كود الخصم
        </Label>
        <div className="mt-2 flex gap-2">
          <Input
            dir="ltr"
            className="h-12 rounded-xl text-right flex-1"
            placeholder="ZT-XXXXXXXX"
            value={props.couponInput}
            onChange={(e) => props.setCouponInput(e.target.value)}
            disabled={!!props.appliedCoupon}
          />
          {props.appliedCoupon ? (
            <Button variant="outline" className="rounded-xl h-12" onClick={props.clearCoupon}>
              إزالة
            </Button>
          ) : (
            <Button className="btn-primary-glow rounded-xl h-12" onClick={props.applyCoupon}>
              تطبيق
            </Button>
          )}
        </div>
        {props.appliedCoupon && (
          <p className="mt-2 text-sm text-success font-semibold">
            تم تطبيق:{" "}
            {props.appliedCoupon.prize_type === "percent"
              ? `${props.appliedCoupon.prize_value}%`
              : `${props.appliedCoupon.prize_value} ريال`}{" "}
            خصم
          </p>
        )}
      </div>

      <div className="mt-6 rounded-3xl p-6 text-white" style={{ background: "var(--gradient-navy)" }}>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-white/70">المجموع الفرعي</span>
            <span className="font-bold">{sar(props.subtotal)}</span>
          </div>
          {props.discount > 0 && (
            <div className="flex justify-between text-[color:var(--color-gold)]">
              <span>الخصم</span>
              <span className="font-bold">− {sar(props.discount)}</span>
            </div>
          )}
          {props.extensionTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-white/70">التمديد ({props.extensionNights} ليلة)</span>
              <span className="font-bold">{sar(props.extensionTotal)}</span>
            </div>
          )}
          <div className="h-px bg-white/20 my-2" />
          <div className="flex justify-between items-baseline">
            <span className="text-white/80">الإجمالي النهائي</span>
            <span className="text-3xl font-extrabold">{sar(props.total)}</span>
          </div>
          <p className="text-xs text-white/60 text-center">
            {sar(props.pricePerPerson)} × {props.passengerCount}
          </p>
        </div>
      </div>
    </div>
  );
}

function PriceBar(props: {
  packageName?: string;
  passengerCount: number;
  roomType: RoomType;
  tripName?: string;
  pricePerPerson: number;
  subtotal: number;
  discount: number;
  total: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 glass-bar border-t shadow-[0_-10px_30px_-10px_rgba(0,0,0,0.08)]">
      <div className="container-luxe py-2 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs md:text-sm">
          <PriceCell label="سعر الفرد" value={sar(props.pricePerPerson)} />
          <PriceCell label="عدد الأفراد" value={String(props.passengerCount)} />
          <PriceCell label="الغرفة" value={ROOM_LABEL[props.roomType]} />
          {props.packageName && <PriceCell label="الفندق" value={props.packageName} />}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">الإجمالي</p>
            {props.discount > 0 && <p className="text-xs text-muted-foreground line-through">{sar(props.subtotal)}</p>}
            <p className="text-lg md:text-2xl font-extrabold text-primary">{sar(props.total)}</p>
          </div>
        </div>
      </div>
      {props.children && (
        <div className="border-t bg-background/60">
          <div className="container-luxe py-2">{props.children}</div>
        </div>
      )}
    </div>
  );
}

function PriceCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

/**
 * Booking Focus Mode — a minimal shell for the booking wizard.
 * Hides navbar/footer/floating widgets. Keeps only the logo + hamburger menu.
 */
function BookingFocusLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b">
        <div className="container-luxe h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <Logo size={40} withText />
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <button
                aria-label="القائمة"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-muted hover:bg-muted/80 transition"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <nav className="mt-8 flex flex-col gap-1">
                {NAV_LINKS.map((l) => (
                  <Link key={l.to} to={l.to} className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">
                    {l.label}
                  </Link>
                ))}
                <Link to="/my-bookings" className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">
                  حجوزاتي
                </Link>
                <Link to="/profile" className="px-4 py-3 rounded-xl text-base font-semibold hover:bg-muted">
                  الملف الشخصي
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
