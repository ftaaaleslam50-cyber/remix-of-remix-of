-- 1) NOTIFICATIONS: categories
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'system';
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_category_idx ON public.notifications (category);

-- 2) NOTIFICATION SETTINGS (singleton)
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id integer PRIMARY KEY DEFAULT 1,
  sound_enabled boolean NOT NULL DEFAULT true,
  toast_enabled boolean NOT NULL DEFAULT true,
  browser_enabled boolean NOT NULL DEFAULT false,
  vibrate_enabled boolean NOT NULL DEFAULT true,
  bell_animation boolean NOT NULL DEFAULT true,
  show_counter boolean NOT NULL DEFAULT true,
  cat_bookings boolean NOT NULL DEFAULT true,
  cat_coupons boolean NOT NULL DEFAULT true,
  cat_buses boolean NOT NULL DEFAULT true,
  cat_hotels boolean NOT NULL DEFAULT true,
  cat_system boolean NOT NULL DEFAULT true,
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_start time NOT NULL DEFAULT '22:00',
  dnd_end time NOT NULL DEFAULT '07:00',
  sound_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_singleton CHECK (id = 1)
);
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT ALL ON public.notification_settings TO service_role;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_settings_read" ON public.notification_settings;
CREATE POLICY "notif_settings_read" ON public.notification_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "notif_settings_admin_write" ON public.notification_settings;
CREATE POLICY "notif_settings_admin_write" ON public.notification_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.notification_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
DROP TRIGGER IF EXISTS trg_notification_settings_updated ON public.notification_settings;
CREATE TRIGGER trg_notification_settings_updated BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) COUPONS: extra options + QR
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS min_booking_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_user_limit integer,
  ADD COLUMN IF NOT EXISTS qr_url text;

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code text NOT NULL,
  booking_code text,
  user_id uuid,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupon_redemptions_code_idx ON public.coupon_redemptions (coupon_code);
GRANT SELECT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coupon_redemptions_admin_read" ON public.coupon_redemptions;
CREATE POLICY "coupon_redemptions_admin_read" ON public.coupon_redemptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 4) BOOKINGS: gender breakdown
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS male_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS female_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seat_genders jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5) validate_coupon: expose new fields
DROP FUNCTION IF EXISTS public.validate_coupon(text);
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text)
 RETURNS TABLE(code text, prize_type text, prize_value numeric, label text, expiry_date timestamptz,
               used boolean, active boolean, max_uses integer, usage_count integer,
               start_date timestamptz, min_booking_amount numeric, per_user_limit integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.code, c.prize_type, c.prize_value, c.label, c.expiry_date,
         c.used, c.active, c.max_uses, c.usage_count,
         c.start_date, c.min_booking_amount, c.per_user_limit
  FROM public.coupons c WHERE c.code = _code LIMIT 1;
$$;

-- 6) redeem_coupon: honour start date + per-user limit + log redemption
CREATE OR REPLACE FUNCTION public.redeem_coupon(_code text, _booking_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  next_count integer;
  now_used boolean;
  b_id uuid;
  uid uuid := auth.uid();
  user_uses integer;
BEGIN
  SELECT * INTO c FROM public.coupons WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF c.active IS FALSE THEN RETURN false; END IF;
  IF c.start_date IS NOT NULL AND c.start_date > now() THEN RETURN false; END IF;
  IF c.expiry_date < now() THEN RETURN false; END IF;
  IF c.max_uses IS NOT NULL AND COALESCE(c.usage_count,0) >= c.max_uses THEN RETURN false; END IF;
  IF c.max_uses IS NULL AND c.used THEN RETURN false; END IF;

  IF c.per_user_limit IS NOT NULL AND uid IS NOT NULL THEN
    SELECT count(*) INTO user_uses FROM public.coupon_redemptions
      WHERE coupon_code = _code AND user_id = uid;
    IF user_uses >= c.per_user_limit THEN RETURN false; END IF;
  END IF;

  SELECT id INTO b_id FROM public.bookings WHERE booking_code = _booking_code LIMIT 1;
  next_count := COALESCE(c.usage_count,0) + 1;
  now_used := (c.max_uses IS NULL) OR (next_count >= c.max_uses);

  UPDATE public.coupons
     SET usage_count = next_count, used = now_used, used_in_booking_id = b_id
   WHERE code = _code;

  INSERT INTO public.coupon_redemptions(coupon_code, booking_code, user_id, phone)
  VALUES (_code, _booking_code, uid, c.phone);

  IF now_used THEN
    INSERT INTO public.notifications(type, title, body, category)
    VALUES ('coupon_exhausted', 'استنفاد كوبون', 'تم استنفاد استخدامات الكوبون ' || _code, 'coupons');
  END IF;

  RETURN true;
END;
$$;

-- 7) booking notifications get a category
CREATE OR REPLACE FUNCTION public.tg_booking_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(type, title, body, link, category)
    VALUES ('booking_created', 'حجز جديد',
      COALESCE(NEW.customer_name,'') || ' — ' || COALESCE(NEW.booking_code,''),
      '/ticket/' || NEW.booking_code, 'bookings');
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
    VALUES (NEW.created_by, 'booking.create', 'bookings', NEW.id::text,
      jsonb_build_object('code', NEW.booking_code, 'total', NEW.total_price));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.notifications(type, title, body, link, category)
      VALUES ('booking_status', 'تحديث حالة حجز',
        COALESCE(NEW.booking_code,'') || ': ' || COALESCE(OLD.status,'') || ' → ' || COALESCE(NEW.status,''),
        '/ticket/' || NEW.booking_code, 'bookings');
    END IF;
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      INSERT INTO public.notifications(type, title, body, link, category)
      VALUES ('booking_deleted', 'حذف حجز', COALESCE(NEW.booking_code,''), NULL, 'bookings');
    END IF;
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
    VALUES (COALESCE(auth.uid(), NEW.updated_by, NEW.created_by),
      'booking.update', 'bookings', NEW.id::text,
      jsonb_build_object('code', NEW.booking_code,
        'from_status', OLD.status, 'to_status', NEW.status,
        'deleted', NEW.deleted_at IS NOT NULL));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_booking_notify ON public.bookings;
