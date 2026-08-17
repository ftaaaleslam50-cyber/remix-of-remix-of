import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Table2 } from "lucide-react";
import { returnDisplay } from "@/lib/return-display";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sar } from "@/lib/format";
import { ExportSheetDialog, type ExportPayload } from "@/components/admin/ExportSheetDialog";
import { dayNameFromDate } from "@/lib/export/trip-sheet-template";
import {
  ROOM_ROWS,
  ROOM_CAPACITY,
  type HotelPricing,
  type RepCommission,
  type SettlementInput,
} from "@/lib/export/trip-settlement-workbook";

/**
 * "كشف الرحلة" — an Excel-like, auto-filled trip settlement sheet.
 * Mirrors the official workbook: passengers table, rooming statistics,
 * trip expenses, settlement and per-seat cost engine.
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
  trip_id: string | null;
  bus_id: string | null;
  package_id: string | null;
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

export function TripSheetTab() {
  const [tripId, setTripId] = useState("");
  const [busId, setBusId] = useState("");
  const [search, setSearch] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [busySheet, setBusySheet] = useState(false);

  // Trip-sheet header fields that are not stored per bus.
  const [driverName, setDriverName] = useState("");
  const [driverId, setDriverId] = useState("");
  const [driverPhone, setDriverPhone] = useState("");


  // Manual expense inputs (bus-level), mirroring the workbook expense block.
  const [busRent, setBusRent] = useState("1600");
  const [driverTip, setDriverTip] = useState("100");
  const [supervisor, setSupervisor] = useState("200");
  const [parking, setParking] = useState("30");
  const [other, setOther] = useState("0");
  const [bankTransfer, setBankTransfer] = useState("0");
  const [roomNightPrice, setRoomNightPrice] = useState("70");

  const { data: trips = [] } = useQuery({
    queryKey: ["ts-trips"],
    queryFn: async () =>
      ((await supabase.from("trips").select("id,name").eq("active", true).order("display_order")).data ?? []) as Array<{
        id: string;
        name: string;
      }>,
  });

  const { data: buses = [] } = useQuery({
    queryKey: ["ts-buses"],
    queryFn: async () =>
      ((await supabase.from("buses").select("id,name,bus_number,capacity,plate,bus_type,details").order("bus_number"))
        .data ?? []) as Array<{
        id: string;
        name: string | null;
        bus_number: number;
        capacity: number;
        plate: string | null;
        bus_type: string | null;
        details: string | null;
      }>,
  });

  const { data: settings } = useQuery({
    queryKey: ["ts-settings"],
    queryFn: async () =>
      (await supabase.from("app_settings").select("company_name").eq("id", 1).maybeSingle()).data as {
        company_name: string;
      } | null,
  });

  // Hotels (packages) + their sale prices per room type (pricing matrix).
  const { data: hotelRows = [] } = useQuery({
    queryKey: ["ts-hotels"],
    queryFn: async () =>
      ((await supabase.from("packages").select("id,name,active,extension_price").order("display_order")).data ??
        []) as Array<{
        id: string;
        name: string;
        active: boolean;
        extension_price: number | null;
      }>,
  });

  const { data: pricing = [] } = useQuery({
    queryKey: ["ts-pricing"],
    queryFn: async () =>
      ((await supabase.from("pricing_matrix").select("package_id,room_type,price,active")).data ?? []) as Array<{
        package_id: string;
        room_type: string;
        price: number;
        active: boolean;
      }>,
  });


  // Representatives (used for the commission lookup table in sheet "#").
  const { data: repProfiles = [] } = useQuery({
    queryKey: ["ts-reps"],
    queryFn: async () =>
      ((await supabase.from("profiles").select("id,full_name,account_type").eq("account_type", "representative")).data ??
        []) as Array<{ id: string; full_name: string | null; account_type: string }>,
  });


  const { data: rows = [] } = useQuery({
    queryKey: ["ts-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id,booking_code,customer_name,id_number,contact_phone,nationality,booking_source,passenger_count,room_type,booking_type,total_price,status,deleted_at,notes,actual_return_day,extension_nights,trip_id,bus_id,package_id,packages(name),trips(name,departure_day,return_day),buses(id,name,bus_number,capacity,expenses)",
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as SheetBooking[];
    },
  });

  const filtered = useMemo(
    () =>
      rows.filter((b) => {
        if (b.status === "cancelled") return false;
        if (busId && b.bus_id !== busId) return false;
        if (!busId && tripId && b.trip_id !== tripId) return false;
        if (search) {
          const q = search.trim().toLowerCase();
          const hay = `${b.booking_code} ${b.customer_name ?? ""} ${b.id_number ?? ""} ${b.contact_phone ?? ""}`;
          if (!hay.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [rows, tripId, busId, search],
  );

  const bus = buses.find((b) => b.id === busId) ?? null;
  const trip = trips.find((t) => t.id === tripId) ?? null;
  const tripInfo = filtered.find((b) => b.trips)?.trips ?? null;

  const passengers = filtered.reduce((s, b) => s + (b.passenger_count || 0), 0);
  const capacity = bus?.capacity ?? 0;
  const remaining = Math.max(0, capacity - passengers);
  const revenue = filtered.reduce((s, b) => s + Number(b.total_price || 0), 0);

  // Rooming statistics: hotel × room type → people + rooms.
  const rooming = useMemo(() => {
    const map = new Map<string, Map<string, { people: number; rooms: number }>>();
    for (const b of filtered) {
      const hotel = b.packages?.name || "بدون فندق";
      const rt = String(b.room_type ?? "5");
      const inner = map.get(hotel) ?? new Map();
      const cur = inner.get(rt) ?? { people: 0, rooms: 0 };
      cur.people += b.passenger_count || 0;
      // Individuals share a 5-bed room → counted as people, not rooms.
      if (b.booking_type !== "individual") cur.rooms += 1;
      inner.set(rt, cur);
      map.set(hotel, inner);
    }
    return map;
  }, [filtered]);

  const totalRooms = useMemo(() => {
    let n = 0;
    rooming.forEach((inner) => inner.forEach((v) => (n += v.rooms)));
    return n;
  }, [rooming]);

  const housingCost = totalRooms * (Number(roomNightPrice) || 0);
  const expenses =
    housingCost +
    (Number(busRent) || 0) +
    (Number(driverTip) || 0) +
    (Number(supervisor) || 0) +
    (Number(parking) || 0) +
    (Number(other) || 0);
  const profit = revenue - expenses;
  const cashDue = profit - (Number(bankTransfer) || 0);
  const seatCost = passengers > 0 ? expenses / passengers : 0;

  /* ---------------- reference data used by the exported "#" sheet -------- */
  const LS_KEY = "trip-sheet-reference-v1";
  type RefState = {
    costs: Record<string, Record<string, number>>;
    ext: Record<string, { sale: number; cost: number }>;
    commissions: Record<string, number>;
    transfer: Record<string, number>;
  };
  const [ref, setRef] = useState<RefState>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw) as RefState;
      } catch {
        /* ignore */
      }
    }
    return {
      costs: {},
      ext: {},
      commissions: {},
      transfer: { "ذهاب فقط": 50, "ذهاب وعوده فقط": 80, "ذهاب وعوده برحلة اخرى": 90 },
    };
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(ref));
    } catch {
      /* ignore */
    }
  }, [ref]);

  const hotelNames = useMemo(() => {
    const used = new Set(filtered.map((b) => b.packages?.name).filter(Boolean) as string[]);
    const all = hotelRows.filter((h) => h.active).map((h) => h.name);
    return [...new Set([...all, ...used])];
  }, [hotelRows, filtered]);

  const hotelPricings: HotelPricing[] = useMemo(
    () =>
      hotelNames.map((name) => {
        const pkg = hotelRows.find((h) => h.name === name);
        const cells = pricing.filter((p) => p.package_id === pkg?.id && p.active);
        const priceOf = (rt: string) => Number(cells.find((c) => String(c.room_type) === rt)?.price ?? 0);
        const sale: Record<string, number> = {
          فردي: priceOf("1"),
          ثنائي: priceOf("2"),
          ثلاثي: priceOf("3"),
          رباعي: priceOf("4"),
          خماسي: priceOf("5"),
          "مشترك خماسي": priceOf("5"),
          "مشترك رباعي": priceOf("4"),
          "مشترك مشرف": priceOf("4"),
        };
        const cost: Record<string, number> = {};
        for (const room of ROOM_ROWS) cost[room] = Number(ref.costs[name]?.[room] ?? 0);
        return {
          hotel: name,
          sale,
          cost,
          extensionSale: Number(ref.ext[name]?.sale ?? 100),
          extensionCost: Number(ref.ext[name]?.cost ?? 70),
        };
      }),
    [hotelNames, hotelRows, pricing, ref],
  );

  const repNames = useMemo(() => {
    const names = new Set<string>();
    repProfiles.forEach((p) => p.full_name && names.add(p.full_name));
    filtered.forEach((b) => names.add(b.booking_source || "الموقع"));
    return [...names];
  }, [repProfiles, filtered]);

  const reps: RepCommission[] = useMemo(
    () => repNames.map((n) => ({ name: n, rate: Number(ref.commissions[n] ?? 0.75) })),
    [repNames, ref],
  );

  function roomLabelOf(b: SheetBooking): string {
    if (!b.packages?.name) return "ذهاب وعوده فقط";
    if (b.booking_type === "individual") return "مشترك خماسي";
    return ROOM_LABELS[String(b.room_type ?? "5")] ?? "خماسي";
  }

  function settlement(): SettlementInput {
    return {
      header: {
        departureLabel: "ذهاب",
        departureDay: tripInfo?.departure_day ?? "",
        departureDate: "",
        returnLabel: "عوده",
        returnDay: tripInfo?.return_day ?? "",
        returnDate: "",
        capacity: capacity || 0,
        vehicleType: "باص",
        plate: bus?.name ?? "",
        driverName: "",
        driverId: "",
        driverPhone: "",
      },
      rows: filtered.map((b) => ({
        rep: b.booking_source || "الموقع",
        customer: b.customer_name ?? "",
        idNumber: b.id_number ?? "",
        nationality: b.nationality ?? "",
        count: b.passenger_count || 0,
        returnDay: returnDisplay(b.actual_return_day || b.trips?.return_day, b.extension_nights, ""),
        hotel: b.packages?.name ?? "توصيل فقط",
        roomType: roomLabelOf(b),
        roomNumber: "",
        extensionNights: 0,
        notes: b.notes ?? "",
      })),
      hotels: hotelPricings,
      reps,
      expenses: {
        busRent: Number(busRent) || 0,
        driverTip: Number(driverTip) || 0,
        supervisor: Number(supervisor) || 0,
        parking: Number(parking) || 0,
        other: Number(other) || 0,
        bankTransfer: Number(bankTransfer) || 0,
      },
      transferPrices: {
        "ذهاب فقط": Number(ref.transfer["ذهاب فقط"] ?? 0),
        "ذهاب وعوده فقط": Number(ref.transfer["ذهاب وعوده فقط"] ?? 0),
        "ذهاب وعوده برحلة اخرى": Number(ref.transfer["ذهاب وعوده برحلة اخرى"] ?? 0),
      },
    };
  }

  function payload(): ExportPayload {
    const title = `كشف رحلة — ${trip?.name ?? tripInfo?.name ?? "كل الرحلات"}${bus ? ` — ${bus.name || `حافلة ${bus.bus_number}`}` : ""}`;
    return {
      title,
      filename: `trip-sheet-${new Date().toISOString().slice(0, 10)}`,
      header: {
        departureLabel: "ذهاب",
        departureDay: tripInfo?.departure_day ?? dayNameFromDate(undefined),
        returnLabel: "عودة",
        returnDay: tripInfo?.return_day ?? "",
        capacity: capacity || undefined,
        busNumber: bus?.bus_number,
        passengersTotal: passengers,
        seatsRemaining: remaining,
      },
      rows: filtered.map((b, i) => ({
        index: i + 1,
        rep: b.booking_source || "الموقع",
        customer: b.customer_name ?? "",
        idNumber: b.id_number ?? "",
        nationality: b.nationality ?? "",
        count: b.passenger_count || 0,
        returnDay: returnDisplay(b.actual_return_day || b.trips?.return_day, b.extension_nights, ""),
        hotel: b.packages?.name ?? "بدون فندق",
        roomType: ROOM_LABELS[String(b.room_type ?? "5")] ?? String(b.room_type ?? ""),
        total: Number(b.total_price || 0),
        notes: b.notes ?? "",
      })),
      settlement: settlement(),
    };
  }


  return (
    <div className="surface-card p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-extrabold flex items-center gap-2">
          <Table2 className="h-5 w-5" /> كشف الرحلة
          <span className="text-sm font-normal text-muted-foreground">({filtered.length} حجز)</span>
        </h2>
        <Button className="rounded-full" onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4 ml-1" /> تصدير
        </Button>
      </div>

      {/* Filters */}
      <div className="grid gap-3 md:grid-cols-3 rounded-2xl border-2 border-dashed border-border p-3 bg-muted/40">
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
          <Label className="text-xs mb-1 block">الحافلة</Label>
          <select
            value={busId}
            onChange={(e) => setBusId(e.target.value)}
            className="h-10 w-full rounded-md border px-3 text-sm bg-white"
          >
            <option value="">— كل الحافلات —</option>
            {buses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name || `حافلة ${b.bus_number}`} — سعة {b.capacity}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs mb-1 block">بحث</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="الاسم، الهوية، رقم الحجز..." />
        </div>
      </div>

      {/* Trip header block (mirrors rows 1-10 of the workbook) */}
      <div className="grid gap-2 sm:grid-cols-3 text-sm">
        <HeadCell k="الذهاب" v={tripInfo?.departure_day ?? "—"} />
        <HeadCell k="العودة" v={tripInfo?.return_day ?? "—"} />
        <HeadCell k="سعة الحافلة" v={capacity ? String(capacity) : "—"} />
        <HeadCell k="عدد الركاب" v={String(passengers)} />
        <HeadCell k="المقاعد المتبقية" v={bus ? String(remaining) : "—"} />
        <HeadCell k="تكلفة المقعد" v={sar(Math.round(seatCost))} />
      </div>

      {/* Passengers table */}
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs border-collapse">
          <thead className="bg-muted">
            <tr>
              {[
                "م",
                "المندوب",
                "العميل",
                "الهوية / الجواز",
                "الجنسية",
                "العدد",
                "العودة",
                "الفندق",
                "الغرفة",
                "إجمالي الباقة",
                "باقة الفرد",
                "تكلفة المقاعد",
                "ربح الحجز",
                "ملاحظات",
              ].map((h) => (
                <th key={h} className="border p-2 whitespace-nowrap font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((b, i) => {
              const total = Number(b.total_price || 0);
              const perPerson = b.passenger_count ? total / b.passenger_count : 0;
              const seats = (b.passenger_count || 0) * seatCost;
              return (
                <tr key={b.id} className="odd:bg-white even:bg-muted/30">
                  <td className="border p-2 text-center">{i + 1}</td>
                  <td className="border p-2 text-center">{b.booking_source || "الموقع"}</td>
                  <td className="border p-2">{b.customer_name}</td>
                  <td className="border p-2 text-center font-mono">{b.id_number}</td>
                  <td className="border p-2 text-center">{b.nationality ?? "—"}</td>
                  <td className="border p-2 text-center">{b.passenger_count}</td>
                  <td className="border p-2 text-center">{returnDisplay(b.actual_return_day || b.trips?.return_day, b.extension_nights, "—")}</td>
                  <td className="border p-2 text-center">{b.packages?.name ?? "بدون فندق"}</td>
                  <td className="border p-2 text-center">{ROOM_LABELS[String(b.room_type ?? "5")] ?? "—"}</td>
                  <td className="border p-2 text-center font-bold">{total}</td>
                  <td className="border p-2 text-center">{Math.round(perPerson)}</td>
                  <td className="border p-2 text-center">{Math.round(seats)}</td>
                  <td className="border p-2 text-center font-bold">{Math.round(total - seats)}</td>
                  <td className="border p-2">{b.notes ?? ""}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={14} className="p-6 text-center text-muted-foreground">
                  لا توجد بيانات
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="bg-muted font-bold">
            <tr>
              <td className="border p-2 text-center" colSpan={5}>
                الإجمالي
              </td>
              <td className="border p-2 text-center">{passengers}</td>
              <td className="border p-2" colSpan={3} />
              <td className="border p-2 text-center">{revenue}</td>
              <td className="border p-2" colSpan={4} />
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

      {/* Expenses + settlement */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-extrabold">مصروفات الرحلة</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Money label="سعر الغرفة / ليلة" value={roomNightPrice} onChange={setRoomNightPrice} />
            <div>
              <Label className="text-xs mb-1 block">تسكين ({totalRooms} غرفة)</Label>
              <Input value={housingCost} readOnly className="bg-muted" />
            </div>
            <Money label="إيجار الحافلة" value={busRent} onChange={setBusRent} />
            <Money label="إكرامية السائق" value={driverTip} onChange={setDriverTip} />
            <Money label="مشرف الرحلة" value={supervisor} onChange={setSupervisor} />
            <Money label="رسوم المواقف" value={parking} onChange={setParking} />
            <Money label="أخرى" value={other} onChange={setOther} />
          </div>
          <p className="font-bold">إجمالي المصروف: {sar(expenses)}</p>
        </div>

        <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-extrabold">تسوية الرحلة</h3>
          <SettleRow k="إجمالي الإيراد" v={sar(revenue)} />
          <SettleRow k="إجمالي المصروف" v={sar(expenses)} />
          <SettleRow k="صافي الربح" v={sar(profit)} strong />
          <Money label="تحويل بنكي" value={bankTransfer} onChange={setBankTransfer} />
          <SettleRow k="المطلوب كاش" v={sar(cashDue)} strong />
          <SettleRow k="تكلفة المقعد الواحد" v={sar(Math.round(seatCost))} />
        </div>
      </div>

      {/* Reference data feeding sheet "#" of the exported workbook */}
      <div className="rounded-xl border p-4 space-y-4">
        <h3 className="font-extrabold">بيانات الشيت المرجعي (#)</h3>

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
                <th className="border p-2">الفندق</th>
                {ROOM_ROWS.map((r) => (
                  <th key={r} className="border p-2 whitespace-nowrap">
                    تكلفة {r}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      ÷ {ROOM_CAPACITY[r]}
                    </span>
                  </th>
                ))}
                <th className="border p-2">سعر ليلة التمديد</th>
                <th className="border p-2">تكلفة ليلة التمديد</th>
              </tr>
            </thead>
            <tbody>
              {hotelPricings.map((h) => (
                <tr key={h.hotel}>
                  <td className="border p-2 font-bold whitespace-nowrap">{h.hotel}</td>
                  {ROOM_ROWS.map((r) => (
                    <td key={r} className="border p-1">
                      <Input
                        type="number"
                        className="h-8 text-xs"
                        value={String(ref.costs[h.hotel]?.[r] ?? 0)}
                        onChange={(e) =>
                          setRef((s) => ({
                            ...s,
                            costs: {
                              ...s.costs,
                              [h.hotel]: { ...(s.costs[h.hotel] ?? {}), [r]: Number(e.target.value) || 0 },
                            },
                          }))
                        }
                      />
                    </td>
                  ))}
                  <td className="border p-1">
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={String(ref.ext[h.hotel]?.sale ?? 100)}
                      onChange={(e) =>
                        setRef((s) => ({
                          ...s,
                          ext: {
                            ...s.ext,
                            [h.hotel]: {
                              sale: Number(e.target.value) || 0,
                              cost: s.ext[h.hotel]?.cost ?? 70,
                            },
                          },
                        }))
                      }
                    />
                  </td>
                  <td className="border p-1">
                    <Input
                      type="number"
                      className="h-8 text-xs"
                      value={String(ref.ext[h.hotel]?.cost ?? 70)}
                      onChange={(e) =>
                        setRef((s) => ({
                          ...s,
                          ext: {
                            ...s.ext,
                            [h.hotel]: {
                              sale: s.ext[h.hotel]?.sale ?? 100,
                              cost: Number(e.target.value) || 0,
                            },
                          },
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
              {hotelPricings.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-4 text-center text-muted-foreground">
                    لا توجد فنادق
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="font-bold text-sm mb-2">نسب عمولة المندوبين</h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {reps.map((r) => (
              <div key={r.name}>
                <Label className="text-xs mb-1 block">{r.name}</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={String(r.rate)}
                  onChange={(e) =>
                    setRef((s) => ({
                      ...s,
                      commissions: { ...s.commissions, [r.name]: Number(e.target.value) || 0 },
                    }))
                  }
                />
              </div>
            ))}
            {reps.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد مندوبون</p>}
          </div>
        </div>
      </div>

      <ExportSheetDialog open={exportOpen} onOpenChange={setExportOpen} getData={payload} />

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

function Money({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
