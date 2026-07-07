
-- Tighten booking INSERT policy with real constraints
DROP POLICY IF EXISTS "anyone can create booking" ON public.bookings;
CREATE POLICY "anyone can create booking" ON public.bookings FOR INSERT TO anon, authenticated
WITH CHECK (
  passenger_count > 0
  AND length(customer_name) > 1
  AND length(id_number) > 3
  AND length(contact_phone) > 5
  AND total_price > 0
);

-- Lock down SECURITY DEFINER functions from public API; Postgres still uses them internally for RLS
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_booking_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_booking_code() TO service_role;
