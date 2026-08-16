// Single source of truth for "can bookings be created/edited right now?".
// The authoritative check lives in the database (booking_availability() RPC +
// a BEFORE INSERT/UPDATE trigger on bookings), so the UI can never bypass it.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_BOOKING_UNAVAILABLE_MESSAGE = "الحجز غير متاح حاليًا، يرجى المحاولة لاحقًا.";

export interface BookingAvailability {
  allowed: boolean;
  message: string | null;
}

export async function fetchBookingAvailability(): Promise<BookingAvailability> {
  const { data, error } = await supabase.rpc("booking_availability" as never);
  if (error) return { allowed: true, message: null };
  const res = (data ?? {}) as { allowed?: boolean; message?: string | null };
  return {
    allowed: res.allowed !== false,
    message: res.allowed === false ? (res.message || DEFAULT_BOOKING_UNAVAILABLE_MESSAGE) : null,
  };
}

/** Returns null when booking is allowed, otherwise the admin-configured message. */
export async function bookingBlockedMessage(): Promise<string | null> {
  const a = await fetchBookingAvailability();
  return a.allowed ? null : (a.message ?? DEFAULT_BOOKING_UNAVAILABLE_MESSAGE);
}

export function useBookingAvailability() {
  return useQuery({
    queryKey: ["booking-availability"],
    queryFn: fetchBookingAvailability,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
