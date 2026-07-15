-- redeem_coupon now takes booking_code (text) so guests don't need SELECT on bookings after insert.
DROP FUNCTION IF EXISTS public.redeem_coupon(text, uuid);

CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text, _booking_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.coupons%ROWTYPE;
  next_count integer;
  now_used boolean;
  b_id uuid;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.active IS FALSE THEN RETURN false; END IF;
  IF c.expiry_date < now() THEN RETURN false; END IF;
  IF c.max_uses IS NOT NULL AND COALESCE(c.usage_count,0) >= c.max_uses THEN RETURN false; END IF;
  IF c.max_uses IS NULL AND c.used THEN RETURN false; END IF;

  SELECT id INTO b_id FROM public.bookings WHERE booking_code = _booking_code LIMIT 1;

  next_count := COALESCE(c.usage_count,0) + 1;
  now_used := (c.max_uses IS NULL) OR (next_count >= c.max_uses);

  UPDATE public.coupons
     SET usage_count = next_count,
         used = now_used,
         used_in_booking_id = b_id
   WHERE code = _code;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.redeem_coupon(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, text) TO anon, authenticated;