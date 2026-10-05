CREATE OR REPLACE FUNCTION public._room_cap(_label text) RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE _label WHEN 'فردي' THEN 1 WHEN 'ثنائي' THEN 2 WHEN 'ثلاثي' THEN 3 WHEN 'رباعي' THEN 4 ELSE 5 END::numeric
$$;

CREATE OR REPLACE FUNCTION public.recalc_settled_profits(_bus_id uuid DEFAULT NULL::uuid, _trip_id uuid DEFAULT NULL::uuid, _departure_date date DEFAULT NULL::date)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b record; ref record; bus record; occ record;
  hotel text; room_label text;
  bus_total numeric; bus_pax numeric; seat_cost numeric; bed_cost numeric;
  ext_sale numeric; ext_cost numeric; nights numeric; cnt numeric; rate numeric;
  extension_total numeric; group_cost numeric; extension_cost numeric; gross numeric;
  touched integer := 0; eff_seat numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT * INTO ref FROM public.settlement_reference WHERE id = 1;
  FOR b IN
    SELECT bk.*, p.name AS hotel_name, p.extension_price AS pkg_ext_price
    FROM public.bookings bk LEFT JOIN public.packages p ON p.id = bk.package_id
    WHERE bk.deleted_at IS NULL AND bk.status <> 'cancelled'
      AND ((_bus_id IS NOT NULL AND bk.bus_id = _bus_id)
        OR (_trip_id IS NOT NULL AND bk.trip_id = _trip_id AND bk.departure_date IS NOT DISTINCT FROM _departure_date))
  LOOP
    bus := NULL; occ := NULL;
    SELECT * INTO bus FROM public.buses WHERE id = b.bus_id;
    SELECT * INTO occ FROM public.trip_occurrences WHERE trip_id = b.trip_id AND departure_date IS NOT DISTINCT FROM b.departure_date;
    IF bus.id IS NULL OR bus.settled_at IS NULL THEN
      UPDATE public.bookings SET gross_profit = NULL, rep_share = NULL, company_share = NULL WHERE id = b.id;
      CONTINUE;
    END IF;
    bus_total := COALESCE(bus.expense_bus_cost,0) + COALESCE(bus.expense_driver_tip,0) + COALESCE(bus.expense_taxi,0)
               + COALESCE(bus.expense_parking,0) + COALESCE(bus.expense_supervisor,0) + COALESCE(bus.expense_supervisor_bed,0)
               + COALESCE(bus.expense_empty_beds,0) + COALESCE(bus.expense_extra,0);
    SELECT COALESCE(SUM(passenger_count),0) INTO bus_pax FROM public.bookings
      WHERE bus_id = bus.id AND deleted_at IS NULL AND status <> 'cancelled' AND trip_mode <> 'return';
    seat_cost := CASE WHEN bus_pax > 0 THEN bus_total / bus_pax ELSE 0 END;
    hotel := COALESCE(b.hotel_name, '');
    IF hotel = '' THEN room_label := 'خماسي'; bed_cost := 0;
    ELSE
      room_label := CASE WHEN b.booking_type = 'individual' THEN 'خماسي مشترك'
        WHEN COALESCE(b.room_type,'5') = '1' THEN 'فردي' WHEN b.room_type = '2' THEN 'ثنائي'
        WHEN b.room_type = '3' THEN 'ثلاثي' WHEN b.room_type = '4' THEN 'رباعي' ELSE 'خماسي' END;
      bed_cost := COALESCE(NULLIF(occ.bed_costs -> hotel ->> room_label, '')::numeric, 0);
      IF bed_cost <= 0 THEN
        bed_cost := COALESCE(NULLIF(ref.hotel_night_prices ->> hotel, '')::numeric, 0) / public._room_cap(room_label);
      END IF;
    END IF;
    ext_sale := COALESCE(NULLIF(ref.extension -> hotel ->> 'sale', '')::numeric, b.pkg_ext_price, 0);
    ext_cost := COALESCE(NULLIF(ref.extension -> hotel ->> 'cost', '')::numeric, 0);
    nights := COALESCE(b.extension_nights, 0); cnt := COALESCE(b.passenger_count, 0);
    rate := 0;
    IF b.rep_profile_id IS NOT NULL THEN SELECT COALESCE(commission_rate,0) INTO rate FROM public.profiles WHERE id = b.rep_profile_id; END IF;
    IF COALESCE(rate,0) = 0 THEN rate := COALESCE(NULLIF(ref.commissions ->> COALESCE(NULLIF(b.booking_source,''),'الموقع'), '')::numeric, 0); END IF;
    extension_total := ext_sale * nights;
    eff_seat := CASE WHEN b.trip_mode = 'return' THEN COALESCE(ref.return_seat_cost,0) ELSE seat_cost END;
    group_cost := (bed_cost + eff_seat) * cnt;
    extension_cost := nights * ext_cost;
    gross := (COALESCE(b.total_price,0) - extension_total) - group_cost + (extension_total - extension_cost);
    UPDATE public.bookings SET gross_profit = ROUND(gross),
      rep_share = CASE WHEN b.trip_mode = 'return' THEN ROUND(gross - gross * COALESCE(ref.return_trip_company_profit_rate, 0)) ELSE ROUND(gross * rate) END,
      company_share = CASE WHEN b.trip_mode = 'return' THEN ROUND(gross * COALESCE(ref.return_trip_company_profit_rate, 0) + eff_seat * cnt) ELSE ROUND(gross - gross * rate) END
    WHERE id = b.id;
    touched := touched + 1;
  END LOOP;
  RETURN touched;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_pooled_settled_profits(_bus_ids uuid[])
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  b record; ref record; occ record; hotel text; room_label text;
  pool_total numeric; pool_pax numeric; seat_cost numeric; bed_cost numeric;
  ext_sale numeric; ext_cost numeric; nights numeric; cnt numeric; rate numeric;
  extension_total numeric; group_cost numeric; extension_cost numeric; gross numeric;
  touched integer := 0; eff_seat numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_manager(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _bus_ids IS NULL OR array_length(_bus_ids, 1) IS NULL THEN RETURN 0; END IF;
  SELECT * INTO ref FROM public.settlement_reference WHERE id = 1;
  SELECT COALESCE(SUM(COALESCE(bs.expense_bus_cost,0) + COALESCE(bs.expense_driver_tip,0) + COALESCE(bs.expense_taxi,0)
    + COALESCE(bs.expense_parking,0) + COALESCE(bs.expense_supervisor,0) + COALESCE(bs.expense_supervisor_bed,0)
    + COALESCE(bs.expense_empty_beds,0) + COALESCE(bs.expense_extra,0)), 0) INTO pool_total
  FROM public.buses bs WHERE bs.id = ANY(_bus_ids);
  SELECT COALESCE(SUM(bk.passenger_count),0) INTO pool_pax FROM public.bookings bk
  WHERE bk.bus_id = ANY(_bus_ids) AND bk.deleted_at IS NULL AND bk.status <> 'cancelled' AND bk.trip_mode <> 'return';
  seat_cost := CASE WHEN pool_pax > 0 THEN pool_total / pool_pax ELSE 0 END;
  FOR b IN
    SELECT bk.*, p.name AS hotel_name, p.extension_price AS pkg_ext_price
    FROM public.bookings bk LEFT JOIN public.packages p ON p.id = bk.package_id
    WHERE bk.deleted_at IS NULL AND bk.status <> 'cancelled' AND bk.bus_id = ANY(_bus_ids)
  LOOP
    occ := NULL;
    SELECT * INTO occ FROM public.trip_occurrences WHERE trip_id = b.trip_id AND departure_date IS NOT DISTINCT FROM b.departure_date;
    hotel := COALESCE(b.hotel_name, '');
    IF hotel = '' THEN room_label := 'خماسي'; bed_cost := 0;
    ELSE
      room_label := CASE WHEN b.booking_type = 'individual' THEN 'خماسي مشترك'
        WHEN COALESCE(b.room_type,'5') = '1' THEN 'فردي' WHEN b.room_type = '2' THEN 'ثنائي'
        WHEN b.room_type = '3' THEN 'ثلاثي' WHEN b.room_type = '4' THEN 'رباعي' ELSE 'خماسي' END;
      bed_cost := COALESCE(NULLIF(occ.bed_costs -> hotel ->> room_label, '')::numeric, 0);
      IF bed_cost <= 0 THEN
        bed_cost := COALESCE(NULLIF(ref.hotel_night_prices ->> hotel, '')::numeric, 0) / public._room_cap(room_label);
      END IF;
    END IF;
    ext_sale := COALESCE(NULLIF(ref.extension -> hotel ->> 'sale', '')::numeric, b.pkg_ext_price, 0);
    ext_cost := COALESCE(NULLIF(ref.extension -> hotel ->> 'cost', '')::numeric, 0);
    nights := COALESCE(b.extension_nights, 0); cnt := COALESCE(b.passenger_count, 0);
    rate := 0;
    IF b.rep_profile_id IS NOT NULL THEN SELECT COALESCE(commission_rate,0) INTO rate FROM public.profiles WHERE id = b.rep_profile_id; END IF;
    IF COALESCE(rate,0) = 0 THEN rate := COALESCE(NULLIF(ref.commissions ->> COALESCE(NULLIF(b.booking_source,''),'الموقع'), '')::numeric, 0); END IF;
    extension_total := ext_sale * nights;
    eff_seat := CASE WHEN b.trip_mode = 'return' THEN COALESCE(ref.return_seat_cost,0) ELSE seat_cost END;
    group_cost := (bed_cost + eff_seat) * cnt;
    extension_cost := nights * ext_cost;
    gross := (COALESCE(b.total_price,0) - extension_total) - group_cost + (extension_total - extension_cost);
    UPDATE public.bookings SET gross_profit = ROUND(gross),
      rep_share = CASE WHEN b.trip_mode = 'return' THEN ROUND(gross - gross * COALESCE(ref.return_trip_company_profit_rate, 0)) ELSE ROUND(gross * rate) END,
      company_share = CASE WHEN b.trip_mode = 'return' THEN ROUND(gross * COALESCE(ref.return_trip_company_profit_rate, 0) + eff_seat * cnt) ELSE ROUND(gross - gross * rate) END
    WHERE id = b.id;
    touched := touched + 1;
  END LOOP;
  RETURN touched;
END;
$function$;

DO $$ DECLARE x uuid; BEGIN
  FOR x IN SELECT id FROM public.buses WHERE settled_at IS NOT NULL LOOP
    PERFORM public.recalc_settled_profits(x, NULL, NULL);
  END LOOP;
END $$;