import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ExportSheetDialog, type ExportPayload } from "@/components/admin/ExportSheetDialog";
import { formatTripDate } from "@/lib/trip-dates";
import type { ReturnBookingRow, ReturnLookups } from "@/components/admin/ReturnTripsManager";

const ROOM: Record<string, string> = { "1": "فردي", "2": "ثنائي", "3": "ثلاثي", "4": "رباعي", "5": "خماسي" };

/** كشف حافلة العودة بنفس النموذج الرسمي لكشف الذهاب (PDF / Excel). */
export function ReturnSheetExportButton({
  bookings,
  buses,
  retBus,
  lookups,
  date,
  tripName,
}: {
  bookings: ReturnBookingRow[];
  buses: { id: string; name: string | null; bus_number: number; capacity: number }[];
  retBus: string;
  lookups: ReturnLookups;
  date: string;
  tripName?: string;
}) {
  const [open, setOpen] = useState(false);
  const busId = retBus && retBus !== "__none" ? retBus : "";
  const details = useQuery({
    queryKey: ["return-sheet-bus", busId],
    enabled: !!busId,
    queryFn: async () => {
      const { data } = await supabase
        .from("buses")
        .select("id,name,bus_number,capacity,plate,driver_name,driver_phone,driver_id_number,supervisor_name")
        .eq("id", busId)
        .maybeSingle();
      return data as Record<string, unknown> | null;
    },
  });

  function payload(): ExportPayload {
    const bus = buses.find((b) => b.id === busId);
    const d = (details.data ?? {}) as Record<string, string | number | null>;
    const label = bus ? bus.name || `حافلة ${bus.bus_number}` : "";
    const rows = busId ? bookings.filter((b) => b.return_bus_id === busId) : bookings;
    const sorted = rows.slice().sort((a, b) => lookups.hotelName(a).localeCompare(lookups.hotelName(b), "ar"));
    const total = sorted.reduce((s, b) => s + (b.passenger_count || 0), 0);
    return {
      title: `كشف رحلة عودة${tripName ? ` — ${tripName}` : ""}${label ? ` — ${label}` : ""}`,
      filename: `return-sheet-${label || date}-${date}`,
      header: {
        departureDate: formatTripDate(date),
        returnDate: formatTripDate(date),
        capacity: bus?.capacity,
        busNumber: bus ? bus.bus_number : "",
        driverName: String(d.driver_name ?? ""),
        supervisorName: String(d.supervisor_name ?? ""),
        plate: String(d.plate ?? ""),
        driverId: String(d.driver_id_number ?? ""),
        driverPhone: String(d.driver_phone ?? ""),
        passengersTotal: total,
        seatsRemaining: bus ? Math.max(0, bus.capacity - total) : undefined,
      },
      rows: sorted.map((b) => ({
        rep: b.rep_name || b.booking_source || "الموقع",
        customer: b.customer_name ?? "",
        idNumber: b.id_number ?? "",
        nationality: b.nationality ?? "",
        count: b.passenger_count || 0,
        returnDay: formatTripDate(b.actual_return_date),
        hotel: lookups.hotelName(b),
        roomType: b.booking_type === "individual" ? "خماسي مشترك" : (ROOM[String(b.room_type ?? "")] ?? ""),
        packageTotal: Number(b.total_price || 0),
        extensionNights: Number(b.extension_nights ?? 0),
        notes: [b.return_seat_numbers?.length ? `مقاعد العودة ${b.return_seat_numbers.join("، ")}` : "", b.notes ?? ""]
          .filter(Boolean)
          .join(" — "),
      })),
    };
  }

  return (
    <>
      <ExportSheetDialog open={open} onOpenChange={setOpen} getData={payload} />
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        onClick={() => {
          if (!busId) toast.info("سيُصدَّر كل ركاب التاريخ — اختر «حافلة العودة» من الفلاتر لكشف حافلة واحدة");
          setOpen(true);
        }}
      >
        <FileText className="h-4 w-4 ml-1" /> كشف الحافلة PDF
      </Button>
    </>
  );
}
