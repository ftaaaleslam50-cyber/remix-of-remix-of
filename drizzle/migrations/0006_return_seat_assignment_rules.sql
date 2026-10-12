ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS return_seat_selection_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS return_extra_threshold integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS return_planning_capacity integer NOT NULL DEFAULT 48;

-- Real sellable seat labels of a bus: layout seats (non-disabled) or 1..capacity, minus blocked seats, capped by capacity.
CREATE OR REPLACE FUNCTION public.bus_seat_labels(_bus_id uuid)
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_cap int; v_layout jsonb; v_blocked text[]; v_labels text[];
BEGIN
  SELECT b.capacity, l.layout_json, COALESCE(b.blocked_seats, '{}')
    INTO v_cap, v_layout, v_blocked
  FROM public.buses b LEFT JOIN public.bus_layouts l ON l.id = b.layout_id
  WHERE b.id = _bus_id;
  IF NOT FOUND THEN RETURN '{}'; END IF;
  IF v_layout IS NOT NULL AND jsonb_typeof(v_layout->'cells') = 'array' THEN
    SELECT array_agg(lbl) INTO v_labels FROM (
      SELECT CASE WHEN COALESCE(btrim(c->>'label'), '') <> '' THEN c->>'label'
                  ELSE (c->>'row') || '-' || (c->>'col') END AS lbl
      FROM jsonb_array_elements(v_layout->'cells') c
      WHERE c->>'kind' = 'seat' AND COALESCE((c->>'disabled')::boolean, false) = false
    ) x;
  END IF;
  IF v_labels IS NULL OR array_length(v_labels, 1) IS NULL THEN
    SELECT array_agg(g::text ORDER BY g) INTO v_labels FROM generate_series(1, GREATEST(COALESCE(v_cap, 0), 0)) g;
  END IF;
  SELECT array_agg(s) INTO v_labels FROM unnest(COALESCE(v_labels, '{}')) s WHERE NOT (s = ANY (v_blocked));
  RETURN COALESCE(v_labels, '{}');
END $$;

