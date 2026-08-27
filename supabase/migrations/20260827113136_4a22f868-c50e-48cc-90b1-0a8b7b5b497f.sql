CREATE OR REPLACE FUNCTION public.enforce_seat_uniqueness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  taken text[];
  blocked text[];
  clash text[];
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.bus_id IS NULL OR NEW.no_bus IS TRUE
     OR NEW.seat_numbers IS NULL OR array_length(NEW.seat_numbers, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  -- duplicate seats inside the same booking
  IF (SELECT count(*) FROM unnest(NEW.seat_numbers) s)
     <> (SELECT count(DISTINCT s) FROM unnest(NEW.seat_numbers) s) THEN
    RAISE EXCEPTION 'تم تكرار نفس المقعد داخل الحجز الواحد.' USING ERRCODE = 'P0001';
  END IF;

  -- serialize concurrent bookings on the same bus
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.bus_id::text, 42));

  SELECT COALESCE(b.blocked_seats, '{}') INTO blocked FROM public.buses b WHERE b.id = NEW.bus_id;
  SELECT array_agg(DISTINCT s) INTO clash
  FROM unnest(NEW.seat_numbers) s
  WHERE s = ANY (COALESCE(blocked, '{}'::text[]));
  IF clash IS NOT NULL AND array_length(clash, 1) > 0 THEN
    RAISE EXCEPTION 'المقاعد التالية غير متاحة للحجز: %', array_to_string(clash, ', ') USING ERRCODE = 'P0001';
  END IF;

  SELECT array_agg(DISTINCT s) INTO taken
  FROM public.bookings b, unnest(b.seat_numbers) s
  WHERE b.bus_id = NEW.bus_id
    AND b.id <> NEW.id
    AND b.deleted_at IS NULL
    AND b.status <> 'cancelled'
    AND s = ANY (NEW.seat_numbers);

  IF taken IS NOT NULL AND array_length(taken, 1) > 0 THEN
    RAISE EXCEPTION 'المقاعد التالية محجوزة بالفعل: %. يرجى تحديث الصفحة واختيار مقاعد أخرى.', array_to_string(taken, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_seat_uniqueness ON public.bookings;
CREATE TRIGGER trg_bookings_seat_uniqueness
BEFORE INSERT OR UPDATE OF seat_numbers, bus_id, status, deleted_at, no_bus ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_seat_uniqueness();