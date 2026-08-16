CREATE TABLE public.booking_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'جدولة',
  start_time time NOT NULL DEFAULT '23:00',
  end_time time NOT NULL DEFAULT '08:00',
  enabled boolean NOT NULL DEFAULT true,
  block_representative boolean NOT NULL DEFAULT false,
  block_customer boolean NOT NULL DEFAULT false,
  block_guest boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT 'الحجز غير متاح حاليًا، يرجى المحاولة لاحقًا.',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_schedules TO authenticated;
GRANT ALL ON public.booking_schedules TO service_role;

ALTER TABLE public.booking_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view booking schedules"
ON public.booking_schedules FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'user_manager'));

CREATE POLICY "Admins manage booking schedules"
ON public.booking_schedules FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_booking_schedules_updated
BEFORE UPDATE ON public.booking_schedules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.booking_availability()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s public.app_settings%ROWTYPE;
  uid uuid := auth.uid();
  base_msg text;
  audience text;
  t time;
  sch record;
  in_window boolean;
BEGIN
  SELECT * INTO s FROM public.app_settings WHERE id = 1;

  base_msg := COALESCE(NULLIF(btrim(s.booking_unavailable_message), ''), 'الحجز غير متاح حاليًا، يرجى المحاولة لاحقًا.');

  IF uid IS NOT NULL AND (
       public.has_role(uid, 'admin') OR
       public.has_role(uid, 'manager') OR
       public.has_role(uid, 'user_manager')
     ) THEN
    RETURN jsonb_build_object('allowed', true, 'message', null);
  END IF;

  IF uid IS NULL THEN
    audience := 'guest';
  ELSIF public.has_role(uid, 'representative') THEN
    audience := 'representative';
  ELSE
    audience := 'customer';
  END IF;

  -- 1) Manual controls (independent from schedules)
  IF s.id IS NOT NULL THEN
    IF s.booking_enabled = false
       OR (audience = 'guest' AND s.booking_block_guest)
       OR (audience = 'customer' AND s.booking_block_customer)
       OR (audience = 'representative' AND s.booking_block_representative)
    THEN
      RETURN jsonb_build_object('allowed', false, 'message', base_msg);
    END IF;
  END IF;

  -- 2) Schedules: temporary blocks only
  t := (now() AT TIME ZONE 'Asia/Riyadh')::time;
  FOR sch IN SELECT * FROM public.booking_schedules WHERE enabled ORDER BY display_order, created_at LOOP
    IF (audience = 'guest' AND sch.block_guest)
       OR (audience = 'customer' AND sch.block_customer)
       OR (audience = 'representative' AND sch.block_representative)
    THEN
      IF sch.start_time <= sch.end_time THEN
        in_window := (t >= sch.start_time AND t <= sch.end_time);
      ELSE
        in_window := (t >= sch.start_time OR t <= sch.end_time);
      END IF;
      IF in_window THEN
        RETURN jsonb_build_object(
          'allowed', false,
          'message', COALESCE(NULLIF(btrim(sch.message), ''), base_msg),
          'schedule', sch.name
        );
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('allowed', true, 'message', null);
END;
$function$;