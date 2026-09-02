-- Hotel availability rules live on `packages` (the table that powers the "Hotel" step in the booking wizard).
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS allowed_booking_types text[] NOT NULL DEFAULT ARRAY['individual','family'],
  ADD COLUMN IF NOT EXISTS max_passengers integer,
  ADD COLUMN IF NOT EXISTS trip_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.packages.allowed_booking_types IS 'individual / family (both by default)';
COMMENT ON COLUMN public.packages.max_passengers IS 'NULL = no limit';
COMMENT ON COLUMN public.packages.trip_ids IS 'Empty = available on all trips';