CREATE TRIGGER trg_booking_notify AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_booking_notify();

-- 8) BUS notifications (status changes + occupancy)
CREATE OR REPLACE FUNCTION public.tg_bus_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'maintenance' THEN
      INSERT INTO public.notifications(type, title, body, category)
      VALUES ('bus_maintenance', 'حافلة في الصيانة', COALESCE(NEW.name, 'حافلة ' || NEW.bus_number), 'buses');
    ELSIF NEW.status = 'stopped' OR NEW.status = 'disabled' THEN
      INSERT INTO public.notifications(type, title, body, category)
      VALUES ('bus_out_of_service', 'حافلة خارج الخدمة', COALESCE(NEW.name, 'حافلة ' || NEW.bus_number), 'buses');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bus_notify ON public.buses;
CREATE TRIGGER trg_bus_notify AFTER UPDATE ON public.buses
  FOR EACH ROW EXECUTE FUNCTION public.tg_bus_notify();

CREATE OR REPLACE FUNCTION public.tg_bus_occupancy_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  cap integer;
  taken integer;
  pct numeric;
  bus_label text;
BEGIN
  IF NEW.bus_id IS NULL THEN RETURN NEW; END IF;
  SELECT capacity, COALESCE(name, 'حافلة ' || bus_number) INTO cap, bus_label
    FROM public.buses WHERE id = NEW.bus_id;
  IF cap IS NULL OR cap <= 0 THEN RETURN NEW; END IF;
  SELECT COALESCE(SUM(array_length(seat_numbers, 1)), 0) INTO taken
    FROM public.bookings
    WHERE bus_id = NEW.bus_id AND deleted_at IS NULL AND status <> 'cancelled';
  pct := (taken::numeric / cap) * 100;
  IF pct >= 100 THEN
    INSERT INTO public.notifications(type, title, body, category)
    VALUES ('bus_full', 'اكتملت الحافلة', bus_label || ' — 100%', 'buses');
  ELSIF pct >= 90 AND pct < 100 THEN
    INSERT INTO public.notifications(type, title, body, category)
    VALUES ('bus_90', 'الحافلة وصلت 90%', bus_label, 'buses');
  ELSIF pct >= 75 AND pct < 90 THEN
    INSERT INTO public.notifications(type, title, body, category)
    VALUES ('bus_75', 'الحافلة وصلت 75%', bus_label, 'buses');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bus_occupancy_notify ON public.bookings;
CREATE TRIGGER trg_bus_occupancy_notify AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.tg_bus_occupancy_notify();

-- 9) HOTEL notifications (packages act as hotels)
CREATE OR REPLACE FUNCTION public.tg_hotel_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(type, title, body, category)
    VALUES ('hotel_created', 'إضافة فندق', NEW.name, 'hotels');
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.active IS DISTINCT FROM OLD.active AND NEW.active = false THEN
      INSERT INTO public.notifications(type, title, body, category)
      VALUES ('hotel_hidden', 'إخفاء فندق', NEW.name, 'hotels');
    ELSE
      INSERT INTO public.notifications(type, title, body, category)
      VALUES ('hotel_updated', 'تعديل فندق', NEW.name, 'hotels');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_hotel_notify ON public.packages;
CREATE TRIGGER trg_hotel_notify AFTER INSERT OR UPDATE ON public.packages
  FOR EACH ROW EXECUTE FUNCTION public.tg_hotel_notify();

-- 10) COUPON created notification
CREATE OR REPLACE FUNCTION public.tg_coupon_notify()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications(type, title, body, category)
  VALUES (CASE WHEN NEW.source = 'wheel' THEN 'coupon_won' ELSE 'coupon_created' END,
          CASE WHEN NEW.source = 'wheel' THEN 'فوز بخصم من عجلة الحظ' ELSE 'إنشاء كوبون' END,
          NEW.code || ' — ' || COALESCE(NEW.label, NEW.prize_value::text),
          'coupons');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_coupon_notify ON public.coupons;
CREATE TRIGGER trg_coupon_notify AFTER INSERT ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.tg_coupon_notify();