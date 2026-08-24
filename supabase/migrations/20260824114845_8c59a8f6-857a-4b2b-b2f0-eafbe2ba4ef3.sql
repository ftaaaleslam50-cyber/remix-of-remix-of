ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS dedupe_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uidx
  ON public.notifications (recipient_user_id, dedupe_key)
  WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_recipient_idx
  ON public.notifications (recipient_user_id, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated
  USING (recipient_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_booking_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rep_user uuid;
  owner_user uuid;
  cname text := COALESCE(NULLIF(btrim(NEW.customer_name), ''), 'العميل');
  url text := '/my-bookings?code=' || COALESCE(NEW.booking_code, '');
  recips uuid[] := ARRAY[]::uuid[];
  r uuid;
  ntype text;
  ntitle text;
  nbody text;
  dkey text;
BEGIN
  owner_user := NEW.created_by;

  IF NEW.rep_name IS NOT NULL AND btrim(NEW.rep_name) <> '' THEN
    SELECT rp.user_id INTO rep_user
    FROM public.representatives rp
    WHERE rp.user_id IS NOT NULL
      AND lower(btrim(rp.name)) = lower(btrim(NEW.rep_name))
    LIMIT 1;
  END IF;

  IF owner_user IS NOT NULL THEN recips := array_append(recips, owner_user); END IF;
  IF rep_user IS NOT NULL AND rep_user <> COALESCE(owner_user, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    recips := array_append(recips, rep_user);
  END IF;

  IF array_length(recips, 1) IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    ntype := 'booking_created';
    ntitle := 'تم إضافة حجز باسم ' || cname || '.';
    nbody := 'رقم الحجز: ' || COALESCE(NEW.booking_code, '');
    dkey := ntype || ':' || NEW.id::text;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled' THEN
      ntype := 'booking_cancelled';
      ntitle := 'تم إلغاء حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text;
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'confirmed' THEN
      ntype := 'booking_confirmed';
      ntitle := 'تم تأكيد حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text;
    ELSIF NEW.trip_id IS DISTINCT FROM OLD.trip_id THEN
      ntype := 'booking_rescheduled';
      ntitle := 'تم تعديل موعد رحلة حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || COALESCE(NEW.trip_id::text, '-');
    ELSIF NEW.bus_id IS DISTINCT FROM OLD.bus_id THEN
      ntype := 'bus_changed';
      ntitle := 'تم تغيير الحافلة الخاصة بحجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || COALESCE(NEW.bus_id::text, '-');
    ELSIF NEW.seat_numbers IS DISTINCT FROM OLD.seat_numbers THEN
      ntype := 'seat_changed';
      ntitle := 'تم تعديل مقعد حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || array_to_string(COALESCE(NEW.seat_numbers, ARRAY[]::text[]), ',');
    ELSIF COALESCE(NEW.notes, '') IS DISTINCT FROM COALESCE(OLD.notes, '') AND COALESCE(btrim(NEW.notes), '') <> '' THEN
      ntype := 'booking_note_added';
      ntitle := 'تمت إضافة ملاحظة جديدة إلى حجزك باسم ' || cname || '.';
      nbody := NEW.notes;
      dkey := ntype || ':' || NEW.id::text || ':' || md5(COALESCE(NEW.notes, ''));
    ELSIF (NEW.customer_name, NEW.contact_phone, NEW.whatsapp_phone, NEW.id_number, NEW.nationality) IS DISTINCT FROM
          (OLD.customer_name, OLD.contact_phone, OLD.whatsapp_phone, OLD.id_number, OLD.nationality) THEN
      ntype := 'customer_updated';
      ntitle := 'تم تحديث بيانات حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || md5(COALESCE(NEW.customer_name,'') || COALESCE(NEW.contact_phone,'') || COALESCE(NEW.whatsapp_phone,'') || COALESCE(NEW.id_number,'') || COALESCE(NEW.nationality,''));
    ELSIF NEW.* IS DISTINCT FROM OLD.* THEN
      ntype := 'booking_updated';
      ntitle := 'تم تعديل حجزك باسم ' || cname || '. يرجى مراجعة تفاصيل الحجز.';
      dkey := ntype || ':' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    ELSE
      RETURN NEW;
    END IF;
    nbody := COALESCE(nbody, 'رقم الحجز: ' || COALESCE(NEW.booking_code, ''));
  END IF;

  FOREACH r IN ARRAY recips LOOP
    INSERT INTO public.notifications (type, category, title, body, link, action_url, booking_id, recipient_user_id, dedupe_key, metadata)
    VALUES (ntype, 'bookings', ntitle, nbody, url, url, NEW.id, r, dkey,
            jsonb_build_object('booking_code', NEW.booking_code, 'customer_name', NEW.customer_name))
    ON CONFLICT (recipient_user_id, dedupe_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_booking_users() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_booking_users ON public.bookings;
CREATE TRIGGER trg_notify_booking_users
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_users();