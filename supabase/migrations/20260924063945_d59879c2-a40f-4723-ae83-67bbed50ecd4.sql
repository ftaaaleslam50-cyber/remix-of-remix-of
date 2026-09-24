-- lovable-cron-fallback-reviewed: time-based trip reminders (24h/3h/1h) and scheduled broadcasts need <=5 min delivery window; one consolidated SQL-only job
-- ============ Extend existing tables ============
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['in_app','push','toast','sound','vibrate'],
  ADD COLUMN IF NOT EXISTS data jsonb,
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS lang text NOT NULL DEFAULT 'ar';
CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx ON public.notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications (type);

ALTER TABLE public.push_deliveries ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- ============ Notification types ============
CREATE TABLE public.notification_types (
  key text PRIMARY KEY,
  category text NOT NULL,
  name text NOT NULL,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  is_critical boolean NOT NULL DEFAULT false,
  is_automatic boolean NOT NULL DEFAULT false,
  priority text NOT NULL DEFAULT 'normal',
  channels text[] NOT NULL DEFAULT ARRAY['in_app','push','toast','sound','vibrate'],
  variables text[] NOT NULL DEFAULT ARRAY[]::text[],
  default_title jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_types_priority_chk CHECK (priority IN ('low','normal','high','urgent'))
);
GRANT SELECT ON public.notification_types TO authenticated;
GRANT UPDATE ON public.notification_types TO authenticated;
GRANT ALL ON public.notification_types TO service_role;
ALTER TABLE public.notification_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "types readable by signed in" ON public.notification_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "types managed by admin/manager" ON public.notification_types FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER trg_notification_types_updated BEFORE UPDATE ON public.notification_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Templates (per type, per language) ============
CREATE TABLE public.notification_templates (
  type_key text NOT NULL REFERENCES public.notification_types(key) ON DELETE CASCADE,
  lang text NOT NULL DEFAULT 'ar',
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (type_key, lang)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT ALL ON public.notification_templates TO service_role;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates read admin/manager" ON public.notification_templates FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "templates write admin/manager" ON public.notification_templates FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER trg_notification_templates_updated BEFORE UPDATE ON public.notification_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Per-user preferences ============
CREATE TABLE public.user_notification_preferences (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  vibrate_enabled boolean NOT NULL DEFAULT true,
  toast_enabled boolean NOT NULL DEFAULT true,
  bell_animation boolean NOT NULL DEFAULT true,
  dnd_enabled boolean NOT NULL DEFAULT false,
  dnd_start time NOT NULL DEFAULT '23:00',
  dnd_end time NOT NULL DEFAULT '07:00',
  categories jsonb NOT NULL DEFAULT '{}'::jsonb,
  lang text NOT NULL DEFAULT 'ar',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_notification_preferences TO authenticated;
GRANT ALL ON public.user_notification_preferences TO service_role;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own prefs read" ON public.user_notification_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own prefs insert" ON public.user_notification_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own prefs update" ON public.user_notification_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_user_notif_prefs_updated BEFORE UPDATE ON public.user_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Broadcasts (manual + scheduled) ============
CREATE TABLE public.notification_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  url text,
  audience text NOT NULL,
  target_user_id uuid,
  target_trip_id uuid,
  target_booking_id uuid,
  target_bus_id uuid,
  channels text[] NOT NULL DEFAULT ARRAY['in_app','push','toast','sound','vibrate'],
  priority text NOT NULL DEFAULT 'normal',
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  sent_at timestamptz,
  recipients_count integer NOT NULL DEFAULT 0,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broadcasts_audience_chk CHECK (audience IN ('all','customers','representatives','supervisors','staff','user','trip','booking','bus')),
  CONSTRAINT broadcasts_status_chk CHECK (status IN ('scheduled','sending','sent','failed','cancelled')),
  CONSTRAINT broadcasts_priority_chk CHECK (priority IN ('low','normal','high','urgent'))
);
GRANT SELECT, UPDATE ON public.notification_broadcasts TO authenticated;
GRANT ALL ON public.notification_broadcasts TO service_role;
ALTER TABLE public.notification_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "broadcasts read admin/manager" ON public.notification_broadcasts FOR SELECT TO authenticated USING (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "broadcasts cancel admin/manager" ON public.notification_broadcasts FOR UPDATE TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE TRIGGER trg_notification_broadcasts_updated BEFORE UPDATE ON public.notification_broadcasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admins/managers may read delivery logs (admins already can)
CREATE POLICY "mgr read push deliveries" ON public.push_deliveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'::app_role));

-- ============ Engine: render + resolve + emit ============
CREATE OR REPLACE FUNCTION public.render_notification_text(_tpl text, _vars jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k text; v text; out text := COALESCE(_tpl, '');
BEGIN
  IF _vars IS NOT NULL THEN
    FOR k, v IN SELECT key, value FROM jsonb_each_text(_vars) LOOP
      out := replace(out, '{' || k || '}', COALESCE(v, ''));
    END LOOP;
  END IF;
  out := regexp_replace(out, '\{[a-z_]+\}', '', 'g');
  RETURN btrim(regexp_replace(out, '\s{2,}', ' ', 'g'));
END $$;

CREATE OR REPLACE FUNCTION public.resolve_notification(_type text, _user uuid, _vars jsonb)
RETURNS TABLE(ok boolean, title text, body text, category text, priority text, channels text[], lang text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.notification_types%ROWTYPE; p public.user_notification_preferences%ROWTYPE; tpl record; l text;
BEGIN
  SELECT * INTO t FROM public.notification_types WHERE key = _type;
  IF t.key IS NULL THEN RETURN; END IF;
  IF _user IS NOT NULL THEN SELECT * INTO p FROM public.user_notification_preferences WHERE user_id = _user; END IF;
  l := COALESCE(p.lang, 'ar');
  IF NOT t.is_critical THEN
    IF t.enabled IS NOT TRUE THEN RETURN QUERY SELECT false, NULL::text, NULL::text, t.category, t.priority, t.channels, l; RETURN; END IF;
    IF p.user_id IS NOT NULL AND (p.enabled IS NOT TRUE OR (p.categories ->> t.category) = 'false') THEN
      RETURN QUERY SELECT false, NULL::text, NULL::text, t.category, t.priority, t.channels, l; RETURN;
    END IF;
  END IF;
  SELECT nt.title, nt.body INTO tpl FROM public.notification_templates nt WHERE nt.type_key = _type AND nt.lang = l;
  IF tpl IS NULL THEN SELECT nt.title, nt.body INTO tpl FROM public.notification_templates nt WHERE nt.type_key = _type AND nt.lang = 'ar'; END IF;
  RETURN QUERY SELECT true,
    public.render_notification_text(COALESCE(tpl.title, t.default_title ->> l, t.default_title ->> 'ar', t.name), _vars || jsonb_build_object('app_name', 'زهرة طيبة')),
    public.render_notification_text(COALESCE(tpl.body, t.default_body ->> l, t.default_body ->> 'ar', ''), _vars || jsonb_build_object('app_name', 'زهرة طيبة')),
    t.category, t.priority, t.channels, l;
END $$;

CREATE OR REPLACE FUNCTION public.emit_notification(
  _type text, _user uuid, _vars jsonb, _dedupe text, _url text DEFAULT NULL,
  _booking_id uuid DEFAULT NULL, _event_id text DEFAULT NULL, _data jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; nid uuid;
BEGIN
  IF _user IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.resolve_notification(_type, _user, COALESCE(_vars, '{}'::jsonb));
  IF r.ok IS NOT TRUE THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (type, category, title, body, link, action_url, booking_id, recipient_user_id,
    dedupe_key, event_id, priority, channels, lang, data, metadata)
  VALUES (_type, r.category, r.title, NULLIF(r.body, ''), _url, _url, _booking_id, _user,
    _dedupe, COALESCE(_event_id, _dedupe), r.priority, r.channels, r.lang, _data, _vars)
  ON CONFLICT (recipient_user_id, dedupe_key) WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO nid;
  RETURN nid;
END $$;
REVOKE EXECUTE ON FUNCTION public.emit_notification(text, uuid, jsonb, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_notification(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Variables for a booking (real relations only)
CREATE OR REPLACE FUNCTION public.booking_notification_vars(_booking_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'customer_name', COALESCE(NULLIF(btrim(b.customer_name), ''), 'العميل'),
    'customer_phone', b.contact_phone,
    'booking_code', b.booking_code,
    'booking_status', CASE b.status WHEN 'confirmed' THEN 'مؤكد' WHEN 'cancelled' THEN 'ملغي' WHEN 'pending' THEN 'قيد المراجعة' ELSE b.status END,
    'trip_name', t.name,
    'trip_date', to_char(COALESCE(b.departure_date, t.departure_date), 'YYYY-MM-DD'),
    'trip_time', to_char(t.departure_time, 'HH24:MI'),
    'departure_location', t.departure_day,
    'destination', 'مكة المكرمة',
    'bus_number', NULLIF(bs.bus_number, 0)::text,
    'bus_plate', bs.plate,
    'driver_name', bs.driver_name,
    'driver_phone', bs.driver_phone,
    'seat_number', NULLIF(array_to_string(b.seat_numbers, '، '), ''),
    'hotel_name', h.name,
    'hotel_stars', h.stars::text,
    'package_name', p.name,
    'amount', b.total_price::text,
    'currency', 'ريال',
    'discount_code', b.coupon_code,
    'notes', b.notes
  ))
  FROM public.bookings b
  LEFT JOIN public.trips t ON t.id = b.trip_id
  LEFT JOIN public.buses bs ON bs.id = b.bus_id
  LEFT JOIN public.hotels h ON h.id = b.hotel_id
  LEFT JOIN public.packages p ON p.id = b.package_id
  WHERE b.id = _booking_id
$$;
REVOKE EXECUTE ON FUNCTION public.booking_notification_vars(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.booking_recipients(_created_by uuid, _rep_profile uuid, _rep_name text)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rep uuid := _rep_profile; out uuid[] := ARRAY[]::uuid[];
BEGIN
  IF rep IS NULL AND COALESCE(btrim(_rep_name), '') <> '' THEN
    SELECT rp.user_id INTO rep FROM public.representatives rp
    WHERE rp.user_id IS NOT NULL AND lower(btrim(rp.name)) = lower(btrim(_rep_name)) LIMIT 1;
  END IF;
  IF _created_by IS NOT NULL THEN out := array_append(out, _created_by); END IF;
  IF rep IS NOT NULL AND rep IS DISTINCT FROM _created_by THEN out := array_append(out, rep); END IF;
  RETURN out;
END $$;
REVOKE EXECUTE ON FUNCTION public.booking_recipients(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ============ Booking trigger rewritten on the engine (same trigger, same recipients, same merge) ============
CREATE OR REPLACE FUNCTION public.notify_booking_users()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  url text := '/my-bookings?code=' || COALESCE(NEW.booking_code, '');
  recips uuid[]; r uuid; ntype text; dkey text; prev record; res record; vars jsonb;
BEGIN
  recips := public.booking_recipients(NEW.created_by, NEW.rep_profile_id, NEW.rep_name);
  IF array_length(recips, 1) IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    ntype := 'booking_created'; dkey := ntype || ':' || NEW.id::text;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled' THEN
      ntype := 'booking_cancelled'; dkey := ntype || ':' || NEW.id::text;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'confirmed' THEN
      ntype := 'booking_confirmed'; dkey := ntype || ':' || NEW.id::text;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'pending' THEN
      ntype := 'booking_pending'; dkey := ntype || ':' || NEW.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI');
    ELSIF (NEW.gross_profit, NEW.rep_share, NEW.company_share) IS DISTINCT FROM (OLD.gross_profit, OLD.rep_share, OLD.company_share)
          AND (NEW.trip_id, NEW.bus_id, NEW.seat_numbers, NEW.return_seat_numbers, NEW.status, NEW.customer_name) IS NOT DISTINCT FROM
              (OLD.trip_id, OLD.bus_id, OLD.seat_numbers, OLD.return_seat_numbers, OLD.status, OLD.customer_name) THEN
      ntype := 'booking_settled'; dkey := ntype || ':' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    ELSIF NEW.trip_id IS DISTINCT FROM OLD.trip_id THEN
      ntype := 'booking_rescheduled'; dkey := ntype || ':' || NEW.id::text || ':' || COALESCE(NEW.trip_id::text, '-');
    ELSIF NEW.bus_id IS DISTINCT FROM OLD.bus_id OR NEW.return_bus_id IS DISTINCT FROM OLD.return_bus_id THEN
      ntype := CASE WHEN OLD.bus_id IS NULL AND NEW.bus_id IS NOT NULL THEN 'bus_assigned' ELSE 'bus_changed' END;
      dkey := ntype || ':' || NEW.id::text || ':' || COALESCE(NEW.bus_id::text, '-') || ':' || COALESCE(NEW.return_bus_id::text, '-');
    ELSIF NEW.seat_numbers IS DISTINCT FROM OLD.seat_numbers OR NEW.return_seat_numbers IS DISTINCT FROM OLD.return_seat_numbers THEN
      ntype := 'seat_changed';
      dkey := ntype || ':' || NEW.id::text || ':' || array_to_string(COALESCE(NEW.seat_numbers, ARRAY[]::text[]), ',')
              || ':' || array_to_string(COALESCE(NEW.return_seat_numbers, ARRAY[]::text[]), ',');
    ELSIF NEW.hotel_id IS DISTINCT FROM OLD.hotel_id AND NEW.hotel_id IS NOT NULL THEN
      ntype := CASE WHEN OLD.hotel_id IS NULL THEN 'hotel_assigned' ELSE 'hotel_changed' END;
      dkey := ntype || ':' || NEW.id::text || ':' || NEW.hotel_id::text;
    ELSIF COALESCE(NEW.notes, '') IS DISTINCT FROM COALESCE(OLD.notes, '') AND COALESCE(btrim(NEW.notes), '') <> '' THEN
      ntype := 'booking_note_added'; dkey := ntype || ':' || NEW.id::text || ':' || md5(COALESCE(NEW.notes, ''));
    ELSIF (NEW.customer_name, NEW.contact_phone, NEW.whatsapp_phone, NEW.id_number, NEW.nationality) IS DISTINCT FROM
          (OLD.customer_name, OLD.contact_phone, OLD.whatsapp_phone, OLD.id_number, OLD.nationality) THEN
      ntype := 'customer_updated';
      dkey := ntype || ':' || NEW.id::text || ':' || md5(COALESCE(NEW.customer_name,'') || COALESCE(NEW.contact_phone,'') || COALESCE(NEW.whatsapp_phone,'') || COALESCE(NEW.id_number,'') || COALESCE(NEW.nationality,''));
    ELSIF NEW.* IS DISTINCT FROM OLD.* THEN
      ntype := 'booking_updated'; dkey := ntype || ':' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  vars := public.booking_notification_vars(NEW.id);

  FOREACH r IN ARRAY recips LOOP
    SELECT * INTO res FROM public.resolve_notification(ntype, r, vars);
    CONTINUE WHEN res.ok IS NOT TRUE;

    SELECT n.id, n.title, n.type INTO prev FROM public.notifications n
    WHERE n.booking_id = NEW.id AND n.recipient_user_id = r AND n.created_at > now() - interval '5 minutes'
    ORDER BY n.created_at DESC LIMIT 1;

    IF prev.id IS NOT NULL AND prev.type IS DISTINCT FROM ntype AND position(rtrim(res.title, '.') in prev.title) = 0 THEN
      UPDATE public.notifications
      SET title = rtrim(prev.title, '.') || ' — ' || res.title, body = NULLIF(res.body, ''),
          read = false, read_at = NULL, created_at = now()
      WHERE id = prev.id;
    ELSE
      INSERT INTO public.notifications (type, category, title, body, link, action_url, booking_id, recipient_user_id,
        dedupe_key, event_id, priority, channels, lang, metadata)
      VALUES (ntype, res.category, res.title, NULLIF(res.body, ''), url, url, NEW.id, r, dkey, dkey,
        res.priority, res.channels, res.lang, vars)
      ON CONFLICT (recipient_user_id, dedupe_key) WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL DO NOTHING;
    END IF;
    prev := NULL;
  END LOOP;
  RETURN NEW;
END $$;

-- ============ Bus trigger (number) on the engine + driver/plate ============
CREATE OR REPLACE FUNCTION public.notify_bus_number_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; r uuid;
BEGIN
  IF NEW.bus_number IS NOT DISTINCT FROM OLD.bus_number THEN RETURN NEW; END IF;
  FOR b IN SELECT id, booking_code, created_by, rep_profile_id, rep_name FROM public.bookings
    WHERE deleted_at IS NULL AND status <> 'cancelled' AND (bus_id = NEW.id OR return_bus_id = NEW.id)
  LOOP
    FOREACH r IN ARRAY public.booking_recipients(b.created_by, b.rep_profile_id, b.rep_name) LOOP
      PERFORM public.emit_notification('bus_number_changed', r, public.booking_notification_vars(b.id),
        'bus_number_changed:' || b.id::text || ':' || COALESCE(NEW.bus_number::text, '-'),
        '/my-bookings?code=' || COALESCE(b.booking_code, ''), b.id);
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_bus_details_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; r uuid; ntype text; tag text;
BEGIN
  IF (NEW.driver_name, NEW.driver_phone) IS DISTINCT FROM (OLD.driver_name, OLD.driver_phone) AND COALESCE(btrim(NEW.driver_name), '') <> '' THEN
    ntype := 'bus_driver_changed'; tag := md5(COALESCE(NEW.driver_name,'') || COALESCE(NEW.driver_phone,''));
  ELSIF NEW.plate IS DISTINCT FROM OLD.plate AND COALESCE(btrim(NEW.plate), '') <> '' THEN
    ntype := 'bus_plate_changed'; tag := md5(NEW.plate);
  ELSE
    RETURN NEW;
  END IF;
  FOR b IN SELECT id, booking_code, created_by, rep_profile_id, rep_name FROM public.bookings
    WHERE deleted_at IS NULL AND status <> 'cancelled' AND no_show IS NOT TRUE
      AND (bus_id = NEW.id OR return_bus_id = NEW.id)
      AND (departure_date IS NULL OR departure_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date - 1
           OR actual_return_date >= (now() AT TIME ZONE 'Asia/Riyadh')::date)
  LOOP
    FOREACH r IN ARRAY public.booking_recipients(b.created_by, b.rep_profile_id, b.rep_name) LOOP
      PERFORM public.emit_notification(ntype, r, public.booking_notification_vars(b.id),
        ntype || ':' || b.id::text || ':' || tag, '/my-bookings?code=' || COALESCE(b.booking_code, ''), b.id);
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_bus_details_change AFTER UPDATE OF driver_name, driver_phone, plate ON public.buses
  FOR EACH ROW EXECUTE FUNCTION public.notify_bus_details_change();

-- ============ Trip time/date change (only upcoming bookings on that date) ============
CREATE OR REPLACE FUNCTION public.notify_trip_schedule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; r uuid; ntype text; today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  IF NEW.departure_time IS DISTINCT FROM OLD.departure_time AND NEW.departure_date IS NOT DISTINCT FROM OLD.departure_date THEN
    ntype := 'trip_time_changed';
  ELSIF NEW.departure_date IS DISTINCT FROM OLD.departure_date AND OLD.departure_date IS NOT NULL AND OLD.departure_date >= today THEN
    ntype := 'trip_date_changed';
  ELSE
    RETURN NEW;
  END IF;
  FOR b IN SELECT id, booking_code, created_by, rep_profile_id, rep_name FROM public.bookings
    WHERE trip_id = NEW.id AND deleted_at IS NULL AND status <> 'cancelled' AND no_show IS NOT TRUE
      AND COALESCE(departure_date, OLD.departure_date) = OLD.departure_date AND OLD.departure_date >= today
  LOOP
    FOREACH r IN ARRAY public.booking_recipients(b.created_by, b.rep_profile_id, b.rep_name) LOOP
      PERFORM public.emit_notification(ntype, r,
        public.booking_notification_vars(b.id) || jsonb_strip_nulls(jsonb_build_object(
          'trip_date', to_char(NEW.departure_date, 'YYYY-MM-DD'), 'trip_time', to_char(NEW.departure_time, 'HH24:MI'))),
        ntype || ':' || b.id::text || ':' || COALESCE(NEW.departure_date::text, '-') || ':' || COALESCE(NEW.departure_time::text, '-'),
        '/my-bookings?code=' || COALESCE(b.booking_code, ''), b.id);
    END LOOP;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_notify_trip_schedule_change AFTER UPDATE OF departure_time, departure_date ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.notify_trip_schedule_change();

-- ============ Broadcast sending (idempotent, row-locked) ============
CREATE OR REPLACE FUNCTION public.send_notification_broadcast(_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bc public.notification_broadcasts%ROWTYPE; uids uuid[]; u uuid; cnt integer := 0; today date := (now() AT TIME ZONE 'Asia/Riyadh')::date;
BEGIN
  SELECT * INTO bc FROM public.notification_broadcasts WHERE id = _id AND status = 'scheduled' FOR UPDATE SKIP LOCKED;
  IF bc.id IS NULL THEN RETURN 0; END IF;
  UPDATE public.notification_broadcasts SET status = 'sending' WHERE id = _id;

  IF bc.audience = 'all' THEN SELECT array_agg(id) INTO uids FROM public.profiles WHERE active;
  ELSIF bc.audience = 'customers' THEN
    SELECT array_agg(p.id) INTO uids FROM public.profiles p WHERE p.active AND p.account_type = 'customer'
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role IN ('admin','manager','supervisor','user_manager'));
  ELSIF bc.audience = 'representatives' THEN
    SELECT array_agg(DISTINCT x) INTO uids FROM (
      SELECT id x FROM public.profiles WHERE active AND account_type = 'representative'
      UNION SELECT user_id FROM public.user_roles WHERE role = 'representative') s;
  ELSIF bc.audience = 'supervisors' THEN SELECT array_agg(DISTINCT user_id) INTO uids FROM public.user_roles WHERE role = 'supervisor';
  ELSIF bc.audience = 'staff' THEN SELECT array_agg(DISTINCT user_id) INTO uids FROM public.user_roles WHERE role IN ('admin','manager','supervisor','user_manager');
  ELSIF bc.audience = 'user' THEN uids := ARRAY[bc.target_user_id];
  ELSE
    SELECT array_agg(DISTINCT x) INTO uids FROM (
      SELECT unnest(public.booking_recipients(b.created_by, b.rep_profile_id, b.rep_name)) x FROM public.bookings b
      WHERE b.deleted_at IS NULL AND b.status <> 'cancelled'
        AND ((bc.audience = 'booking' AND b.id = bc.target_booking_id)
          OR (bc.audience = 'trip' AND b.trip_id = bc.target_trip_id AND (b.departure_date IS NULL OR b.departure_date >= today))
          OR (bc.audience = 'bus' AND (b.bus_id = bc.target_bus_id OR b.return_bus_id = bc.target_bus_id)))) s;
  END IF;

  FOREACH u IN ARRAY COALESCE(uids, ARRAY[]::uuid[]) LOOP
    CONTINUE WHEN u IS NULL;
    INSERT INTO public.notifications (type, category, title, body, link, action_url, recipient_user_id, dedupe_key, event_id, priority, channels, data)
    VALUES ('system_announcement', 'system', bc.title, NULLIF(bc.body, ''), bc.url, bc.url, u,
      'broadcast:' || bc.id::text, 'broadcast:' || bc.id::text, bc.priority, bc.channels, jsonb_build_object('broadcast_id', bc.id))
    ON CONFLICT (recipient_user_id, dedupe_key) WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL DO NOTHING;
    cnt := cnt + 1;
  END LOOP;

  UPDATE public.notification_broadcasts SET status = 'sent', sent_at = now(), recipients_count = cnt WHERE id = _id;
  RETURN cnt;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.notification_broadcasts SET status = 'failed', error = left(SQLERRM, 500) WHERE id = _id;
  RETURN 0;
END $$;
REVOKE EXECUTE ON FUNCTION public.send_notification_broadcast(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_notification_broadcast(
  _title text, _body text, _audience text, _url text DEFAULT NULL, _channels text[] DEFAULT NULL,
  _priority text DEFAULT 'normal', _scheduled_at timestamptz DEFAULT NULL,
  _target_user uuid DEFAULT NULL, _target_trip uuid DEFAULT NULL, _target_booking uuid DEFAULT NULL, _target_bus uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE nid uuid; cnt integer := 0;
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF COALESCE(btrim(_title), '') = '' THEN RAISE EXCEPTION 'title required'; END IF;
  IF _url IS NOT NULL AND _url !~ '^/[^/]' AND _url <> '/' THEN RAISE EXCEPTION 'url must be an internal path'; END IF;
  INSERT INTO public.notification_broadcasts (title, body, url, audience, target_user_id, target_trip_id, target_booking_id, target_bus_id,
    channels, priority, scheduled_at, created_by)
  VALUES (btrim(_title), COALESCE(_body, ''), NULLIF(_url, ''), _audience, _target_user, _target_trip, _target_booking, _target_bus,
    COALESCE(_channels, ARRAY['in_app','push','toast','sound','vibrate']), COALESCE(_priority, 'normal'), _scheduled_at, auth.uid())
  RETURNING id INTO nid;
  IF _scheduled_at IS NULL OR _scheduled_at <= now() THEN cnt := public.send_notification_broadcast(nid); END IF;
  RETURN jsonb_build_object('id', nid, 'sent', cnt);
END $$;
REVOKE EXECUTE ON FUNCTION public.create_notification_broadcast(text, text, text, text, text[], text, timestamptz, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification_broadcast(text, text, text, text, text[], text, timestamptz, uuid, uuid, uuid, uuid) TO authenticated;

-- ============ Reminders + scheduled broadcasts job ============
CREATE OR REPLACE FUNCTION public.run_notification_jobs()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record; r uuid; h integer; total integer := 0; bid uuid;
BEGIN
  FOR bid IN SELECT id FROM public.notification_broadcasts WHERE status = 'scheduled' AND scheduled_at <= now() ORDER BY scheduled_at LIMIT 20 LOOP
    total := total + public.send_notification_broadcast(bid);
  END LOOP;

  FOR b IN
    SELECT bk.id, bk.booking_code, bk.created_by, bk.rep_profile_id, bk.rep_name,
      ((bk.departure_date + COALESCE(t.departure_time, '00:00'::time)) AT TIME ZONE 'Asia/Riyadh') AS dep
    FROM public.bookings bk JOIN public.trips t ON t.id = bk.trip_id
    WHERE bk.deleted_at IS NULL AND bk.status <> 'cancelled' AND bk.no_show IS NOT TRUE AND t.active
      AND bk.trip_mode <> 'return' AND bk.departure_date IS NOT NULL
      AND bk.departure_date BETWEEN (now() AT TIME ZONE 'Asia/Riyadh')::date - 1 AND (now() AT TIME ZONE 'Asia/Riyadh')::date + 2
  LOOP
    CONTINUE WHEN b.dep <= now();
    FOREACH h IN ARRAY ARRAY[24, 3, 1] LOOP
      IF b.dep - make_interval(hours => h) <= now() AND b.dep - make_interval(hours => h) > now() - interval '1 hour'
         AND (h = 1 OR b.dep - make_interval(hours => CASE h WHEN 24 THEN 3 ELSE 1 END) > now()) THEN
        FOREACH r IN ARRAY public.booking_recipients(b.created_by, b.rep_profile_id, b.rep_name) LOOP
          IF public.emit_notification('trip_reminder_' || h || 'h', r, public.booking_notification_vars(b.id),
               'trip_reminder_' || h || 'h:' || b.id::text, '/my-bookings?code=' || COALESCE(b.booking_code, ''), b.id) IS NOT NULL THEN
            total := total + 1;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;
  RETURN total;
END $$;
REVOKE EXECUTE ON FUNCTION public.run_notification_jobs() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('notification-jobs', '*/5 * * * *', 'SELECT public.run_notification_jobs();');

-- ============ Seed notification types with default templates ============
INSERT INTO public.notification_types (key, category, name, description, is_automatic, is_critical, priority, variables, default_title, default_body, display_order) VALUES
('booking_created','bookings','إضافة حجز','عند إنشاء حجز جديد',true,false,'normal',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time','bus_number','seat_number','hotel_name','amount','currency'],'{"ar":"تم إضافة حجز باسم {customer_name}","en":"Booking created for {customer_name}"}','{"ar":"رقم الحجز: {booking_code} — رحلة {trip_name} يوم {trip_date}","en":"Booking {booking_code} — {trip_name} on {trip_date}"}',10),
('booking_confirmed','bookings','تأكيد حجز','عند تأكيد الحجز',true,false,'high',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time','bus_number','seat_number'],'{"ar":"تم تأكيد حجزك","en":"Your booking is confirmed"}','{"ar":"مرحبًا {customer_name}، تم تأكيد حجزك رقم {booking_code} لرحلة يوم {trip_date} الساعة {trip_time}.","en":"Hello {customer_name}, booking {booking_code} is confirmed for {trip_date} at {trip_time}."}',11),
('booking_pending','bookings','حجز قيد المراجعة','عند إعادة الحجز لحالة المراجعة',true,false,'normal',ARRAY['customer_name','booking_code','booking_status'],'{"ar":"حجزك قيد المراجعة","en":"Your booking is pending"}','{"ar":"الحجز رقم {booking_code} باسم {customer_name} قيد المراجعة حاليًا.","en":"Booking {booking_code} is pending review."}',12),
('booking_updated','bookings','تعديل حجز','عند تعديل بيانات الحجز',true,false,'normal',ARRAY['customer_name','booking_code'],'{"ar":"تم تعديل حجزك باسم {customer_name}","en":"Booking updated"}','{"ar":"يرجى مراجعة تفاصيل الحجز رقم {booking_code}.","en":"Please review booking {booking_code}."}',13),
('booking_cancelled','bookings','إلغاء حجز','عند إلغاء الحجز',true,false,'high',ARRAY['customer_name','booking_code'],'{"ar":"تم إلغاء الحجز","en":"Booking cancelled"}','{"ar":"تم إلغاء الحجز رقم {booking_code} باسم {customer_name}. يمكنك فتح تفاصيل الحجز لمعرفة المزيد.","en":"Booking {booking_code} was cancelled."}',14),
('booking_rejected','bookings','رفض حجز','جاهز للاستخدام المستقبلي',false,false,'high',ARRAY['customer_name','booking_code'],'{"ar":"تم رفض الحجز","en":"Booking rejected"}','{"ar":"نعتذر، تم رفض الحجز رقم {booking_code}.","en":"Booking {booking_code} was rejected."}',15),
('booking_payment_received','bookings','استلام دفعة','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['customer_name','booking_code','amount','currency'],'{"ar":"تم استلام الدفعة","en":"Payment received"}','{"ar":"تم استلام مبلغ {amount} {currency} للحجز رقم {booking_code}.","en":"We received {amount} {currency} for {booking_code}."}',16),
('booking_payment_failed','bookings','فشل الدفع','جاهز للاستخدام المستقبلي',false,false,'high',ARRAY['customer_name','booking_code','amount','currency'],'{"ar":"تعذّر إتمام الدفع","en":"Payment failed"}','{"ar":"لم تكتمل عملية الدفع للحجز رقم {booking_code}.","en":"Payment for {booking_code} failed."}',17),
('seat_changed','bookings','تغيير المقاعد','عند تغيير مقاعد الحجز',true,false,'normal',ARRAY['customer_name','booking_code','seat_number','bus_number'],'{"ar":"تم تغيير مقاعد حجزك باسم {customer_name}","en":"Seats changed"}','{"ar":"المقاعد الجديدة: {seat_number} — رقم الحجز {booking_code}","en":"New seats: {seat_number}"}',18),
('booking_settled','bookings','اعتماد حسابات الحجز','عند اعتماد الحسابات',true,false,'low',ARRAY['customer_name','booking_code'],'{"ar":"تم اعتماد حسابات حجزك باسم {customer_name}","en":"Booking settled"}','{"ar":"رقم الحجز: {booking_code}","en":"Booking {booking_code}"}',19),
('booking_note_added','bookings','ملاحظة جديدة','عند إضافة ملاحظة على الحجز',true,false,'normal',ARRAY['customer_name','booking_code','notes'],'{"ar":"ملاحظة جديدة على حجزك باسم {customer_name}","en":"New note on your booking"}','{"ar":"{notes}","en":"{notes}"}',20),
('customer_updated','bookings','تحديث بيانات العميل','عند تحديث بيانات العميل في الحجز',true,false,'low',ARRAY['customer_name','booking_code'],'{"ar":"تم تحديث بيانات حجزك باسم {customer_name}","en":"Customer details updated"}','{"ar":"رقم الحجز: {booking_code}","en":"Booking {booking_code}"}',21),
('booking_rescheduled','trips','تغيير رحلة الحجز','عند نقل الحجز لرحلة أخرى',true,false,'high',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time'],'{"ar":"تم تغيير موعد رحلة حجزك","en":"Trip changed"}','{"ar":"حجز {customer_name} رقم {booking_code} أصبح على رحلة {trip_name} يوم {trip_date} الساعة {trip_time}.","en":"Booking {booking_code} moved to {trip_name} on {trip_date} {trip_time}."}',30),
('trip_created','trips','إنشاء رحلة','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['trip_name','trip_date','trip_time'],'{"ar":"رحلة جديدة متاحة","en":"New trip available"}','{"ar":"رحلة {trip_name} يوم {trip_date} الساعة {trip_time}.","en":"{trip_name} on {trip_date}."}',31),
('trip_updated','trips','تعديل رحلة','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['trip_name','trip_date','trip_time'],'{"ar":"تم تحديث الرحلة","en":"Trip updated"}','{"ar":"تم تحديث بيانات رحلة {trip_name}.","en":"{trip_name} was updated."}',32),
('trip_date_changed','trips','تغيير تاريخ الرحلة','عند تغيير تاريخ رحلة لها حجوزات قادمة',true,false,'high',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time'],'{"ar":"تم تغيير تاريخ الرحلة","en":"Trip date changed"}','{"ar":"تم تعديل موعد رحلتك إلى {trip_date} الساعة {trip_time}.","en":"Your trip is now on {trip_date} at {trip_time}."}',33),
('trip_time_changed','trips','تغيير وقت الرحلة','عند تغيير وقت انطلاق الرحلة',true,false,'high',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time'],'{"ar":"تم تغيير موعد الرحلة","en":"Trip time changed"}','{"ar":"تم تعديل موعد رحلتك إلى {trip_date} الساعة {trip_time}.","en":"Your trip is now on {trip_date} at {trip_time}."}',34),
('trip_cancelled','trips','إلغاء رحلة','جاهز للاستخدام المستقبلي',false,false,'urgent',ARRAY['trip_name','trip_date','booking_code'],'{"ar":"تم إلغاء الرحلة","en":"Trip cancelled"}','{"ar":"نعتذر، تم إلغاء رحلة {trip_name} يوم {trip_date}.","en":"{trip_name} on {trip_date} was cancelled."}',35),
('trip_departure_changed','trips','تغيير نقطة الانطلاق','جاهز للاستخدام المستقبلي',false,false,'high',ARRAY['trip_name','departure_location'],'{"ar":"تم تغيير نقطة الانطلاق","en":"Departure point changed"}','{"ar":"نقطة الانطلاق الجديدة: {departure_location}.","en":"New departure point: {departure_location}."}',36),
('trip_destination_changed','trips','تغيير الوجهة','جاهز للاستخدام المستقبلي',false,false,'high',ARRAY['trip_name','destination'],'{"ar":"تم تغيير الوجهة","en":"Destination changed"}','{"ar":"الوجهة الجديدة: {destination}.","en":"New destination: {destination}."}',37),
('bus_assigned','buses','تعيين حافلة','عند تعيين حافلة للحجز',true,false,'normal',ARRAY['customer_name','booking_code','bus_number','bus_plate','driver_name','driver_phone'],'{"ar":"تم تعيين حافلة لحجزك","en":"Bus assigned"}','{"ar":"حجز {customer_name} رقم {booking_code} على الحافلة رقم {bus_number}.","en":"Booking {booking_code} is on bus {bus_number}."}',40),
('bus_changed','buses','تغيير الحافلة','عند نقل الحجز لحافلة أخرى',true,false,'high',ARRAY['customer_name','booking_code','bus_number','bus_plate','driver_name','driver_phone'],'{"ar":"تم تغيير حافلة حجزك باسم {customer_name}","en":"Bus changed"}','{"ar":"الحافلة الجديدة رقم {bus_number} — رقم الحجز {booking_code}","en":"New bus {bus_number}"}',41),
('bus_number_changed','buses','تغيير رقم الحافلة','عند تغيير رقم الحافلة',true,false,'normal',ARRAY['customer_name','booking_code','bus_number'],'{"ar":"تم تغيير رقم حافلة حجزك باسم {customer_name}","en":"Bus number changed"}','{"ar":"رقم الحافلة الجديد: {bus_number}","en":"New bus number: {bus_number}"}',42),
('bus_driver_changed','buses','تغيير السائق','عند تغيير سائق الحافلة',true,false,'normal',ARRAY['customer_name','booking_code','bus_number','driver_name','driver_phone'],'{"ar":"تم تغيير سائق الحافلة","en":"Driver changed"}','{"ar":"سائق الحافلة رقم {bus_number}: {driver_name} {driver_phone}","en":"Bus {bus_number} driver: {driver_name} {driver_phone}"}',43),
('bus_plate_changed','buses','تغيير لوحة الحافلة','عند تغيير لوحة الحافلة',true,false,'normal',ARRAY['customer_name','booking_code','bus_number','bus_plate'],'{"ar":"تم تغيير لوحة الحافلة","en":"Bus plate changed"}','{"ar":"لوحة الحافلة رقم {bus_number} الجديدة: {bus_plate}","en":"Bus {bus_number} plate: {bus_plate}"}',44),
('hotel_assigned','hotels','تعيين فندق','عند تعيين فندق للحجز',true,false,'normal',ARRAY['customer_name','booking_code','hotel_name','hotel_stars'],'{"ar":"تم تعيين الفندق لحجزك","en":"Hotel assigned"}','{"ar":"فندق حجزك رقم {booking_code}: {hotel_name}","en":"Hotel for {booking_code}: {hotel_name}"}',50),
('hotel_changed','hotels','تغيير الفندق','عند تغيير فندق الحجز',true,false,'high',ARRAY['customer_name','booking_code','hotel_name','hotel_stars'],'{"ar":"تم تغيير فندق حجزك","en":"Hotel changed"}','{"ar":"الفندق الجديد لحجز {customer_name} رقم {booking_code}: {hotel_name}","en":"New hotel for {booking_code}: {hotel_name}"}',51),
('hotel_checkin_reminder','hotels','تذكير تسجيل الدخول','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['hotel_name','booking_code'],'{"ar":"تذكير بموعد دخول الفندق","en":"Hotel check-in reminder"}','{"ar":"موعد دخولك إلى {hotel_name} قريب.","en":"Check-in at {hotel_name} is soon."}',52),
('hotel_checkout_reminder','hotels','تذكير تسجيل الخروج','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['hotel_name','booking_code'],'{"ar":"تذكير بموعد الخروج من الفندق","en":"Hotel check-out reminder"}','{"ar":"موعد الخروج من {hotel_name} قريب.","en":"Check-out from {hotel_name} is soon."}',53),
('discount_created','discounts','خصم جديد','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['discount_name','discount_code'],'{"ar":"خصم جديد","en":"New discount"}','{"ar":"استخدم الكود {discount_code} للحصول على {discount_name}.","en":"Use {discount_code} for {discount_name}."}',60),
('discount_started','discounts','بدء خصم','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['discount_name','discount_code'],'{"ar":"بدأ العرض","en":"Offer started"}','{"ar":"{discount_name} متاح الآن.","en":"{discount_name} is live."}',61),
('discount_expiring','discounts','خصم قارب على الانتهاء','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['discount_name','discount_code'],'{"ar":"العرض ينتهي قريبًا","en":"Offer ending soon"}','{"ar":"الكود {discount_code} ينتهي قريبًا.","en":"{discount_code} expires soon."}',62),
('discount_expired','discounts','انتهاء خصم','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['discount_name','discount_code'],'{"ar":"انتهى العرض","en":"Offer ended"}','{"ar":"انتهت صلاحية الكود {discount_code}.","en":"{discount_code} has expired."}',63),
('coupon_created','discounts','كوبون جديد','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['discount_code','amount'],'{"ar":"حصلت على كوبون","en":"You got a coupon"}','{"ar":"كود الخصم الخاص بك: {discount_code}","en":"Your code: {discount_code}"}',64),
('booking_reminder_24h','reminders','تذكير الحجز قبل 24 ساعة','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['customer_name','booking_code','trip_date','trip_time'],'{"ar":"تذكير بحجزك","en":"Booking reminder"}','{"ar":"حجزك رقم {booking_code} يوم {trip_date} الساعة {trip_time}.","en":"Booking {booking_code} on {trip_date} {trip_time}."}',70),
('booking_reminder_3h','reminders','تذكير الحجز قبل 3 ساعات','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['customer_name','booking_code','trip_date','trip_time'],'{"ar":"تذكير بحجزك","en":"Booking reminder"}','{"ar":"حجزك رقم {booking_code} بعد 3 ساعات.","en":"Booking {booking_code} in 3 hours."}',71),
('booking_reminder_1h','reminders','تذكير الحجز قبل ساعة','جاهز للاستخدام المستقبلي',false,false,'high',ARRAY['customer_name','booking_code','trip_date','trip_time'],'{"ar":"تذكير بحجزك","en":"Booking reminder"}','{"ar":"حجزك رقم {booking_code} بعد ساعة.","en":"Booking {booking_code} in 1 hour."}',72),
('trip_reminder_24h','reminders','تذكير الرحلة قبل 24 ساعة','يُرسل تلقائيًا قبل الانطلاق بيوم',true,false,'normal',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time','bus_number','seat_number'],'{"ar":"رحلتك غدًا","en":"Your trip is tomorrow"}','{"ar":"تذكير: رحلة {customer_name} رقم الحجز {booking_code} يوم {trip_date} الساعة {trip_time}.","en":"Reminder: {booking_code} departs {trip_date} at {trip_time}."}',73),
('trip_reminder_3h','reminders','تذكير الرحلة قبل 3 ساعات','يُرسل تلقائيًا قبل الانطلاق بـ 3 ساعات',true,false,'high',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time','bus_number','seat_number'],'{"ar":"رحلتك بعد 3 ساعات","en":"Your trip is in 3 hours"}','{"ar":"الانطلاق الساعة {trip_time} — الحافلة رقم {bus_number}، المقاعد {seat_number}.","en":"Departure at {trip_time} — bus {bus_number}, seats {seat_number}."}',74),
('trip_reminder_1h','reminders','تذكير الرحلة قبل ساعة','يُرسل تلقائيًا قبل الانطلاق بساعة',true,false,'high',ARRAY['customer_name','booking_code','trip_name','trip_date','trip_time','bus_number','seat_number'],'{"ar":"رحلتك بعد ساعة","en":"Your trip is in 1 hour"}','{"ar":"يرجى الحضور إلى نقطة التجمع — الانطلاق الساعة {trip_time}، الحافلة رقم {bus_number}.","en":"Please head to the meeting point — departure {trip_time}, bus {bus_number}."}',75),
('system_announcement','system','إعلان عام','الإرسال اليدوي من الإدارة',true,false,'normal',ARRAY['app_name'],'{"ar":"إعلان من {app_name}","en":"Announcement"}','{"ar":"","en":""}',80),
('maintenance','system','صيانة','جاهز للاستخدام المستقبلي',false,false,'normal',ARRAY['app_name'],'{"ar":"صيانة مجدولة","en":"Scheduled maintenance"}','{"ar":"سيخضع {app_name} لصيانة قصيرة.","en":"{app_name} will undergo short maintenance."}',81),
('important_notice','system','تنبيه مهم','جاهز للاستخدام المستقبلي',false,false,'high',ARRAY['app_name'],'{"ar":"تنبيه مهم","en":"Important notice"}','{"ar":"","en":""}',82),
('app_update','system','تحديث التطبيق','جاهز للاستخدام المستقبلي',false,false,'low',ARRAY['app_name'],'{"ar":"تحديث جديد","en":"App update"}','{"ar":"تم تحديث {app_name}.","en":"{app_name} was updated."}',83),
('login_new_device','security','دخول من جهاز جديد','جاهز للاستخدام المستقبلي',false,true,'high',ARRAY['app_name'],'{"ar":"تسجيل دخول جديد","en":"New sign-in"}','{"ar":"تم تسجيل الدخول إلى حسابك من جهاز جديد.","en":"Your account was accessed from a new device."}',90),
('password_changed','security','تغيير كلمة المرور','جاهز للاستخدام المستقبلي',false,true,'high',ARRAY['app_name'],'{"ar":"تم تغيير كلمة المرور","en":"Password changed"}','{"ar":"تم تغيير كلمة مرور حسابك.","en":"Your password was changed."}',91),
('account_security','security','أمان الحساب','جاهز للاستخدام المستقبلي',false,true,'urgent',ARRAY['app_name'],'{"ar":"تنبيه أمني","en":"Security alert"}','{"ar":"","en":""}',92)
ON CONFLICT (key) DO NOTHING;
