
-- =========================================================
-- 1) COUPONS: remove permissive SELECT/UPDATE, expose safe RPCs
-- =========================================================
DROP POLICY IF EXISTS "coupons public lookup" ON public.coupons;
DROP POLICY IF EXISTS "coupons public update usage" ON public.coupons;

-- Safe validation function: returns non-sensitive fields for a given code.
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text)
RETURNS TABLE (
  code text,
  prize_type text,
  prize_value numeric,
  label text,
  expiry_date timestamptz,
  used boolean,
  active boolean,
  max_uses integer,
  usage_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.code, c.prize_type, c.prize_value, c.label, c.expiry_date,
         c.used, c.active, c.max_uses, c.usage_count
  FROM public.coupons c
  WHERE c.code = _code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.validate_coupon(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_coupon(text) TO anon, authenticated;

-- Redemption function: atomically increments usage after validation.
CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text, _booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  next_count integer;
  now_used boolean;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.active IS FALSE THEN RETURN false; END IF;
  IF c.expiry_date < now() THEN RETURN false; END IF;
  IF c.max_uses IS NOT NULL AND COALESCE(c.usage_count,0) >= c.max_uses THEN RETURN false; END IF;
  IF c.max_uses IS NULL AND c.used THEN RETURN false; END IF;

  next_count := COALESCE(c.usage_count,0) + 1;
  now_used := (c.max_uses IS NULL) OR (next_count >= c.max_uses);

  UPDATE public.coupons
     SET usage_count = next_count,
         used = now_used,
         used_in_booking_id = _booking_id
   WHERE code = _code;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, uuid) TO anon, authenticated;

-- =========================================================
-- 2) PRICING_MATRIX: only expose active rows to the public
-- =========================================================
DROP POLICY IF EXISTS "pricing public read" ON public.pricing_matrix;
CREATE POLICY "pricing public read active"
  ON public.pricing_matrix
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- =========================================================
-- 3) has_role: convert to SECURITY INVOKER; user_roles policy already allows self-read
-- =========================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- =========================================================
-- 4) Lock down other SECURITY DEFINER functions from direct client execution.
--    Triggers still fire (trigger execution does not require EXECUTE grant to callers).
-- =========================================================
REVOKE ALL ON FUNCTION public.generate_booking_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_booking_code() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_booking_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_bus_audit() FROM PUBLIC;
