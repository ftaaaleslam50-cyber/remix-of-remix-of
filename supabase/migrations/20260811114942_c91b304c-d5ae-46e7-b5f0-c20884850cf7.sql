
CREATE OR REPLACE FUNCTION public.enforce_booking_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_staff boolean := false;
  hotel_price numeric := 0;
  bus_price numeric := 0;
  expected_pp numeric := 0;
  max_discount numeric := 0;
  c record;
BEGIN
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
  END IF;

  IF NEW.no_bus IS NOT TRUE AND NEW.bus_id IS NOT NULL THEN
    SELECT COALESCE(b.price_addition, 0) INTO bus_price
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
  NEW.total_price := GREATEST(expected_pp * GREATEST(NEW.passenger_count, 1) - NEW.discount_amount, 0);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_booking_pricing_trg ON public.bookings;
CREATE TRIGGER enforce_booking_pricing_trg
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_pricing();

REVOKE EXECUTE ON FUNCTION public.enforce_booking_pricing() FROM anon, authenticated;
