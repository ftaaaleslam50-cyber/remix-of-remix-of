-- 1) Bus direction: outbound or return only
ALTER TABLE public.buses
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound';
ALTER TABLE public.buses DROP CONSTRAINT IF EXISTS buses_direction_check;
ALTER TABLE public.buses
  ADD CONSTRAINT buses_direction_check CHECK (direction IN ('outbound','return'));

-- 2) Weekly return-trip templates
CREATE TABLE IF NOT EXISTS public.return_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  from_city text NOT NULL DEFAULT 'مكة',
  to_city text NOT NULL DEFAULT 'المدينة',
  weekday smallint NOT NULL DEFAULT 6 CHECK (weekday BETWEEN 0 AND 6),
  return_time time,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.return_trips TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_trips TO authenticated;
GRANT ALL ON public.return_trips TO service_role;
ALTER TABLE public.return_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "return_trips public read" ON public.return_trips;
CREATE POLICY "return_trips public read" ON public.return_trips FOR SELECT USING (true);
DROP POLICY IF EXISTS "return_trips admin write" ON public.return_trips;
CREATE POLICY "return_trips admin write" ON public.return_trips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
DROP TRIGGER IF EXISTS trg_return_trips_updated ON public.return_trips;
CREATE TRIGGER trg_return_trips_updated BEFORE UPDATE ON public.return_trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Manual bus assignment per return trip AND per real date
CREATE TABLE IF NOT EXISTS public.return_trip_buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_trip_id uuid NOT NULL REFERENCES public.return_trips(id) ON DELETE CASCADE,
  trip_date date NOT NULL,
  bus_id uuid NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (return_trip_id, trip_date, bus_id)
);
CREATE INDEX IF NOT EXISTS idx_return_trip_buses_date ON public.return_trip_buses(trip_date);
GRANT SELECT ON public.return_trip_buses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.return_trip_buses TO authenticated;
GRANT ALL ON public.return_trip_buses TO service_role;
ALTER TABLE public.return_trip_buses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "return_trip_buses public read" ON public.return_trip_buses;
CREATE POLICY "return_trip_buses public read" ON public.return_trip_buses FOR SELECT USING (true);
DROP POLICY IF EXISTS "return_trip_buses admin write" ON public.return_trip_buses;
CREATE POLICY "return_trip_buses admin write" ON public.return_trip_buses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 4) Return leg on bookings (independent from the outbound leg)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS return_trip_id uuid REFERENCES public.return_trips(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_bus_id uuid REFERENCES public.buses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_seat_numbers text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS actual_return_date date
  GENERATED ALWAYS AS (
    CASE WHEN trip_mode = 'outbound' THEN NULL
         ELSE return_date + COALESCE(extension_nights, 0) END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_bookings_actual_return_date ON public.bookings(actual_return_date);
CREATE INDEX IF NOT EXISTS idx_bookings_return_bus ON public.bookings(return_bus_id);

-- 5) Return-seat uniqueness per bus per real return date
CREATE OR REPLACE FUNCTION public.enforce_return_seat_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  taken text[];
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF NEW.return_bus_id IS NULL
     OR NEW.return_seat_numbers IS NULL
     OR array_length(NEW.return_seat_numbers, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF (SELECT count(*) FROM unnest(NEW.return_seat_numbers) s)
     <> (SELECT count(DISTINCT s) FROM unnest(NEW.return_seat_numbers) s) THEN
    RAISE EXCEPTION 'تم تكرار نفس مقعد العودة داخل الحجز الواحد.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ret:' || NEW.return_bus_id::text, 42));

  SELECT array_agg(DISTINCT s) INTO taken
  FROM public.bookings b, unnest(b.return_seat_numbers) s
  WHERE b.return_bus_id = NEW.return_bus_id
    AND b.id <> NEW.id
    AND b.deleted_at IS NULL
    AND b.status <> 'cancelled'
    AND b.actual_return_date IS NOT DISTINCT FROM NEW.actual_return_date
    AND s = ANY (NEW.return_seat_numbers);

  IF taken IS NOT NULL AND array_length(taken, 1) > 0 THEN
    RAISE EXCEPTION 'مقاعد العودة التالية محجوزة بالفعل: %', array_to_string(taken, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_return_seat_uniqueness ON public.bookings;
CREATE TRIGGER trg_bookings_return_seat_uniqueness
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_return_seat_uniqueness();