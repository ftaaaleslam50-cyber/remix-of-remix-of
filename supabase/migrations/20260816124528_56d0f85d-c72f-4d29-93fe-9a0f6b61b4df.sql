ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS booking_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_block_guest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_block_customer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_block_representative boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_open_time time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS booking_close_time time NOT NULL DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS booking_unavailable_message text NOT NULL DEFAULT 'الحجز غير متاح حاليًا، يرجى المحاولة لاحقًا.';

CREATE OR REPLACE FUNCTION public.booking_availability()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.app_settings%ROWTYPE;
  uid uuid := auth.uid();
  msg text;
  blocked boolean := false;
  t time;
BEGIN
  SELECT * INTO s FROM public.app_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'message', null);
  END IF;

  msg := COALESCE(NULLIF(btrim(s.booking_unavailable_message), ''), 'الحجز غير متاح حاليًا، يرجى المحاولة لاحقًا.');

  IF uid IS NOT NULL AND (
       public.has_role(uid, 'admin') OR
       public.has_role(uid, 'manager') OR
       public.has_role(uid, 'user_manager')
     ) THEN
    RETURN jsonb_build_object('allowed', true, 'message', null);
  END IF;

  IF s.booking_enabled = false THEN
    blocked := true;
  END IF;

  IF uid IS NULL THEN
    IF s.booking_block_guest THEN blocked := true; END IF;
  ELSIF public.has_role(uid, 'representative') THEN
    IF s.booking_block_representative THEN blocked := true; END IF;
  ELSE
    IF s.booking_block_customer THEN blocked := true; END IF;
  END IF;

  IF s.booking_schedule_enabled THEN
    t := (now() AT TIME ZONE 'Asia/Riyadh')::time;
    IF s.booking_open_time <= s.booking_close_time THEN
      IF t < s.booking_open_time OR t > s.booking_close_time THEN blocked := true; END IF;
    ELSE
      IF t < s.booking_open_time AND t > s.booking_close_time THEN blocked := true; END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', NOT blocked, 'message', CASE WHEN blocked THEN msg ELSE null END);
END;
$$;

REVOKE ALL ON FUNCTION public.booking_availability() FROM public;
GRANT EXECUTE ON FUNCTION public.booking_availability() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_booking_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  res jsonb;
BEGIN
  res := public.booking_availability();
  IF (res->>'allowed')::boolean IS FALSE THEN
    RAISE EXCEPTION '%', res->>'message' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_window ON public.bookings;
CREATE TRIGGER trg_enforce_booking_window
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_window();