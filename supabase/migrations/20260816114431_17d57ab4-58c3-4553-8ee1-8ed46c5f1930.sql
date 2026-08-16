ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS extension_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS extension_nights integer NOT NULL DEFAULT 0;
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_extension_nights_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_extension_nights_check CHECK (extension_nights >= 0 AND extension_nights <= 5);

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
  ext_price numeric := 0;
  ext_total numeric := 0;
  c record;
BEGIN
  IF NEW.no_hotel IS TRUE OR NEW.package_id IS NULL THEN
    NEW.extension_nights := 0;
  END IF;
  NEW.extension_nights := LEAST(GREATEST(COALESCE(NEW.extension_nights, 0), 0), 5);

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
  NEW.total_price := GREATEST(expected_pp * GREATEST(NEW.passenger_count, 1) - NEW.discount_amount, 0) + COALESCE(ext_total, 0);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_booking_pricing() FROM anon, authenticated;