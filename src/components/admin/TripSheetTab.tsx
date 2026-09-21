import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Table2, Loader2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { returnDisplay } from "@/lib/return-display";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sar } from "@/lib/format";
import { useSheetLogo } from "@/components/admin/ExportSheetDialog";
import {
  buildSettlementWorkbook,
  printSettlementSheet,
  downloadBlob,
  type SettlementExport,
} from "@/lib/export/settlement-sheet";
import { toast } from "sonner";

import { ROOM_ROWS, ROOM_CAPACITY } from "@/lib/export/rooming";
import { computeBookingProfit } from "@/lib/profit";
import { BusMultiSelect } from "@/components/admin/BusMultiSelect";

/**
 * "الحسابات والتصفية" — accounting / settlement workspace.
 *
 * Fully independent from the official "كشف الرحلة" template used by
 * ExportSheetDialog inside the bookings tab: it has its own columns,
 * its own cost engine and its own exporter (settlement-sheet.ts).
 */

interface SheetBooking {
  id: string;
  booking_code: string;
  customer_name: string | null;
  id_number: string | null;
  contact_phone: string | null;
  nationality: string | null;
  booking_source: string | null;
  passenger_count: number;
  room_type: string | null;
  booking_type: string | null;
  total_price: number;
  status: string;
  deleted_at: string | null;
  notes: string | null;
  actual_return_day: string | null;
  extension_nights?: number | null;
  trip_mode?: string | null;
  trip_id: string | null;
  departure_date?: string | null;
  bus_id: string | null;
  package_id: string | null;
  rep_profile_id?: string | null;
  packages: { name: string } | null;
  trips: { name: string; departure_day: string | null; return_day: string | null } | null;
  buses: { id: string; name: string | null; bus_number: number; capacity: number; expenses: number | null } | null;
}

const ROOM_LABELS: Record<string, string> = {
  "1": "فردي",
  "2": "ثنائي",
  "3": "ثلاثي",
  "4": "رباعي",
  "5": "خماسي",
};

const NO_HOTEL = "بدون فندق";

type BusExpenses = {
  busCost: number;
  driverTip: number;
  taxi: number;
  supervisor: number;
  supervisorBed: number;
  emptyBeds: number;
  extra: number;
};

type RefState = {
  costs: Record<string, Record<string, number>>;
  nightPrices: Record<string, number>;
  ext: Record<string, { sale: number; cost: number }>;
  commissions: Record<string, number>;
  transfer: Record<string, number>;
  /** تكلفة مقعد حجوزات «عودة فقط» — قيمة يدوية مستقلة عن قسمة مصاريف الحافلة. */
  returnSeatCost: number;
};

const EMPTY_BUS_EXP: BusExpenses = {
  busCost: 0,
  driverTip: 0,
  taxi: 0,
  supervisor: 0,
  supervisorBed: 0,
  emptyBeds: 0,
  extra: 0,
};

const EMPTY_REF: RefState = {
  costs: {},
  nightPrices: {},
  ext: {},
  commissions: {},
  transfer: { "ذهاب فقط": 50, "ذهاب وعوده فقط": 80, "ذهاب وعوده برحلة اخرى": 90 },
  returnSeatCost: 0,
};


const n = (v: unknown) => Number(v) || 0;
/** تقريب لأقرب ربع (0.25 / 0.5 / 0.75) بدل أقرب رقم صحيح. */
const round = (v: number) => Math.round(v * 4) / 4;

