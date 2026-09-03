ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS bookings_closed boolean NOT NULL DEFAULT false;

-- Reset the flag whenever a trip rolls over to its next weekly date.
CREATE OR REPLACE FUNCTION public.advance_due_trips()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t public.trips%ROWTYPE;
  deadline timestamptz;
  step integer;
  moved integer := 0;
  guard integer;
  old_bus public.buses%ROWTYPE;
  new_bus_id uuid;
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

      IF t.clone_buses_on_advance THEN
        FOR old_bus IN
          SELECT b.* FROM public.buses b
          JOIN public.trip_buses tb ON tb.bus_id = b.id
          WHERE tb.trip_id = t.id
        LOOP
          INSERT INTO public.buses (
            bus_number, name, capacity, layout, layout_id, image_url, bus_type, details,
            price_addition, round_trip_price, outbound_price, return_price, open_return_price, direction,
            status, active, trip_id, blocked_seats,
            driver_name, driver_phone, driver_id_number, plate, model
          ) VALUES (
            old_bus.bus_number, old_bus.name, old_bus.capacity, old_bus.layout, old_bus.layout_id,
            old_bus.image_url, old_bus.bus_type, old_bus.details,
            old_bus.price_addition, old_bus.round_trip_price, old_bus.outbound_price, old_bus.return_price, old_bus.open_return_price,
            old_bus.direction, 'active', true, t.id, old_bus.blocked_seats,
            NULL, NULL, NULL, NULL, old_bus.model
          )
          RETURNING id INTO new_bus_id;

          INSERT INTO public.trip_buses (trip_id, bus_id)
          VALUES (t.id, new_bus_id)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END IF;

      DELETE FROM public.trip_buses tb
      WHERE tb.trip_id = t.id
        AND tb.bus_id IN (
          SELECT unnest(bus_ids) FROM public.trip_occurrences
          WHERE trip_id = t.id AND departure_date = t.departure_date
        );

      t.departure_date := t.departure_date + step;
      IF t.return_date IS NOT NULL THEN
        t.return_date := t.return_date + step;
      END IF;
      moved := moved + 1;
    END LOOP;

    IF guard > 0 THEN
      UPDATE public.trips
      SET departure_date = t.departure_date,
          return_date = t.return_date,
          bookings_closed = false
      WHERE id = t.id;
    END IF;
  END LOOP;

  RETURN moved;
END;
$function$;

-- Block new bookings on closed trips for non-staff callers.
CREATE OR REPLACE FUNCTION public.enforce_trip_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  closed boolean;
BEGIN
  IF NEW.trip_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.trip_id IS NOT DISTINCT FROM OLD.trip_id THEN RETURN NEW; END IF;
  IF uid IS NOT NULL AND (public.has_role(uid, 'admin') OR public.has_role(uid, 'manager') OR public.has_role(uid, 'user_manager')) THEN
    RETURN NEW;
  END IF;
  SELECT bookings_closed INTO closed FROM public.trips WHERE id = NEW.trip_id;
  IF closed IS TRUE THEN
    RAISE EXCEPTION 'تم التوقف عن استقبال الحجوزات لهذه الرحلة.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_trip_open ON public.bookings;
CREATE TRIGGER trg_enforce_trip_open
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_trip_open();