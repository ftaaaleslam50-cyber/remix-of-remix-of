CREATE OR REPLACE FUNCTION public.move_booking_outbound(_booking_id uuid, _target_bus_id uuid, _seats text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  b public.bookings%ROWTYPE;
  after_row public.bookings%ROWTYPE;
  tb public.buses%ROWTYPE;
  labels text[];
  bad text[];
  taken text[];
  new_genders jsonb := '{}'::jsonb;
  old_g jsonb;
  i int;
  g text;
  n int := COALESCE(cardinality(_seats), 0);
  ignore_keys text[] := ARRAY['bus_id','seat_numbers','seat_genders','updated_at','updated_by'];
BEGIN
  IF uid IS NULL OR NOT public.can_manage_bookings(uid) THEN
    RAISE EXCEPTION 'لا تملك صلاحية نقل الحجوزات.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND OR b.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'الحجز غير موجود أو محذوف.' USING ERRCODE='P0001'; END IF;
  IF b.status = 'cancelled' THEN RAISE EXCEPTION 'الحجز ملغي ولا يمكن نقله.' USING ERRCODE='P0001'; END IF;
  IF b.no_bus IS TRUE OR b.bus_id IS NULL THEN RAISE EXCEPTION 'الحجز غير مرتبط بحافلة ذهاب.' USING ERRCODE='P0001'; END IF;
  IF COALESCE(cardinality(b.seat_numbers),0) <> b.passenger_count THEN
    RAISE EXCEPTION 'مقاعد الحجز الحالية (%) لا تطابق عدد أفراده (%).', COALESCE(cardinality(b.seat_numbers),0), b.passenger_count USING ERRCODE='P0001';
  END IF;
  IF n <> b.passenger_count THEN
    RAISE EXCEPTION 'يجب اختيار % مقعدًا بالضبط (المختار %).', b.passenger_count, n USING ERRCODE='P0001';
  END IF;
  IF (SELECT count(DISTINCT s) FROM unnest(_seats) s) <> n THEN RAISE EXCEPTION 'تكرار مقعد في الاختيار.' USING ERRCODE='P0001'; END IF;

  SELECT * INTO tb FROM public.buses WHERE id = _target_bus_id;
  IF NOT FOUND OR tb.active IS NOT TRUE THEN RAISE EXCEPTION 'الحافلة المستهدفة غير متاحة.' USING ERRCODE='P0001'; END IF;
  IF COALESCE(tb.direction,'outbound') = 'return' THEN RAISE EXCEPTION 'الحافلة المستهدفة حافلة عودة.' USING ERRCODE='P0001'; END IF;
  IF tb.assigned_date IS NOT NULL AND b.departure_date IS NOT NULL AND tb.assigned_date <> b.departure_date THEN
    RAISE EXCEPTION 'الحافلة المستهدفة مخصصة لتاريخ مختلف عن تاريخ رحلة الحجز.' USING ERRCODE='P0001';
  END IF;
  IF b.trip_id IS NOT NULL AND tb.id <> b.bus_id
     AND NOT (tb.trip_id = b.trip_id OR EXISTS (SELECT 1 FROM public.trip_buses WHERE trip_id = b.trip_id AND bus_id = tb.id)
              OR (tb.assigned_date IS NOT NULL AND tb.assigned_date = b.departure_date)) THEN
    RAISE EXCEPTION 'الحافلة المستهدفة غير مرتبطة برحلة الحجز.' USING ERRCODE='P0001';
  END IF;

  labels := public.bus_seat_labels(tb.id);
  SELECT array_agg(s) INTO bad FROM unnest(_seats) s WHERE NOT (s = ANY(COALESCE(labels,'{}')) ) OR s = ANY(COALESCE(tb.blocked_seats,'{}'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'مقاعد غير صالحة في الحافلة المستهدفة: %', array_to_string(bad, ', ') USING ERRCODE='P0001'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(tb.id::text, 42));
  SELECT array_agg(DISTINCT s) INTO taken FROM public.bookings x, unnest(x.seat_numbers) s
   WHERE x.bus_id = tb.id AND x.id <> b.id AND x.deleted_at IS NULL AND x.status <> 'cancelled' AND s = ANY(_seats);
  IF taken IS NOT NULL THEN RAISE EXCEPTION 'المقاعد التالية أصبحت محجوزة: %', array_to_string(taken, ', ') USING ERRCODE='P0001'; END IF;

  old_g := COALESCE(b.seat_genders, '{}'::jsonb);
  FOR i IN 1..n LOOP
    g := old_g ->> b.seat_numbers[i];
    IF g IS NULL THEN g := CASE WHEN i <= COALESCE(b.male_count,0) THEN 'male' ELSE 'female' END; END IF;
    new_genders := new_genders || jsonb_build_object(_seats[i], g);
  END LOOP;

  UPDATE public.bookings SET bus_id = tb.id, seat_numbers = _seats, seat_genders = new_genders, updated_by = uid
   WHERE id = b.id RETURNING * INTO after_row;

  -- ضمان: لا يتغير أي حقل آخر (العودة، التواريخ، الأسعار، ...)
  IF (to_jsonb(after_row) - ignore_keys) IS DISTINCT FROM (to_jsonb(b) - ignore_keys) THEN
    RAISE EXCEPTION 'تم إلغاء النقل: كانت العملية ستغيّر بيانات أخرى في الحجز.' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.audit_log(actor_id, actor_name, action, entity, entity_id, details)
  VALUES (uid, (SELECT email FROM auth.users WHERE id = uid), 'booking.outbound_transfer', 'booking', b.id::text,
    jsonb_build_object('booking_code', b.booking_code, 'from_bus_id', b.bus_id, 'to_bus_id', tb.id,
      'from_seats', to_jsonb(b.seat_numbers), 'to_seats', to_jsonb(_seats), 'result', 'success', 'at', now()));

  RETURN jsonb_build_object('ok', true, 'booking_code', b.booking_code, 'seats', to_jsonb(_seats));
END $$;
REVOKE ALL ON FUNCTION public.move_booking_outbound(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_booking_outbound(uuid, uuid, text[]) TO authenticated;