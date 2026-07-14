
-- Relax INSERT policy on bookings so guest, customer, representative, and admin flows all succeed.
-- Client wizard already validates required fields; RLS should not silently block short inputs.
DROP POLICY IF EXISTS "anyone can create booking" ON public.bookings;

CREATE POLICY "anyone can create booking"
ON public.bookings
FOR INSERT
TO public
WITH CHECK (
  passenger_count > 0
  AND length(coalesce(customer_name, '')) > 0
  AND length(coalesce(contact_phone, '')) > 0
);
