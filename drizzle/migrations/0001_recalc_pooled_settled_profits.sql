CREATE OR REPLACE FUNCTION public.recalc_pooled_settled_profits(_bus_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b record; ref record; occ record;
  hotel text; room_label text;
  pool_total numeric; pool_pax numeric; seat_cost numeric; bed_cost numeric;
  ext_sale numeric; ext_cost numeric; nights numeric; cnt numeric; rate numeric;
  extension_total numeric; group_cost numeric; extension_cost numeric; gross numeric;
  touched integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF _bus_ids IS NULL OR array_length(_bus_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  SELECT * INTO ref FROM public.settlement_reference WHERE id = 1;

  -- إجمالي مصاريف كل الحافلات المحددة ÷ مجموع ركابها = تكلفة مقعد موحدة
  SELECT COALESCE(SUM(
      COALESCE(bs.expense_bus_cost,0) + COALESCE(bs.expense_driver_tip,0)
    + COALESCE(bs.expense_taxi,0) + COALESCE(bs.expense_parking,0)
    + COALESCE(bs.expense_supervisor,0) + COALESCE(bs.expense_extra,0)), 0)
    INTO pool_total
  FROM public.buses bs WHERE bs.id = ANY(_bus_ids);

  SELECT COALESCE(SUM(bk.passenger_count),0) INTO pool_pax
  FROM public.bookings bk
  WHERE bk.bus_id = ANY(_bus_ids) AND bk.deleted_at IS NULL AND bk.status <> 'cancelled';

  seat_cost := CASE WHEN pool_pax > 0 THEN pool_total / pool_pax ELSE 0 END;

  FOR b IN
    SELECT bk.*, p.name AS hotel_name, p.extension_price AS pkg_ext_price
    FROM public.bookings bk
    LEFT JOIN public.packages p ON p.id = bk.package_id
    WHERE bk.deleted_at IS NULL AND bk.status <> 'cancelled'
      AND bk.bus_id = ANY(_bus_ids)
  LOOP
    occ := NULL;
    SELECT * INTO occ FROM public.trip_occurrences
      WHERE trip_id = b.trip_id AND departure_date IS NOT DISTINCT FROM b.departure_date;

    hotel := COALESCE(b.hotel_name, '');
    IF hotel = '' THEN
      room_label := 'خماسي'; bed_cost := 0;
    ELSE
      room_label := CASE
        WHEN b.booking_type = 'individual' THEN 'خماسي مشترك'
        WHEN COALESCE(b.room_type,'5') = '1' THEN 'فردي'
        WHEN b.room_type = '2' THEN 'ثنائي'
        WHEN b.room_type = '3' THEN 'ثلاثي'
        WHEN b.room_type = '4' THEN 'رباعي'
        ELSE 'خماسي' END;
      bed_cost := COALESCE(NULLIF(occ.bed_costs -> hotel ->> room_label, '')::numeric, 0);
    END IF;
    ext_sale := COALESCE(NULLIF(ref.extension -> hotel ->> 'sale', '')::numeric, b.pkg_ext_price, 0);
    ext_cost := COALESCE(NULLIF(ref.extension -> hotel ->> 'cost', '')::numeric, 0);
    nights := COALESCE(b.extension_nights, 0);
    cnt := COALESCE(b.passenger_count, 0);
    rate := 0;
    IF b.rep_profile_id IS NOT NULL THEN
      SELECT COALESCE(commission_rate,0) INTO rate FROM public.profiles WHERE id = b.rep_profile_id;
    END IF;
    IF COALESCE(rate,0) = 0 THEN
      rate := COALESCE(NULLIF(ref.commissions ->> COALESCE(NULLIF(b.booking_source,''),'الموقع'), '')::numeric, 0);
    END IF;
    extension_total := ext_sale * nights;
    group_cost := (bed_cost + seat_cost) * cnt;
    extension_cost := nights * ext_cost;
    gross := (COALESCE(b.total_price,0) - extension_total) - group_cost + (extension_total - extension_cost);
    UPDATE public.bookings
      SET gross_profit = ROUND(gross),
          rep_share = CASE WHEN b.trip_mode = 'return' THEN ROUND(gross - gross * COALESCE(ref.return_trip_company_profit_rate, 0)) ELSE ROUND(gross * rate) END,
          company_share = CASE WHEN b.trip_mode = 'return' THEN ROUND(gross * COALESCE(ref.return_trip_company_profit_rate, 0)) ELSE ROUND(gross - gross * rate) END
      WHERE id = b.id;
    touched := touched + 1;
  END LOOP;
  RETURN touched;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalc_pooled_settled_profits(uuid[]) TO authenticated;