-- Return-seat validation: uniqueness per bus+real return date, bus must be linked to the return trip on that date,
-- seats must exist on the bus and never exceed capacity. Unchanged legacy rows are left as-is.
CREATE OR REPLACE FUNCTION public.enforce_return_seat_uniqueness()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  taken text[]; v_date date; v_labels text[]; v_invalid text[]; v_cap int; v_used int; v_link uuid;
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF NEW.return_bus_id IS NULL OR NEW.return_seat_numbers IS NULL
     OR array_length(NEW.return_seat_numbers, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.return_bus_id IS NOT DISTINCT FROM OLD.return_bus_id
     AND NEW.return_seat_numbers IS NOT DISTINCT FROM OLD.return_seat_numbers
     AND NEW.return_trip_id IS NOT DISTINCT FROM OLD.return_trip_id
     AND NEW.return_date IS NOT DISTINCT FROM OLD.return_date
     AND NEW.extension_nights IS NOT DISTINCT FROM OLD.extension_nights
     AND NEW.trip_mode IS NOT DISTINCT FROM OLD.trip_mode
     AND OLD.deleted_at IS NULL AND OLD.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.trip_mode = 'outbound' THEN
    RAISE EXCEPTION 'حجز الذهاب فقط لا يقبل مقاعد عودة.' USING ERRCODE = 'P0001';
  END IF;

  -- generated column is not computed yet in BEFORE triggers
  v_date := NEW.return_date + COALESCE(NEW.extension_nights, 0);
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'لا يمكن إسناد مقعد عودة قبل تحديد تاريخ العودة الفعلي.' USING ERRCODE = 'P0001';
  END IF;

  IF (SELECT count(*) FROM unnest(NEW.return_seat_numbers) s)
     <> (SELECT count(DISTINCT s) FROM unnest(NEW.return_seat_numbers) s) THEN
    RAISE EXCEPTION 'تم تكرار نفس مقعد العودة داخل الحجز الواحد.' USING ERRCODE = 'P0001';
  END IF;

  SELECT rtb.return_trip_id INTO v_link FROM public.return_trip_buses rtb
  WHERE rtb.bus_id = NEW.return_bus_id AND rtb.trip_date = v_date
    AND (NEW.return_trip_id IS NULL OR rtb.return_trip_id = NEW.return_trip_id)
  LIMIT 1;
  IF v_link IS NULL THEN
    RAISE EXCEPTION 'حافلة العودة غير مربوطة برحلة العودة في تاريخ %.', v_date USING ERRCODE = 'P0001';
  END IF;
  NEW.return_trip_id := COALESCE(NEW.return_trip_id, v_link);

  v_labels := public.bus_seat_labels(NEW.return_bus_id);
  SELECT array_agg(s) INTO v_invalid FROM unnest(NEW.return_seat_numbers) s WHERE NOT (s = ANY (v_labels));
  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'مقاعد العودة التالية غير موجودة في مخطط الحافلة: %', array_to_string(v_invalid, ', ') USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ret:' || NEW.return_bus_id::text, 42));

  SELECT array_agg(DISTINCT s) INTO taken
  FROM public.bookings b, unnest(b.return_seat_numbers) s
  WHERE b.return_bus_id = NEW.return_bus_id AND b.id <> NEW.id
    AND b.deleted_at IS NULL AND b.status <> 'cancelled'
    AND b.actual_return_date = v_date
    AND s = ANY (NEW.return_seat_numbers);
  IF taken IS NOT NULL AND array_length(taken, 1) > 0 THEN
    RAISE EXCEPTION 'مقاعد العودة التالية محجوزة بالفعل: %', array_to_string(taken, ', ') USING ERRCODE = 'P0001';
  END IF;

  SELECT LEAST(COALESCE(bu.capacity, 0), array_length(v_labels, 1)) INTO v_cap FROM public.buses bu WHERE bu.id = NEW.return_bus_id;
  SELECT count(DISTINCT s) INTO v_used
  FROM public.bookings b, unnest(b.return_seat_numbers) s
  WHERE b.return_bus_id = NEW.return_bus_id AND b.id <> NEW.id
    AND b.deleted_at IS NULL AND b.status <> 'cancelled'
    AND b.actual_return_date = v_date AND s = ANY (v_labels);
  IF v_used + array_length(NEW.return_seat_numbers, 1) > COALESCE(v_cap, 0) THEN
    RAISE EXCEPTION 'تجاوز سعة حافلة العودة (السعة %، المشغول %).', v_cap, v_used USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_return_seat_uniqueness() FROM PUBLIC, anon, authenticated;

-- Public read of return buses linked to a real return date and their occupied seats (no customer data).
CREATE OR REPLACE FUNCTION public.get_return_occupancy(_date date, _exclude_code text DEFAULT NULL)
RETURNS TABLE(bus_id uuid, return_trip_id uuid, return_trip_name text, bus_name text, bus_number integer,
              capacity integer, layout_id uuid, seat_labels text[], taken text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT bu.id, rt.id, rt.name, bu.name, bu.bus_number, bu.capacity, bu.layout_id,
         public.bus_seat_labels(bu.id),
         COALESCE((SELECT array_agg(DISTINCT s) FROM public.bookings b, unnest(b.return_seat_numbers) s
                   WHERE b.return_bus_id = bu.id AND b.actual_return_date = _date
                     AND b.deleted_at IS NULL AND b.status <> 'cancelled'
                     AND (_exclude_code IS NULL OR b.booking_code <> _exclude_code)), '{}')
  FROM public.return_trip_buses rtb
  JOIN public.return_trips rt ON rt.id = rtb.return_trip_id AND rt.active
  JOIN public.buses bu ON bu.id = rtb.bus_id AND bu.active
  WHERE rtb.trip_date = _date
  ORDER BY rt.display_order, bu.bus_number;
$$;
GRANT EXECUTE ON FUNCTION public.get_return_occupancy(date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bus_seat_labels(uuid) TO anon, authenticated;

-- Atomic extension change: new nights + new return assignment in one statement; failure keeps everything as before.
CREATE OR REPLACE FUNCTION public.change_booking_extension(_booking_id uuid, _nights integer,
  _return_bus_id uuid DEFAULT NULL, _seats text[] DEFAULT NULL, _clear_assignment boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE b public.bookings%ROWTYPE; v_date date; v_trip uuid;
BEGIN
  IF NOT public.can_manage_bookings(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _nights IS NULL OR _nights < 0 THEN RAISE EXCEPTION 'عدد ليالي التمديد غير صالح'; END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحجز غير موجود'; END IF;
  v_date := b.return_date + _nights;

  IF _return_bus_id IS NOT NULL THEN
    IF COALESCE(array_length(_seats, 1), 0) <> b.passenger_count THEN
      RAISE EXCEPTION 'يجب اختيار % مقعد عودة', b.passenger_count;
    END IF;
    SELECT return_trip_id INTO v_trip FROM public.return_trip_buses
      WHERE bus_id = _return_bus_id AND trip_date = v_date LIMIT 1;
    UPDATE public.bookings SET extension_nights = _nights, return_bus_id = _return_bus_id,
      return_trip_id = v_trip, return_seat_numbers = _seats, updated_by = auth.uid()
    WHERE id = _booking_id;
  ELSIF b.return_bus_id IS NOT NULL AND COALESCE(array_length(b.return_seat_numbers, 1), 0) > 0
        AND _nights <> b.extension_nights AND NOT _clear_assignment THEN
    RAISE EXCEPTION 'للحجز مقعد عودة مؤكد؛ اختر مقعدًا في التاريخ الجديد أو أكّد إلغاء الإسناد صراحةً.';
  ELSE
    UPDATE public.bookings SET extension_nights = _nights,
      return_bus_id = CASE WHEN _clear_assignment THEN NULL ELSE return_bus_id END,
      return_seat_numbers = CASE WHEN _clear_assignment THEN '{}'::text[] ELSE return_seat_numbers END,
      updated_by = auth.uid()
    WHERE id = _booking_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'actual_return_date', v_date);
END $$;
REVOKE EXECUTE ON FUNCTION public.change_booking_extension(uuid, integer, uuid, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_booking_extension(uuid, integer, uuid, text[], boolean) TO authenticated;