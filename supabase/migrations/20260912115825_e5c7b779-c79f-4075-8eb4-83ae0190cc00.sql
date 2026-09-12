CREATE OR REPLACE FUNCTION public.notify_booking_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  prev record;
BEGIN
  owner_user := NEW.created_by;

  IF NEW.rep_profile_id IS NOT NULL THEN
    rep_user := NEW.rep_profile_id;
  ELSIF NEW.rep_name IS NOT NULL AND btrim(NEW.rep_name) <> '' THEN
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
    ELSIF (NEW.gross_profit, NEW.rep_share, NEW.company_share) IS DISTINCT FROM (OLD.gross_profit, OLD.rep_share, OLD.company_share)
          AND (NEW.trip_id, NEW.bus_id, NEW.seat_numbers, NEW.return_seat_numbers, NEW.status, NEW.customer_name) IS NOT DISTINCT FROM
              (OLD.trip_id, OLD.bus_id, OLD.seat_numbers, OLD.return_seat_numbers, OLD.status, OLD.customer_name) THEN
      ntype := 'booking_settled';
      ntitle := 'تم اعتماد حسابات حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || to_char(date_trunc('minute', now()), 'YYYYMMDDHH24MI');
    ELSIF NEW.trip_id IS DISTINCT FROM OLD.trip_id THEN
      ntype := 'booking_rescheduled';
      ntitle := 'تم تغيير موعد رحلة حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || COALESCE(NEW.trip_id::text, '-');
    ELSIF NEW.bus_id IS DISTINCT FROM OLD.bus_id OR NEW.return_bus_id IS DISTINCT FROM OLD.return_bus_id THEN
      ntype := 'bus_changed';
      ntitle := 'تم تغيير حافلة حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || COALESCE(NEW.bus_id::text, '-') || ':' || COALESCE(NEW.return_bus_id::text, '-');
    ELSIF NEW.seat_numbers IS DISTINCT FROM OLD.seat_numbers OR NEW.return_seat_numbers IS DISTINCT FROM OLD.return_seat_numbers THEN
      ntype := 'seat_changed';
      ntitle := 'تم تغيير مقاعد حجزك باسم ' || cname || '.';
      dkey := ntype || ':' || NEW.id::text || ':' || array_to_string(COALESCE(NEW.seat_numbers, ARRAY[]::text[]), ',')
              || ':' || array_to_string(COALESCE(NEW.return_seat_numbers, ARRAY[]::text[]), ',');
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
  END IF;

  nbody := COALESCE(nbody, 'رقم الحجز: ' || COALESCE(NEW.booking_code, ''));

  FOREACH r IN ARRAY recips LOOP
    -- دمج مع إشعار حديث لنفس الحجز (خلال 5 دقائق) بدل إرسال إشعار منفصل
    SELECT n.id, n.title, n.type INTO prev
    FROM public.notifications n
    WHERE n.booking_id = NEW.id
      AND n.recipient_user_id = r
      AND n.category = 'bookings'
      AND n.created_at > now() - interval '5 minutes'
    ORDER BY n.created_at DESC
    LIMIT 1;

    IF prev.id IS NOT NULL AND prev.type IS DISTINCT FROM ntype
       AND position(rtrim(ntitle, '.') in prev.title) = 0 THEN
      UPDATE public.notifications
      SET title = rtrim(prev.title, '.') || ' — ' || ntitle,
          body = nbody,
          read = false,
          read_at = NULL,
          created_at = now()
      WHERE id = prev.id;
    ELSE
      INSERT INTO public.notifications (type, category, title, body, link, action_url, booking_id, recipient_user_id, dedupe_key, metadata)
      VALUES (ntype, 'bookings', ntitle, nbody, url, url, NEW.id, r, dkey,
              jsonb_build_object('booking_code', NEW.booking_code, 'customer_name', NEW.customer_name))
      ON CONFLICT (recipient_user_id, dedupe_key) WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL DO NOTHING;
    END IF;
    prev := NULL;
  END LOOP;

  RETURN NEW;
END;
$fn$;