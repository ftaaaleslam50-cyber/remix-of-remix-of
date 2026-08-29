-- 1) Real dates on the weekly trip template
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS return_date date,
  ADD COLUMN IF NOT EXISTS auto_advance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS recurrence_weeks integer NOT NULL DEFAULT 1;

-- 2) Snapshot real dates onto bookings so past bookings keep their dates
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS departure_date date,
  ADD COLUMN IF NOT EXISTS return_date date;

-- 3) History of finished occurrences (with the buses that were assigned then)
CREATE TABLE IF NOT EXISTS public.trip_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  departure_date date NOT NULL,
  departure_time time,
  return_date date,
  bus_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trip_id, departure_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_occurrences TO authenticated;
GRANT ALL ON public.trip_occurrences TO service_role;

ALTER TABLE public.trip_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_occurrences staff read"
  ON public.trip_occurrences FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'user_manager'));

CREATE POLICY "trip_occurrences staff write"
  ON public.trip_occurrences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_trip_occurrences_updated
  BEFORE UPDATE ON public.trip_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Auto-advance finished weekly trips to their next occurrence
CREATE OR REPLACE FUNCTION public.advance_due_trips()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.trips%ROWTYPE;
  deadline timestamptz;
  step integer;
  moved integer := 0;
  guard integer;
BEGIN
  FOR t IN
    SELECT * FROM public.trips
    WHERE auto_advance IS TRUE AND departure_date IS NOT NULL
  LOOP
    step := GREATEST(COALESCE(t.recurrence_weeks, 1), 1) * 7;
    guard := 0;
    LOOP
      deadline := ((t.departure_date + COALESCE(t.departure_time, TIME '23:59')) AT TIME ZONE 'Asia/Riyadh');
      EXIT WHEN deadline > now() OR guard > 520;
      guard := guard + 1;

      INSERT INTO public.trip_occurrences (trip_id, departure_date, departure_time, return_date, bus_ids)
      VALUES (
        t.id, t.departure_date, t.departure_time, t.return_date,
        COALESCE((SELECT array_agg(tb.bus_id) FROM public.trip_buses tb WHERE tb.trip_id = t.id), '{}')
      )
      ON CONFLICT (trip_id, departure_date) DO NOTHING;

      -- buses are assigned manually for every new occurrence
      DELETE FROM public.trip_buses WHERE trip_id = t.id;

      t.departure_date := t.departure_date + step;
      IF t.return_date IS NOT NULL THEN
        t.return_date := t.return_date + step;
      END IF;
      moved := moved + 1;
    END LOOP;

    IF guard > 0 THEN
      UPDATE public.trips
      SET departure_date = t.departure_date,
          return_date = t.return_date
      WHERE id = t.id;
    END IF;
  END LOOP;

  RETURN moved;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_due_trips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_due_trips() TO anon, authenticated, service_role;