ALTER TABLE public.buses
  ADD COLUMN IF NOT EXISTS expense_bus_cost numeric,
  ADD COLUMN IF NOT EXISTS expense_driver_tip numeric,
  ADD COLUMN IF NOT EXISTS expense_taxi numeric,
  ADD COLUMN IF NOT EXISTS expense_supervisor numeric,
  ADD COLUMN IF NOT EXISTS expense_extra numeric,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.trip_occurrences
  ADD COLUMN IF NOT EXISTS bed_costs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS gross_profit numeric,
  ADD COLUMN IF NOT EXISTS rep_share numeric,
  ADD COLUMN IF NOT EXISTS company_share numeric;

CREATE OR REPLACE FUNCTION public.recalc_settled_profits(_bus_id uuid DEFAULT NULL, _trip_id uuid DEFAULT NULL, _departure_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  ref record;
  bus record;
  occ record;
  hotel text;
  room_label text;
  bus_total numeric;
  bus_pax numeric;
  seat_cost numeric;
  bed_cost numeric;
  ext_sale numeric;
  ext_cost numeric;
  nights numeric;
  cnt numeric;
  rate numeric;
  extension_total numeric;
  grand_total numeric;
  group_cost numeric;
  extension_cost numeric;
  gross numeric;
  touched integer := 0;
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO ref FROM public.settlement_reference WHERE id = 1;

  FOR b IN
    SELECT bk.*, p.name AS hotel_name, p.extension_price AS pkg_ext_price
    FROM public.bookings bk
    LEFT JOIN public.packages p ON p.id = bk.package_id
    WHERE bk.deleted_at IS NULL
      AND bk.status <> 'cancelled'
      AND (
        (_bus_id IS NOT NULL AND bk.bus_id = _bus_id)
        OR (_trip_id IS NOT NULL AND bk.trip_id = _trip_id AND bk.departure_date IS NOT DISTINCT FROM _departure_date)
      )
  LOOP
    bus := NULL; occ := NULL;
    SELECT * INTO bus FROM public.buses WHERE id = b.bus_id;
    SELECT * INTO occ FROM public.trip_occurrences
      WHERE trip_id = b.trip_id AND departure_date IS NOT DISTINCT FROM b.departure_date;

    IF bus.id IS NULL OR bus.settled_at IS NULL OR occ.id IS NULL OR occ.settled_at IS NULL THEN
      UPDATE public.bookings SET gross_profit = NULL, rep_share = NULL, company_share = NULL WHERE id = b.id;
      CONTINUE;
    END IF;

    bus_total := COALESCE(bus.expense_bus_cost,0) + COALESCE(bus.expense_driver_tip,0)
               + COALESCE(bus.expense_taxi,0) + COALESCE(bus.expense_supervisor,0)
               + COALESCE(bus.expense_extra,0);
    SELECT COALESCE(SUM(passenger_count),0) INTO bus_pax
      FROM public.bookings
      WHERE bus_id = bus.id AND deleted_at IS NULL AND status <> 'cancelled';
    seat_cost := CASE WHEN bus_pax > 0 THEN bus_total / bus_pax ELSE 0 END;

    hotel := COALESCE(b.hotel_name, '');
    IF hotel = '' THEN
      room_label := 'خماسي';
      bed_cost := 0;
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

    ext_sale := COALESCE(
      NULLIF(ref.extension -> hotel ->> 'sale', '')::numeric,
      b.pkg_ext_price, 0);
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
    grand_total := COALESCE(b.total_price,0) + extension_total;
    group_cost := (bed_cost + seat_cost) * cnt;
    extension_cost := nights * ext_cost;
    gross := grand_total + (extension_total - extension_cost) - (group_cost + extension_cost);

    UPDATE public.bookings
      SET gross_profit = ROUND(gross),
          rep_share = ROUND(gross * rate),
          company_share = ROUND(gross - gross * rate)
      WHERE id = b.id;
    touched := touched + 1;
  END LOOP;

  RETURN touched;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_settled_profits(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_settled_profits(uuid, uuid, date) TO authenticated;