-- 1) Guest (anon) visibility of buses WITHOUT driver PII / financials.
--    anon previously had no SELECT grant at all on buses, so guests saw no buses.
REVOKE SELECT ON public.buses FROM anon;
GRANT SELECT (
  id, trip_id, bus_number, capacity, active, blocked_seats, created_at, updated_at,
  name, plate, model, status, priority, is_active_booking, layout, layout_id,
  image_url, bus_type, details, price_addition, round_trip_price, outbound_price,
  return_price, open_return_price, direction
) ON public.buses TO anon;
GRANT SELECT ON public.buses TO authenticated;
GRANT ALL ON public.buses TO service_role;

DROP POLICY IF EXISTS "buses public read" ON public.buses;
CREATE POLICY "buses public read (no driver pii for guests)"
  ON public.buses FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2) Hotel availability rules
ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS allowed_booking_types text[] NOT NULL DEFAULT ARRAY['individual','family'],
  ADD COLUMN IF NOT EXISTS max_passengers integer,
  ADD COLUMN IF NOT EXISTS trip_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.hotels.allowed_booking_types IS 'individual / family (both by default)';
COMMENT ON COLUMN public.hotels.max_passengers IS 'NULL = no limit';
COMMENT ON COLUMN public.hotels.trip_ids IS 'Empty = available on all trips';