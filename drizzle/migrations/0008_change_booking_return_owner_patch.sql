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
  v_had boolean; v_changed boolean; v_trip uuid; v_set text; v_after public.bookings%ROWTYPE;
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

  IF _return_bus_id IS NOT NULL THEN
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