/** تنسيق تاريخ الذهاب لكل صف — من تاريخ الحجز الفعلي، وإلا يوم الذهاب العام للرحلة. */
function departureCellText(b: SheetBooking): string {
  if (b.departure_date) {
    const d = new Date(`${b.departure_date}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "short" }).format(d);
    }
  }
  return b.trips?.departure_day ?? "—";
}

type SortDir = "asc" | "desc";
type SortKey =
  | "index"
  | "rep"
  | "customer"
  | "id"
  | "nationality"
  | "count"
  | "departure"
  | "returnDay"
  | "hotel"
  | "room"
  | "roomNumber"
  | "packageTotal"
  | "nights"
  | "extensionTotal"
  | "grandTotal"
  | "notes"
  | "seatCost"
  | "bedCost"
  | "costPerPerson"
  | "groupCost"
  | "extensionCost"
  | "extensionProfit"
  | "grossProfit"
  | "rate"
  | "repShare"
  | "companyShare";

export function TripSheetTab() {
  const [tripId, setTripId] = useState("");
  const [busIds, setBusIds] = useState<string[]>([]);
  const busId = busIds.length === 1 ? busIds[0]! : "";
  const setBusId = (id: string) => setBusIds(id ? [id] : []);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [roomNumbers, setRoomNumbers] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const { data: logoUrl } = useSheetLogo();

  function toggleSort(key: SortKey) {
    setSort((s) => {
      if (!s || s.key !== key) return { key, dir: "asc" };
      if (s.dir === "asc") return { key, dir: "desc" };
      return null; // third click clears sort → يرجع للترتيب الطبيعي
    });
  }

  const { data: trips = [] } = useQuery({
    queryKey: ["ts-trips"],
    queryFn: async () =>
      ((await supabase.from("trips").select("id,name").eq("active", true).order("display_order")).data ?? []) as Array<{
        id: string;
        name: string;
      }>,
  });

  const { data: buses = [], refetch: refetchBuses } = useQuery({
    queryKey: ["ts-buses"],
    queryFn: async () =>
      ((
        await supabase
          .from("buses")
          .select(
            "id,name,bus_number,capacity,assigned_date,expense_bus_cost,expense_driver_tip,expense_taxi,expense_supervisor,expense_supervisor_bed,expense_empty_beds,expense_extra,settled_at",
          )
          .order("bus_number")
      ).data ?? []) as unknown as Array<{
        id: string;
        name: string | null;
        bus_number: number;
        capacity: number;
        assigned_date: string | null;
        expense_bus_cost?: number | null;
        expense_driver_tip?: number | null;
        expense_taxi?: number | null;
        expense_supervisor?: number | null;
        expense_supervisor_bed?: number | null;
        expense_empty_beds?: number | null;
        expense_extra?: number | null;
        settled_at?: string | null;
      }>,
  });

  /** نفس قائمة الحافلات، لكن بعلامة "معتمدة/غير معتمدة" جنب الاسم — للعرض في الفلتر فقط. */
  const busesForSelect = useMemo(
    () =>
      buses.map((b) => ({
        ...b,
        name: `${b.name || `حافلة ${b.bus_number}`} — ${b.settled_at ? "معتمدة" : "غير معتمدة"}`,
      })),
    [buses],
  );

  const { data: hotelRows = [] } = useQuery({
    queryKey: ["ts-hotels"],
    queryFn: async () =>
      ((await supabase.from("packages").select("id,name,active,extension_price").order("display_order")).data ??
        []) as Array<{ id: string; name: string; active: boolean; extension_price: number | null }>,
  });

  /* ------- كل مناسبات الرحلات (تكلفة الأسرّة + اعتمادها) -------- */
  const { data: occurrences = [], refetch: refetchOcc } = useQuery({
    queryKey: ["ts-occ-all"],
    queryFn: async () =>
      ((
        await supabase
          .from("trip_occurrences")
          .select("id,trip_id,departure_date,bed_costs,settled_at")
          .order("departure_date", { ascending: false })
      ).data ?? []) as unknown as Array<{
        id: string;
        trip_id: string;
        departure_date: string;
        bed_costs?: Record<string, Record<string, number>> | null;
        settled_at?: string | null;
      }>,
  });

  const occByKey = useMemo(() => {
    const map = new Map<
      string,
      { id: string; bed_costs: Record<string, Record<string, number>>; settled_at: string | null }
    >();
    for (const o of occurrences) {
      map.set(`${o.trip_id}__${o.departure_date}`, {
        id: o.id,
        bed_costs: o.bed_costs ?? {},
        settled_at: o.settled_at ?? null,
      });
    }
    return map;
  }, [occurrences]);

  const { data: repProfiles = [], refetch: refetchReps } = useQuery({
    queryKey: ["ts-reps"],
    queryFn: async () =>
      ((
        await supabase
          .from("profiles")
          .select("id,full_name,account_type,active,commission_rate")
          .eq("account_type", "representative")
      ).data ?? []) as Array<{
        id: string;
        full_name: string | null;
        account_type: string;
        active?: boolean | null;
        commission_rate?: number | null;
      }>,
  });

  const [repRates, setRepRates] = useState<Record<string, number>>({});
  useEffect(() => {
    setRepRates((prev) => {
      const next = { ...prev };
      for (const r of repProfiles) if (next[r.id] === undefined) next[r.id] = Number(r.commission_rate ?? 0) || 0;
      return next;
    });
  }, [repProfiles]);

  async function saveRepRate(id: string, value: number) {
    setRepRates((s) => ({ ...s, [id]: value }));
    const { error } = await supabase
      .from("profiles")
      .update({ commission_rate: value } as never)
      .eq("id", id);
    if (error) toast.error("تعذر حفظ نسبة العمولة");
    else void refetchReps();
  }

  const { data: rows = [] } = useQuery({
    queryKey: ["ts-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id,booking_code,customer_name,id_number,contact_phone,nationality,booking_source,passenger_count,room_type,booking_type,total_price,status,deleted_at,notes,actual_return_day,extension_nights,trip_mode,trip_id,bus_id,package_id,rep_profile_id,departure_date,packages(name),trips(name,departure_day,return_day),buses!bookings_bus_id_fkey(id,name,bus_number,capacity,expenses)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as SheetBooking[];
    },
  });

  /* ------------- reference data, persisted in the database ----------- */
  const [ref, setRef] = useState<RefState>(EMPTY_REF);
  const [loadedRef, setLoadedRef] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("settlement_reference").select("*").eq("id", 1).maybeSingle();
      if (cancelled) return;
      if (data) {
        const d = data as unknown as Record<string, unknown>;
        setRef({
          costs: (d["hotel_costs"] as RefState["costs"]) ?? {},
          nightPrices: (d["hotel_night_prices"] as RefState["nightPrices"]) ?? {},
          ext: (d["extension"] as RefState["ext"]) ?? {},
          commissions: (d["commissions"] as RefState["commissions"]) ?? {},
          transfer: { ...EMPTY_REF.transfer, ...((d["transfer"] as Record<string, number>) ?? {}) },
          returnSeatCost: Number(d["return_seat_cost"] ?? 0) || 0,

        });
      }
      setLoadedRef(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loadedRef) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase.from("settlement_reference").upsert({
        id: 1,
        hotel_costs: ref.costs,
        hotel_night_prices: ref.nightPrices,
        extension: ref.ext,
        commissions: ref.commissions,
        transfer: ref.transfer,
        return_seat_cost: ref.returnSeatCost,

      } as never);
      setSaving(false);
      if (error) toast.error("تعذر حفظ بيانات الحسابات");
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [ref, loadedRef]);

  /* ---------------------------- filtering -------------------------------- */
  const filtered = useMemo(
    () =>
      rows.filter((b) => {
        if (b.status === "cancelled") return false;
        if (busIds.length > 0 && (!b.bus_id || !busIds.includes(b.bus_id))) return false;
        if (busIds.length === 0 && tripId && b.trip_id !== tripId) return false;
        if (sourceFilter && (b.booking_source || "الموقع") !== sourceFilter) return false;
        if (search) {
          const q = search.trim().toLowerCase();
          const hay = `${b.booking_code} ${b.customer_name ?? ""} ${b.id_number ?? ""} ${b.contact_phone ?? ""}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [rows, tripId, busIds, search, sourceFilter],
  );

  /** كل مصادر الحجز المتاحة (قبل فلتر المصدر نفسه). */
  const sourceOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((b) => {
      if (b.status === "cancelled") return;
      if (busIds.length > 0 && (!b.bus_id || !busIds.includes(b.bus_id))) return;
      if (busIds.length === 0 && tripId && b.trip_id !== tripId) return;
      set.add(b.booking_source || "الموقع");
    });
    return [...set].sort((a, b) => a.localeCompare(b, "ar"));
  }, [rows, tripId, busIds]);

  const bus = buses.find((b) => b.id === busId) ?? null;

  const trip = trips.find((t) => t.id === tripId) ?? null;
  const tripInfo = filtered.find((b) => b.trips)?.trips ?? null;

  const passengers = filtered.reduce((s, b) => s + (b.passenger_count || 0), 0);
  const capacity =
    busIds.length > 0 ? buses.filter((b) => busIds.includes(b.id)).reduce((s, b) => s + (b.capacity || 0), 0) : 0;
  const remaining = Math.max(0, capacity - passengers);
  const selectedBuses = buses.filter((b) => busIds.includes(b.id));
  const revenue = filtered.reduce((s, b) => s + n(b.total_price), 0);

  function roomLabelOf(b: SheetBooking): string {
    if (!b.packages?.name) return NO_HOTEL;
    if (b.booking_type === "individual") return "خماسي مشترك";
    return ROOM_LABELS[String(b.room_type ?? "5")] ?? "خماسي";
  }

  const hotelNames = useMemo(() => {
    const used = new Set(filtered.map((b) => b.packages?.name).filter(Boolean) as string[]);
    const all = hotelRows.filter((h) => h.active).map((h) => h.name);
    return [...new Set([...all, ...used])];
  }, [hotelRows, filtered]);

  const nightPriceOf = (hotel: string) => n(ref.nightPrices[hotel]);

  /** إحصائيات التسكين + التكلفة المقترحة للأسرّة الفارغة، لركاب هذا النطاق (المفلتر الحالي) بس. */
  function housingStatsFor(list: SheetBooking[]) {
    const map = new Map<string, Map<string, { people: number; rooms: number }>>();
    const sharedPeople = new Map<string, number>();
    for (const b of list) {
      const hotel = b.packages?.name || NO_HOTEL;
      const rt = String(b.room_type ?? "5");
      const inner = map.get(hotel) ?? new Map();
      const cur = inner.get(rt) ?? { people: 0, rooms: 0 };
      cur.people += b.passenger_count || 0;
      if (b.booking_type === "individual") {
        sharedPeople.set(hotel, (sharedPeople.get(hotel) ?? 0) + (b.passenger_count || 0));
      } else {
        cur.rooms += 1;
      }
      inner.set(rt, cur);
      map.set(hotel, inner);
    }
    sharedPeople.forEach((people, hotel) => {
      const inner = map.get(hotel);
      if (!inner) return;
      const cur = inner.get("5") ?? { people: 0, rooms: 0 };
      cur.rooms += Math.ceil(people / 5);
      inner.set("5", cur);
    });
    const roomsPerHotel: Record<string, number> = {};
    map.forEach((inner, hotel) => {
      if (hotel === NO_HOTEL) return;
      let t = 0;
      inner.forEach((v) => (t += v.rooms));
      roomsPerHotel[hotel] = t;
    });
    const totalRooms = Object.values(roomsPerHotel).reduce((s, v) => s + v, 0);
    const housingCost = Object.entries(roomsPerHotel).reduce((s, [h, r]) => s + r * nightPriceOf(h), 0);
    const usedBedsCost = list.reduce((s, b) => {
      const hotel = b.packages?.name;
      if (!hotel) return s;
      const cap = ROOM_CAPACITY[roomLabelOf(b)] ?? 5;
      return s + (b.passenger_count || 0) * (nightPriceOf(hotel) / cap);
    }, 0);
    const emptyBedsSuggested = Math.max(0, housingCost - usedBedsCost);
    return { rooming: map, roomsPerHotel, totalRooms, housingCost, emptyBedsSuggested };
  }

  const rooming = useMemo(() => housingStatsFor(filtered).rooming, [filtered, ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const roomsPerHotel = useMemo(() => housingStatsFor(filtered).roomsPerHotel, [filtered, ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalRooms = useMemo(() => housingStatsFor(filtered).totalRooms, [filtered, ref]); // eslint-disable-line react-hooks/exhaustive-deps
  const housingCost = useMemo(() => housingStatsFor(filtered).housingCost, [filtered, ref]); // eslint-disable-line react-hooks/exhaustive-deps

  /* -------------------------- per-bus expenses ---------------------------- */
  // حجوزات «عودة فقط» مستبعدة من قسمة مصاريف الحافلة (لا في البسط ولا في المقام).
  const busPassengerMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of rows) {
      if (b.status === "cancelled" || !b.bus_id || b.trip_mode === "return") continue;
      m.set(b.bus_id, (m.get(b.bus_id) ?? 0) + (b.passenger_count || 0));
    }
    return m;

  }, [rows]);

  const busBookingsMap = useMemo(() => {
    const m = new Map<string, SheetBooking[]>();
    for (const b of rows) {
      if (b.status === "cancelled" || !b.bus_id) continue;
      const list = m.get(b.bus_id) ?? [];
      list.push(b);
      m.set(b.bus_id, list);
    }
    return m;
  }, [rows]);

  /** مصاريف الحافلة المحددة للتعديل الحالي — تُحفظ عند الاعتماد. */
  const [busExp, setBusExp] = useState<BusExpenses>(EMPTY_BUS_EXP);
  useEffect(() => {
    if (!bus) {
      setBusExp(EMPTY_BUS_EXP);
      return;
    }
    // اقترح التكلفة فقط إن لم تُحفظ قيمة من قبل. الصفر قيمة يدوية صحيحة ولا يُستبدل.
    const busBookings = busBookingsMap.get(bus.id) ?? [];
    const suggestedEmpty = bus.expense_empty_beds == null
      ? housingStatsFor(busBookings).emptyBedsSuggested
      : n(bus.expense_empty_beds);
    setBusExp({
      busCost: n(bus.expense_bus_cost),
      driverTip: n(bus.expense_driver_tip),
      taxi: n(bus.expense_taxi),
      supervisor: n(bus.expense_supervisor),
      supervisorBed: n(bus.expense_supervisor_bed),
      emptyBeds: suggestedEmpty,
      extra: n(bus.expense_extra),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id, buses]);

  /** إجمالي مصاريف حافلة معينة (المحفوظة، أو المسودة الحية لو هي المحددة للتعديل الآن). */
  function busExpensesOf(rowBusId: string | null): BusExpenses {
    if (!rowBusId) return EMPTY_BUS_EXP;
    if (busId === rowBusId) return busExp;
    const busRow = buses.find((x) => x.id === rowBusId);
    if (!busRow) return EMPTY_BUS_EXP;
    return {
      busCost: n(busRow.expense_bus_cost),
      driverTip: n(busRow.expense_driver_tip),
      taxi: n(busRow.expense_taxi),
      supervisor: n(busRow.expense_supervisor),
      supervisorBed: n(busRow.expense_supervisor_bed),
      emptyBeds: n(busRow.expense_empty_beds),
      extra: n(busRow.expense_extra),
    };
  }

  function busTotalOf(rowBusId: string | null): number {
    const e = busExpensesOf(rowBusId);
    return e.busCost + e.driverTip + e.taxi + e.supervisor + e.supervisorBed + e.emptyBeds + e.extra;
  }

  /** تكلفة المقعد الفعلية لحافلة معينة — إجمالي مصاريفها (شاملة سرير المشرف والأسرّة
   *  الفارغة الخاصة بها) ÷ إجمالي ركابها هي بس. */
  function seatCostForBus(rowBusId: string | null): number {
    if (!rowBusId) return 0;
    const total = busTotalOf(rowBusId);
    const pax = busPassengerMap.get(rowBusId) ?? 0;
    return pax > 0 ? total / pax : 0;
  }

  const headlineSeatCost = busId ? seatCostForBus(busId) : 0;

  /** تكلفة سرير راكب معيّن (فردي/عائلي) — من مناسبة رحلته إن وُجدت، وإلا القيمة العامة. */
  function bedCostFor(b: SheetBooking, hotel: string, roomLabel: string): number {
    if (hotel === NO_HOTEL) return 0;
    const key = b.trip_id && b.departure_date ? `${b.trip_id}__${b.departure_date}` : "";
    const occ = key ? occByKey.get(key) : null;
    const stored = occ?.bed_costs?.[hotel]?.[roomLabel];
    if (stored != null && stored > 0) return n(stored);
    return nightPriceOf(hotel) / (ROOM_CAPACITY[roomLabel] ?? 5);
  }

  /* ------------------------- per-booking engine -------------------------- */
  const repRate = (name: string) => n(ref.commissions[name] ?? 0);

  const computed = useMemo(
    () =>
      filtered.map((b, idx) => {
        const hotel = b.packages?.name ?? NO_HOTEL;
        const roomLabel = roomLabelOf(b);
        const count = b.passenger_count || 0;
        const nights = n(b.extension_nights);
        const rep = b.booking_source || "الموقع";

        const extSale = n(ref.ext[hotel]?.sale ?? hotelRows.find((h) => h.id === b.package_id)?.extension_price ?? 0);
        // اجمالي الباقة = المبلغ الكلي المحفوظ ناقص قيمة التمديد (total_price يشمل التمديد من الأساس).
        const packageTotal = n(b.total_price) - extSale * nights;
        // تكلفة المقعد: من مصاريف حافلة هذا الحجز بالذات (شاملة سرير المشرف والأسرّة
        // الفارغة الخاصة بها) ÷ ركاب هذه الحافلة فقط.
        // أما حجوزات «عودة فقط» فتأخذ القيمة اليدوية «تكلفة مقعد العودة فقط».
        const seatCost = b.trip_mode === "return" ? n(ref.returnSeatCost) : seatCostForBus(b.bus_id);

        // تكلفة السرير الخاص بهذا الراكب فقط (غير سرير المشرف والأسرّة الفارغة، دول
        // بقوا جزء من تكلفة المقعد أعلاه).
        const bedCost = bedCostFor(b, hotel, roomLabel);
        const profileRate = b.rep_profile_id ? Number(repRates[b.rep_profile_id] ?? 0) || 0 : 0;
        const rate = profileRate || repRate(rep);

        const r = computeBookingProfit({
          packageTotal,
          nights,
          extSale,
          extNightCost: n(ref.ext[hotel]?.cost),
          bedCost,
          seatCost,
          emptyBedShare: 0, // بقت متضمنة داخل seatCost (على مستوى كل حافلة)
          count,
          rate,
        });

        return { idx, b, rep, hotel, roomLabel, count, nights, packageTotal, bedCost, seatCost, ...r };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, hotelRows, ref, busPassengerMap, buses, busId, busExp, occByKey, repRates],
  );

  /** ترتيب الجدول بالنقر على أي عنوان عمود. */
  const sortedComputed = useMemo(() => {
    if (!sort) return computed;
    const arr = [...computed];
    const dir = sort.dir === "asc" ? 1 : -1;
    const textVal = (r: (typeof computed)[number]): string => {
      switch (sort.key) {
        case "rep":
          return r.rep;
        case "customer":
          return r.b.customer_name ?? "";
        case "id":
          return r.b.id_number ?? "";
        case "nationality":
          return r.b.nationality ?? "";
        case "departure":
          return departureCellText(r.b);
        case "returnDay":
          return returnDisplay(r.b.actual_return_day || r.b.trips?.return_day, r.b.extension_nights, "", r.b.trip_mode);
        case "hotel":
          return r.hotel;
        case "room":
          return r.roomLabel;
        case "roomNumber":
          return roomNumbers[r.b.id] ?? "";
        case "notes":
          return r.b.notes ?? "";
        default:
          return "";
      }
    };
    const numVal = (r: (typeof computed)[number]): number => {
      switch (sort.key) {
        case "index":
          return r.idx;
        case "count":
          return r.count;
        case "packageTotal":
          return r.packageTotal;
        case "nights":
          return r.nights;
        case "extensionTotal":
          return r.extensionTotal;
        case "grandTotal":
          return r.grandTotal;
        case "seatCost":
          return r.seatCost;
        case "bedCost":
          return r.bedCost;
        case "costPerPerson":
          return r.costPerPerson;
        case "groupCost":
          return r.groupCost;
        case "extensionCost":
          return r.extensionCost;
        case "extensionProfit":
          return r.extensionProfit;
        case "grossProfit":
          return r.grossProfit;
        case "rate":
          return r.rate;
        case "repShare":
          return r.repShare;
        case "companyShare":
          return r.companyShare;
        default:
          return 0;
      }
    };
    const isNumericKey: SortKey[] = [
      "index",
      "count",
      "packageTotal",
      "nights",
      "extensionTotal",
      "grandTotal",
      "seatCost",
      "bedCost",
      "costPerPerson",
      "groupCost",
      "extensionCost",
      "extensionProfit",
      "grossProfit",
      "rate",
      "repShare",
      "companyShare",
    ];
    if (isNumericKey.includes(sort.key)) {
      arr.sort((a, z) => (numVal(a) - numVal(z)) * dir);
    } else {
      arr.sort((a, z) => textVal(a).localeCompare(textVal(z), "ar") * dir);
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computed, sort, roomNumbers]);

  /* ------------------------ settlement approvals ------------------------- */
  const [approving, setApproving] = useState(false);

  async function approveBus() {
    if (!bus) return;
    setApproving(true);
    try {
      const { error } = await supabase
        .from("buses")
        .update({
          expense_bus_cost: busExp.busCost,
          expense_driver_tip: busExp.driverTip,
          expense_taxi: busExp.taxi,
          expense_supervisor: busExp.supervisor,
          expense_supervisor_bed: busExp.supervisorBed,
          expense_empty_beds: busExp.emptyBeds,
          expense_extra: busExp.extra,
          settled_at: new Date().toISOString(),
        } as never)
        .eq("id", bus.id);
      if (error) throw error;
      const { error: rpcErr } = await supabase.rpc("recalc_settled_profits" as never, { _bus_id: bus.id } as never);
      if (rpcErr) throw rpcErr;
      await refetchBuses();
      toast.success("تم اعتماد مصاريف الحافلة وإعادة حساب الأرباح");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الاعتماد");
    } finally {
      setApproving(false);
    }
  }

  const repNames = useMemo(() => {
    const names = new Set<string>();
    repProfiles.forEach((p) => p.full_name && names.add(p.full_name));
    filtered.forEach((b) => names.add(b.booking_source || "الموقع"));
    return [...names];
  }, [repProfiles, filtered]);

  const totals = useMemo(
    () =>
      computed.reduce(
        (s, r) => ({
          count: s.count + r.count,
          packageTotal: s.packageTotal + r.packageTotal,
          extensionTotal: s.extensionTotal + r.extensionTotal,
          grandTotal: s.grandTotal + r.grandTotal,
          groupCost: s.groupCost + r.groupCost,
          extensionCost: s.extensionCost + r.extensionCost,
          extensionProfit: s.extensionProfit + r.extensionProfit,
          grossProfit: s.grossProfit + r.grossProfit,
          repShare: s.repShare + r.repShare,
          companyShare: s.companyShare + r.companyShare,
        }),
        {
          count: 0,
          packageTotal: 0,
          extensionTotal: 0,
          grandTotal: 0,
          groupCost: 0,
          extensionCost: 0,
          extensionProfit: 0,
          grossProfit: 0,
          repShare: 0,
          companyShare: 0,
        },
      ),
    [computed],
  );

  /** تعريف الأعمدة: مفتاح الترتيب + العنوان — يستخدم للعرض وللترتيب معًا. */
  const COLUMN_DEFS: Array<{ key: SortKey; label: string }> = [
    { key: "rep", label: "المندوب" },
    { key: "customer", label: "العميل" },
    { key: "id", label: "الهوية" },
    { key: "nationality", label: "جنسية" },
    { key: "count", label: "العدد" },
    { key: "departure", label: "الذهاب" },
    { key: "returnDay", label: "العوده" },
    { key: "hotel", label: "الفندق" },
    { key: "room", label: "نوع الغرفه" },
    { key: "roomNumber", label: "رقم الغرفه" },
    { key: "packageTotal", label: "اجمالي الباقه" },
    { key: "nights", label: "ليالي التمديد" },
    { key: "extensionTotal", label: "اجمالي التمديد" },
    { key: "grandTotal", label: "إجمالي" },
    { key: "notes", label: "ملاحظات" },
    { key: "seatCost", label: "ت. المقعد" },
    { key: "bedCost", label: "ت. السرير" },
    { key: "costPerPerson", label: "ت. الباقه/للفرد" },
    { key: "groupCost", label: "ت. المجموعه بالمرافقين الباقه الاساسية" },
    { key: "extensionCost", label: "ت. التمديد" },
    { key: "extensionProfit", label: "ربح التمديد" },
    { key: "grossProfit", label: "مجمل الربح" },
    { key: "rate", label: "نسبة المندوب" },
    { key: "repShare", label: "حصة المندوب" },
    { key: "companyShare", label: "حصة المؤسسه" },
  ];

  const title = `كشف الحسابات والتصفية — ${trip?.name ?? tripInfo?.name ?? "كل الرحلات"}${
    selectedBuses.length ? ` — ${selectedBuses.map((b) => b.name || `حافلة ${b.bus_number}`).join("، ")}` : ""
  }`;

  /** الصفحة الثانية: مصاريف كل حافلة + ملخص مصاريف الرحلة. */
  function expenseSections() {
    const usedBusIds = [...new Set(computed.map((r) => r.b.bus_id).filter(Boolean) as string[])];
    const busList = usedBusIds
      .map((id) => buses.find((x) => x.id === id))
      .filter(Boolean) as typeof buses;

    const busRows = busList.map((bx, i) => {
      const e = busExpensesOf(bx.id);
      const pax = busPassengerMap.get(bx.id) ?? 0;
      return [
        i + 1,
        bx.name || `حافلة ${bx.bus_number}`,
        bx.bus_number ?? "",
        pax,
        round(e.busCost),
        round(e.driverTip),
        round(e.taxi),
        round(e.supervisor),
        round(e.supervisorBed),
        round(e.emptyBeds),
        round(e.extra),
        round(busTotalOf(bx.id)),
        round(seatCostForBus(bx.id)),
        bx.settled_at ? "معتمد" : "غير معتمد",
      ];
    });

    const sum = (idx: number) => round(busRows.reduce((s, r) => s + (Number(r[idx]) || 0), 0));
    const busExpensesTotal = busRows.reduce((s, r) => s + (Number(r[11]) || 0), 0);
    const bedTotal = computed.reduce((s, r) => s + r.bedCost * r.count, 0);

    const busSection = {
      title: `كشف مصاريف الباص — ${trip?.name ?? tripInfo?.name ?? "كل الرحلات"}`,
      columns: [
        "م",
        "الحافلة",
        "رقم الحافلة",
        "عدد الركاب",
        "أجرة الباص",
        "إكرامية السائق",
        "التاكسي",
        "المشرف",
        "سرير المشرف",
        "الأسرّة الفارغة",
        "مصاريف أخرى",
        "إجمالي المصاريف",
        "تكلفة المقعد",
        "الاعتماد",
      ],
      rows: busRows,
      totals: [
        "الإجمالي",
        "",
        "",
        sum(3),
        sum(4),
        sum(5),
        sum(6),
        sum(7),
        sum(8),
        sum(9),
        sum(10),
        round(busExpensesTotal),
        "",
        "",
      ],
    };

    const tripSection = {
      title: `كشف مصاريف الرحلة — ${trip?.name ?? tripInfo?.name ?? "كل الرحلات"}`,
      columns: ["البند", "القيمة"],
      rows: [
        ["عدد الحجوزات", computed.length],
        ["عدد الركاب", totals.count],
        ["إجمالي الباقات", round(totals.packageTotal)],
        ["إجمالي التمديد", round(totals.extensionTotal)],
        ["الإجمالي العام", round(totals.grandTotal)],
        ["إجمالي مصاريف الباصات", round(busExpensesTotal)],
        ["إجمالي تكلفة الأسرّة (الفنادق)", round(bedTotal)],
        ["تكلفة المجموعة (الباقة الأساسية)", round(totals.groupCost)],
        ["تكلفة التمديد", round(totals.extensionCost)],
        ["ربح التمديد", round(totals.extensionProfit)],
        ["مجمل الربح", round(totals.grossProfit)],
        ["حصص المناديب", round(totals.repShare)],
        ["حصة المؤسسة", round(totals.companyShare)],
      ] as (string | number)[][],
    };

    return [busSection, tripSection];
  }

  function exportData(): SettlementExport {
    return {
      title,
      columns: ["م", ...COLUMN_DEFS.map((c) => c.label)],
      highlightColumn: "مجمل الربح",
      returnRows: sortedComputed
        .map((r, i) => (r.b.trip_mode === "return" ? i : -1))
        .filter((i) => i >= 0),

      sections: expenseSections(),
      rows: sortedComputed.map((r, i) => [
        i + 1,
        r.rep,
        r.b.customer_name ?? "",
        r.b.id_number ?? "",
        r.b.nationality ?? "",
        r.count,
        departureCellText(r.b),
        returnDisplay(r.b.actual_return_day || r.b.trips?.return_day, r.b.extension_nights, "", r.b.trip_mode),
        r.hotel,
        r.roomLabel,
        roomNumbers[r.b.id] ?? "",
        round(r.packageTotal),
        r.nights,
        round(r.extensionTotal),
        round(r.grandTotal),
        r.b.notes ?? "",
        round(r.seatCost),
        round(r.bedCost),
        round(r.costPerPerson),
        round(r.groupCost),
        round(r.extensionCost),
        round(r.extensionProfit),
        round(r.grossProfit),
        r.rate,
        round(r.repShare),
        round(r.companyShare),
      ]),
      totals: [
        "الإجمالي",
        "",
        "",
        "",
        "",
        totals.count,
        "",
        "",
        "",
        "",
        "",
        round(totals.packageTotal),
        "",
        round(totals.extensionTotal),
        round(totals.grandTotal),
        "",
        "",
        "",
        "",
        round(totals.groupCost),
        round(totals.extensionCost),
        round(totals.extensionProfit),
        round(totals.grossProfit),
        "",
        round(totals.repShare),
        round(totals.companyShare),
      ],
    };
  }

  async function run(job: "excel" | "pdf") {
    setBusy(true);
    try {
      const d = exportData();
      if (job === "excel") {
        downloadBlob(await buildSettlementWorkbook(d), `settlement-${new Date().toISOString().slice(0, 10)}.xlsx`);
        toast.success("تم تنزيل كشف الحسابات");
      } else if (!printSettlementSheet(d)) {
        toast.error("الرجاء السماح بالنوافذ المنبثقة لإنشاء PDF");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر التصدير");
    } finally {
      setBusy(false);
    }
  }

  function SortHeader({ col }: { col: (typeof COLUMN_DEFS)[number] }) {
    const active = sort?.key === col.key;
    const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
    const activeColor = col.key === "grossProfit" ? "text-destructive-foreground" : "text-primary";
    return (
      <button
        type="button"
        onClick={() => toggleSort(col.key)}
        className={`flex items-center gap-1 w-full justify-center ${active ? activeColor : ""}`}
        title="ترتيب"
      >
        {col.label}
        <Icon className="h-3 w-3 shrink-0 opacity-70" />
      </button>
    );
  }

  return (
    <div className="surface-card p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-[64px] w-[64px] shrink-0 rounded-lg border object-contain" />
          ) : null}
          <Table2 className="h-5 w-5" /> الحسابات والتصفية
          <span className="text-sm font-normal text-muted-foreground">({computed.length} حجز)</span>
          {saving ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button className="rounded-full" disabled={busy} onClick={() => run("excel")}>
            <Download className="h-4 w-4 ml-1" /> تصدير Excel
          </Button>
          <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => run("pdf")}>
            <Download className="h-4 w-4 ml-1" /> تصدير PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 md:grid-cols-4 rounded-2xl border-2 border-dashed border-border p-3 bg-muted/40">
        <div>
          <Label className="text-xs mb-1 block">الرحلة</Label>
          <select
            value={tripId}
            onChange={(e) => {
              setTripId(e.target.value);
              setBusId("");
            }}
            className="h-10 w-full rounded-md border px-3 text-sm bg-white"
          >
            <option value="">— كل الرحلات —</option>
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">
            الحافلة (اختيار متعدد — الحالة معتمدة/غير معتمدة موضّحة جنب كل اسم)
          </Label>
          <BusMultiSelect buses={busesForSelect} value={busIds} onChange={setBusIds} />
        </div>
        <div>
          <Label className="text-xs mb-1 block">مصدر الحجز</Label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm bg-white"
          >
            <option value="">— كل المصادر —</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">بحث</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="الاسم، الهوية، رقم الحجز..." />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3 text-sm">
        <HeadCell k="الذهاب" v={tripInfo?.departure_day ?? "—"} />
        <HeadCell k="العودة" v={tripInfo?.return_day ?? "—"} />
        <HeadCell k="سعة الحافلة" v={capacity ? String(capacity) : "—"} />
        <HeadCell k="عدد الركاب" v={String(passengers)} />
        <HeadCell k="المقاعد المتبقية" v={capacity ? String(remaining) : "—"} />
        <HeadCell k="تكلفة المقعد" v={busId ? sar(round(headlineSeatCost)) : "لكل حافلة على حدة"} />
      </div>

      {/* Main settlement table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted">
            <tr>
              <th className="border px-2 py-0.5 font-bold">
                <SortHeader col={{ key: "index", label: "م" }} />
              </th>
              {COLUMN_DEFS.map((c) => (
                <th
                  key={c.key}
                  className={`border px-2 py-0.5 leading-tight whitespace-nowrap font-bold ${
                    c.key === "grossProfit" ? "bg-destructive text-destructive-foreground" : ""
                  }`}
                >
                  <SortHeader col={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedComputed.map((r, i) => (
              <tr key={r.b.id} className="odd:bg-white even:bg-muted/30">
                <td className="border px-2 py-0.5 text-center">{i + 1}</td>
                <td className="border px-2 py-0.5 text-center">{r.rep}</td>
                <td className="border px-2 py-0.5">{r.b.customer_name}</td>
                <td className="border px-2 py-0.5 text-center font-mono">{r.b.id_number}</td>
                <td className="border px-2 py-0.5 text-center">{r.b.nationality ?? "—"}</td>
                <td className="border px-2 py-0.5 text-center">{r.count}</td>
                <td className="border px-2 py-0.5 text-center">{departureCellText(r.b)}</td>
                <td className="border px-2 py-0.5 text-center">
                  {returnDisplay(
                    r.b.actual_return_day || r.b.trips?.return_day,
                    r.b.extension_nights,
                    "—",
                    r.b.trip_mode,
                  )}
                </td>
                <td className="border px-2 py-0.5 text-center">{r.hotel}</td>
                <td className="border px-2 py-0.5 text-center">{r.roomLabel}</td>
                <td className="border p-1">
                  <Input
                    className="h-7 text-xs w-20"
                    value={roomNumbers[r.b.id] ?? ""}
                    onChange={(e) => setRoomNumbers((s) => ({ ...s, [r.b.id]: e.target.value }))}
                  />
                </td>
                <td className="border px-2 py-0.5 text-center font-bold">{round(r.packageTotal)}</td>
                <td className="border px-2 py-0.5 text-center">{r.nights}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.extensionTotal)}</td>
                <td className="border px-2 py-0.5 text-center font-bold">{round(r.grandTotal)}</td>
                <td className="border px-2 py-0.5">{r.b.notes ?? ""}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.seatCost)}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.bedCost)}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.costPerPerson)}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.groupCost)}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.extensionCost)}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.extensionProfit)}</td>
                <td className="border border-destructive px-2 py-0.5 text-center font-bold bg-destructive text-destructive-foreground">{round(r.grossProfit)}</td>
                <td className="border px-2 py-0.5 text-center">{r.rate}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.repShare)}</td>
                <td className="border px-2 py-0.5 text-center">{round(r.companyShare)}</td>
              </tr>
            ))}
            {computed.length === 0 && (
              <tr>
                <td colSpan={COLUMN_DEFS.length + 1} className="p-6 text-center text-muted-foreground">
                  لا توجد بيانات
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-muted font-bold">
            <tr>
              <td className="border px-2 py-0.5 text-center" colSpan={5}>
                الإجمالي
              </td>
              <td className="border px-2 py-0.5 text-center">{totals.count}</td>
              <td className="border px-2 py-0.5" colSpan={5} />
              <td className="border px-2 py-0.5 text-center">{round(totals.packageTotal)}</td>
              <td className="border px-2 py-0.5" />
              <td className="border px-2 py-0.5 text-center">{round(totals.extensionTotal)}</td>
              <td className="border px-2 py-0.5 text-center">{round(totals.grandTotal)}</td>
              <td className="border px-2 py-0.5" colSpan={4} />
              <td className="border px-2 py-0.5 text-center">{round(totals.groupCost)}</td>
              <td className="border px-2 py-0.5 text-center">{round(totals.extensionCost)}</td>
              <td className="border px-2 py-0.5 text-center">{round(totals.extensionProfit)}</td>
              <td className="border border-destructive px-2 py-0.5 text-center bg-destructive text-destructive-foreground">{round(totals.grossProfit)}</td>
              <td className="border px-2 py-0.5" />
              <td className="border px-2 py-0.5 text-center">{round(totals.repShare)}</td>
              <td className="border px-2 py-0.5 text-center">{round(totals.companyShare)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Rooming statistics */}
      <div>
        <h3 className="font-extrabold mb-2">إحصائيات التسكين</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...rooming.entries()].map(([hotel, inner]) => (
            <div key={hotel} className="rounded-xl border p-3">
              <p className="font-bold mb-1">{hotel}</p>
              {[...inner.entries()].map(([rt, v]) => (
                <p key={rt} className="text-xs text-muted-foreground">
                  {ROOM_LABELS[rt] ?? rt}: {v.rooms} غرفة — {v.people} فرد
                </p>
              ))}
            </div>
          ))}
          {rooming.size === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات</p>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trip (housing) expenses — a room-night price per hotel */}
        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-extrabold">مصروفات الرحلة — سعر الغرفة/الليلة لكل فندق</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {hotelNames.map((h) => (
              <div key={h}>
                <Label className="text-xs mb-1 block">
                  {h} <span className="text-muted-foreground">({roomsPerHotel[h] ?? 0} غرفة)</span>
                </Label>
                <Input
                  type="number"
                  value={String(ref.nightPrices[h] ?? 0)}
                  onChange={(e) =>
                    setRef((s) => ({ ...s, nightPrices: { ...s.nightPrices, [h]: Number(e.target.value) || 0 } }))
                  }
                />
              </div>
            ))}
            {hotelNames.length === 0 && <p className="text-sm text-muted-foreground">لا توجد فنادق</p>}
          </div>
          <p className="font-bold">
            إجمالي التسكين ({totalRooms} غرفة): {sar(round(housingCost))}
          </p>
        </div>

        {/* Bus expenses — per selected bus, else a summary of every selected bus */}
        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-extrabold">
            مصاريف الباص
            {bus ? <span className="text-sm font-normal"> — {bus.name || `حافلة ${bus.bus_number}`}</span> : null}
          </h3>

          {busId ? (
            <>
              <p className="text-xs text-muted-foreground">
                {bus?.settled_at
                  ? `معتمدة بتاريخ ${new Date(bus.settled_at).toLocaleString("ar-SA")}`
                  : "غير معتمدة بعد"}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["تكلفة الباص", "busCost"],
                    ["إكرامية السائق", "driverTip"],
                    ["تاكسي", "taxi"],
                    ["المشرف (إكرامية/أجرة)", "supervisor"],
                    ["سرير المشرف", "supervisorBed"],
                    ["الأسرة الفارغة", "emptyBeds"],
                    ["مصاريف إضافية", "extra"],
                  ] as Array<[string, keyof BusExpenses]>
                ).map(([label, key]) => (
                  <MoneyNum
                    key={key}
                    label={label}
                    value={busExp[key]}
                    onChange={(v) => setBusExp((s) => ({ ...s, [key]: v }))}
                  />
                ))}
                <div>
                  <Label className="text-xs mb-1 block">تكلفة المقعد (تلقائي)</Label>
                  <Input readOnly className="bg-muted" value={round(headlineSeatCost)} />
                </div>
              </div>
              <p className="font-bold">إجمالي مصاريف الباص: {sar(round(busTotalOf(busId)))}</p>
              <p className="text-xs text-muted-foreground">المقاعد المشغولة: {busPassengerMap.get(busId) ?? 0}</p>
              <Button className="rounded-full" disabled={approving} onClick={() => void approveBus()}>
                اعتماد مصاريف الحافلة
              </Button>
            </>
          ) : selectedBuses.length > 1 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                محدد {selectedBuses.length} حافلات — كل حافلة تُحسب بمصاريفها وتكلفة مقعدها الخاصة بها في الجدول. اختر
                حافلة واحدة فقط من الفلتر لتعديل أو اعتماد مصاريفها.
              </p>
              <div className="space-y-1">
                {selectedBuses.map((sb) => (
                  <div key={sb.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                    <span className="font-bold">{sb.name || `حافلة ${sb.bus_number}`}</span>
                    <span className={sb.settled_at ? "text-success" : "text-destructive"}>
                      {sb.settled_at ? "معتمدة" : "غير معتمدة"}
                    </span>
                    <span>تكلفة المقعد: {sar(round(seatCostForBus(sb.id)))}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">اختر حافلة واحدة في الفلتر لعرض/تعديل مصاريفها.</p>
          )}
        </div>
      </div>

      {/* Settlement summary */}
      <div className="rounded-xl border p-4 space-y-2">
        <h3 className="font-extrabold">تسوية الرحلة</h3>
        <SettleRow k="إجمالي الإيراد" v={sar(round(revenue))} />
        <SettleRow k="إجمالي التكاليف" v={sar(round(totals.groupCost + totals.extensionCost))} />
        <SettleRow k="مجمل الربح" v={sar(round(totals.grossProfit))} strong />
        <SettleRow k="حصة المناديب" v={sar(round(totals.repShare))} />
        <SettleRow k="حصة المؤسسة" v={sar(round(totals.companyShare))} strong />
      </div>

      {/* Reference data — persisted in the database */}
      <div className="rounded-xl border p-4 space-y-4">
        <h3 className="font-extrabold">بيانات الشيت المرجعي (محفوظة في قاعدة البيانات)</h3>

        <div className="grid gap-3 sm:grid-cols-3">
          {(["ذهاب فقط", "ذهاب وعوده فقط", "ذهاب وعوده برحلة اخرى"] as const).map((k) => (
            <div key={k}>
              <Label className="text-xs mb-1 block">سعر {k}</Label>
              <Input
                type="number"
                value={String(ref.transfer[k] ?? 0)}
                onChange={(e) =>
                  setRef((s) => ({ ...s, transfer: { ...s.transfer, [k]: Number(e.target.value) || 0 } }))
                }
              />
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className="border px-2 py-0.5">الفندق</th>
                {ROOM_ROWS.map((r) => (
                  <th key={r} className="border px-2 py-0.5 whitespace-nowrap">
                    تكلفة {r}
                    <span className="block text-[10px] font-normal text-muted-foreground">÷ {ROOM_CAPACITY[r]}</span>
                  </th>
                ))}
                <th className="border px-2 py-0.5">سعر ليلة التمديد</th>
                <th className="border px-2 py-0.5">تكلفة ليلة التمديد</th>
              </tr>
            </thead>
            <tbody>
              {hotelNames.map((hotel) => (
                <tr key={hotel}>
                  <td className="border px-2 py-0.5 font-bold whitespace-nowrap">{hotel}</td>
                  {ROOM_ROWS.map((r) => (
                    <td key={r} className="border p-1">
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={String(ref.costs[hotel]?.[r] ?? 0)}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          setRef((s) => ({
                            ...s,
                            costs: { ...s.costs, [hotel]: { ...(s.costs[hotel] ?? {}), [r]: v } },
                          }));
                        }}
                      />
                    </td>
                  ))}
                  <td className="border p-1">
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={String(ref.ext[hotel]?.sale ?? 0)}
                      onChange={(e) =>
                        setRef((s) => ({
                          ...s,
                          ext: {
                            ...s.ext,
                            [hotel]: { sale: Number(e.target.value) || 0, cost: s.ext[hotel]?.cost ?? 0 },
                          },
                        }))
                      }
                    />
                  </td>
                  <td className="border p-1">
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={String(ref.ext[hotel]?.cost ?? 0)}
                      onChange={(e) =>
                        setRef((s) => ({
                          ...s,
                          ext: {
                            ...s.ext,
                            [hotel]: { sale: s.ext[hotel]?.sale ?? 0, cost: Number(e.target.value) || 0 },
                          },
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {hotelNames.length === 0 && (
                <tr>
                  <td colSpan={ROOM_ROWS.length + 3} className="p-4 text-center text-muted-foreground">
                    لا توجد فنادق
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="font-bold text-sm mb-1">نسب عمولة المناديب</h4>
          <p className="text-xs text-muted-foreground mb-2">
            تُكتب النسبة كنسبة مئوية (مثال: 10 تعني 10٪). النسبة المرتبطة بالحساب لها الأولوية على النسبة بالاسم.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {repProfiles.map((p) => (
              <div key={p.id}>
                <Label className="text-xs mb-1 block">{p.full_name || "بدون اسم"}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    className="pl-8"
                    value={String(Math.round(((repRates[p.id] ?? 0) as number) * 10000) / 100)}
                    onChange={(e) => setRepRates((s) => ({ ...s, [p.id]: (Number(e.target.value) || 0) / 100 }))}
                    onBlur={(e) => void saveRepRate(p.id, (Number(e.target.value) || 0) / 100)}
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">٪</span>
                </div>
              </div>
            ))}
            {repNames.map((name) => (
              <div key={name}>
                <Label className="text-xs mb-1 block">{name}</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    className="pl-8"
                    value={String(Math.round(((ref.commissions[name] ?? 0) as number) * 10000) / 100)}
                    onChange={(e) =>
                      setRef((s) => ({
                        ...s,
                        commissions: { ...s.commissions, [name]: (Number(e.target.value) || 0) / 100 },
                      }))
                    }
                  />
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">٪</span>
                </div>
              </div>
            ))}
            {repProfiles.length === 0 && repNames.length === 0 && (
              <p className="text-sm text-muted-foreground">لا يوجد مناديب</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HeadCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border px-3 py-2 flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-bold">{v}</span>
    </div>
  );
}

function SettleRow({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between border-b py-1.5 text-sm ${strong ? "font-extrabold" : ""}`}>
      <span className="text-muted-foreground">{k}</span>
      <span>{v}</span>
    </div>
  );
}

function MoneyNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      <Input type="number" value={String(value)} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}
