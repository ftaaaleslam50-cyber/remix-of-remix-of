
-- Bus details & pricing addition
ALTER TABLE public.buses
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS bus_type text,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS price_addition numeric NOT NULL DEFAULT 0;

-- Allow bookings without hotel / without bus
ALTER TABLE public.bookings
  ALTER COLUMN bus_id DROP NOT NULL,
  ALTER COLUMN hotel_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS no_hotel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_bus boolean NOT NULL DEFAULT false;

-- Let signed-in customers see & manage their own bookings
DROP POLICY IF EXISTS "Users can view their own bookings" ON public.bookings;
CREATE POLICY "Users can view their own bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
CREATE POLICY "Users can update their own bookings"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
