CREATE OR REPLACE FUNCTION public.enforce_booking_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_staff boolean := false;
  hotel_price numeric := 0;
  bus_price numeric := 0;
  expected_pp numeric := 0;
  max_discount numeric := 0;
  ext_price numeric := 0;
  ext_total numeric := 0;
  c record;
BEGIN
  IF NEW.no_hotel IS TRUE OR NEW.package_id IS NULL THEN
    NEW.extension_nights := 0;
  END IF;
  IF COALESCE(NEW.extension_nights, 0) < 0 THEN
    RAISE EXCEPTION 'عدد ليالي التمديد غير صالح' USING ERRCODE = 'P0001';
  END IF;
  NEW.extension_nights := COALESCE(NEW.extension_nights, 0);

  IF NEW.trip_mode IS NULL OR NEW.trip_mode NOT IN ('round','outbound','return','round_open') THEN
    NEW.trip_mode := 'round';
  END IF;
  IF NEW.trip_mode = 'outbound' THEN
    NEW.actual_return_day := NULL;
    NEW.return_bus_id := NULL;
    NEW.return_seat_numbers := '{}'::text[];
    NEW.return_trip_id := NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    is_staff := public.has_role(auth.uid(), 'admin')
             OR public.has_role(auth.uid(), 'manager')
             OR public.has_role(auth.uid(), 'representative');
  END IF;

  IF is_staff THEN
    RETURN NEW;
  END IF;

  IF NEW.no_hotel IS NOT TRUE AND NEW.package_id IS NOT NULL THEN
    SELECT pm.price INTO hotel_price
    FROM public.pricing_matrix pm
    WHERE pm.package_id = NEW.package_id
      AND pm.active
      AND pm.room_type::text = NEW.room_type::text
    LIMIT 1;
    hotel_price := COALESCE(hotel_price, 0);

    SELECT COALESCE(p.extension_price, 0) INTO ext_price
    FROM public.packages p WHERE p.id = NEW.package_id;
    ext_total := COALESCE(ext_price, 0) * COALESCE(NEW.extension_nights, 0);
  END IF;

  IF NEW.no_bus IS NOT TRUE AND NEW.bus_id IS NOT NULL THEN
    SELECT CASE NEW.trip_mode
             WHEN 'outbound' THEN COALESCE(NULLIF(b.outbound_price, 0), b.price_addition, 0)
             WHEN 'return' THEN COALESCE(NULLIF(b.return_price, 0), b.price_addition, 0)
             WHEN 'round_open' THEN COALESCE(NULLIF(b.open_return_price, 0), NULLIF(b.round_trip_price, 0), b.price_addition, 0)
             ELSE COALESCE(NULLIF(b.round_trip_price, 0), b.price_addition, 0)
           END
      INTO bus_price
    FROM public.buses b WHERE b.id = NEW.bus_id;
    bus_price := COALESCE(bus_price, 0);
  END IF;

  expected_pp := hotel_price + bus_price;

  IF NEW.coupon_code IS NOT NULL AND btrim(NEW.coupon_code) <> '' THEN
    SELECT * INTO c FROM public.coupons
    WHERE upper(code) = upper(btrim(NEW.coupon_code))
      AND active
      AND used IS NOT TRUE
      AND (start_date IS NULL OR start_date <= now())
      AND expiry_date >= now()
    LIMIT 1;

    IF FOUND THEN
      IF c.prize_type ILIKE '%percent%' THEN
        max_discount := ROUND(expected_pp * GREATEST(NEW.passenger_count, 1) * (COALESCE(c.prize_value, 0) / 100.0), 2);
      ELSE
        max_discount := COALESCE(c.prize_value, 0);
      END IF;
      IF expected_pp * GREATEST(NEW.passenger_count, 1) < COALESCE(c.min_booking_amount, 0) THEN
        max_discount := 0;
      END IF;
    ELSE
      NEW.coupon_code := NULL;
      max_discount := 0;
    END IF;
  END IF;

  NEW.price_per_person := expected_pp;
  NEW.discount_amount := LEAST(GREATEST(COALESCE(NEW.discount_amount, 0), 0), max_discount);
  NEW.total_price := GREATEST(expected_pp * GREATEST(NEW.passenger_count, 1) - NEW.discount_amount, 0) + COALESCE(ext_total, 0);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.change_booking_return(
  _booking_id uuid,
  _nights integer DEFAULT NULL,
  _return_date date DEFAULT NULL,
  _return_bus_id uuid DEFAULT NULL,
  _seats text[] DEFAULT NULL,
  _allow_unassigned boolean DEFAULT false,
  _patch jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b public.bookings%ROWTYPE; is_mgr boolean; v_nights int; v_ret date; v_date date;
  v_had boolean; v_outbound boolean; v_changed boolean; v_trip uuid; v_set text; v_after public.bookings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  is_mgr := public.can_manage_bookings(auth.uid());
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR b.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'الحجز غير موجود'; END IF;
  IF NOT is_mgr AND b.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF _nights IS NOT NULL AND _nights < 0 THEN RAISE EXCEPTION 'عدد ليالي التمديد غير صالح'; END IF;

  v_nights := COALESCE(_nights, b.extension_nights, 0);
  v_ret := COALESCE(_return_date, b.return_date);
  v_date := v_ret + v_nights;
  v_had := b.return_bus_id IS NOT NULL AND COALESCE(array_length(b.return_seat_numbers, 1), 0) > 0;
  v_changed := v_date IS DISTINCT FROM (b.return_date + COALESCE(b.extension_nights, 0));
  v_outbound := COALESCE(_patch->>'trip_mode', b.trip_mode) = 'outbound';

  IF v_outbound THEN
    IF _return_bus_id IS NOT NULL THEN RAISE EXCEPTION 'حجز الذهاب فقط لا يقبل مقاعد عودة.'; END IF;
    UPDATE public.bookings SET trip_mode = 'outbound', extension_nights = v_nights, return_date = NULL,
      return_bus_id = NULL, return_trip_id = NULL, return_seat_numbers = '{}'::text[], updated_by = auth.uid()
    WHERE id = _booking_id;
  ELSIF _return_bus_id IS NOT NULL THEN
    IF b.trip_mode = 'outbound' THEN RAISE EXCEPTION 'حجز الذهاب فقط لا يقبل مقاعد عودة.'; END IF;
    IF COALESCE(array_length(_seats, 1), 0) <> b.passenger_count THEN
      RAISE EXCEPTION 'يجب اختيار % مقعد عودة في حافلة واحدة', b.passenger_count;
    END IF;
    SELECT return_trip_id INTO v_trip FROM public.return_trip_buses
      WHERE bus_id = _return_bus_id AND trip_date = v_date LIMIT 1;
    IF v_trip IS NULL THEN RAISE EXCEPTION 'حافلة العودة غير مربوطة بتاريخ %', v_date; END IF;
    UPDATE public.bookings SET extension_nights = v_nights, return_date = v_ret,
      return_bus_id = _return_bus_id, return_trip_id = v_trip, return_seat_numbers = _seats,
      updated_by = auth.uid()
    WHERE id = _booking_id;
  ELSIF v_had AND v_changed THEN
    IF NOT _allow_unassigned THEN
      RAISE EXCEPTION 'RETURN_SEAT_REQUIRED: اختر مقعد عودة في التاريخ الجديد أو وافق على الحفظ دون مقعد مؤكد.';
    END IF;
    UPDATE public.bookings SET extension_nights = v_nights, return_date = v_ret,
      return_bus_id = NULL, return_seat_numbers = '{}'::text[], updated_by = auth.uid()
    WHERE id = _booking_id;
  ELSE
    UPDATE public.bookings SET extension_nights = v_nights, return_date = v_ret, updated_by = auth.uid()
    WHERE id = _booking_id;
  END IF;

  IF _patch IS NOT NULL AND _patch <> '{}'::jsonb THEN
    SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_set
    FROM jsonb_object_keys(_patch) k
    WHERE k IN (SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings')
      AND k NOT IN ('id','booking_code','created_at','created_by','actual_return_date','extension_nights','return_date',
                    'return_bus_id','return_seat_numbers','return_trip_id','deleted_at','updated_at');
    IF v_set IS NOT NULL THEN
      EXECUTE format('UPDATE public.bookings t SET %s FROM jsonb_populate_record(NULL::public.bookings, $1) r WHERE t.id = $2', v_set)
        USING _patch, _booking_id;
    END IF;
  END IF;

  SELECT * INTO v_after FROM public.bookings WHERE id = _booking_id;
  RETURN jsonb_build_object('ok', true, 'actual_return_date', v_after.actual_return_date,
    'extension_nights', v_after.extension_nights, 'return_bus_id', v_after.return_bus_id,
    'return_seat_numbers', to_jsonb(v_after.return_seat_numbers));
END $function$;