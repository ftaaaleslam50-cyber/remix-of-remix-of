CREATE OR REPLACE FUNCTION public.notify_booking_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    INSERT INTO public.notifications (type, category, title, body, link, action_url, booking_id, recipient_user_id, dedupe_key, metadata)
    VALUES (ntype, 'bookings', ntitle, nbody, url, url, NEW.id, r, dkey,
            jsonb_build_object('booking_code', NEW.booking_code, 'customer_name', NEW.customer_name))
    ON CONFLICT (recipient_user_id, dedupe_key) WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_bus_number_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  b record;
  r uuid;
  recips uuid[];
  cname text;
  url text;
  dkey text;
BEGIN
  IF NEW.bus_number IS NOT DISTINCT FROM OLD.bus_number THEN RETURN NEW; END IF;

  FOR b IN
    SELECT id, booking_code, customer_name, created_by, rep_profile_id
    FROM public.bookings
    WHERE deleted_at IS NULL
      AND status <> 'cancelled'
      AND (bus_id = NEW.id OR return_bus_id = NEW.id)
  LOOP
    recips := ARRAY[]::uuid[];
    IF b.created_by IS NOT NULL THEN recips := array_append(recips, b.created_by); END IF;
    IF b.rep_profile_id IS NOT NULL AND b.rep_profile_id IS DISTINCT FROM b.created_by THEN
      recips := array_append(recips, b.rep_profile_id);
    END IF;
    CONTINUE WHEN array_length(recips, 1) IS NULL;

    cname := COALESCE(NULLIF(btrim(b.customer_name), ''), 'العميل');
    url := '/my-bookings?code=' || COALESCE(b.booking_code, '');
    dkey := 'bus_number_changed:' || b.id::text || ':' || COALESCE(NEW.bus_number::text, '-');

    FOREACH r IN ARRAY recips LOOP
      INSERT INTO public.notifications (type, category, title, body, link, action_url, booking_id, recipient_user_id, dedupe_key, metadata)
      VALUES ('bus_number_changed', 'bookings',
              'تم تغيير رقم حافلة حجزك باسم ' || cname || '.',
              'رقم الحافلة الجديد: ' || COALESCE(NEW.bus_number::text, '-'),
              url, url, b.id, r, dkey,
              jsonb_build_object('booking_code', b.booking_code, 'bus_number', NEW.bus_number))
      ON CONFLICT (recipient_user_id, dedupe_key) WHERE recipient_user_id IS NOT NULL AND dedupe_key IS NOT NULL DO NOTHING;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_bus_number_change ON public.buses;
CREATE TRIGGER trg_notify_bus_number_change
AFTER UPDATE OF bus_number ON public.buses
FOR EACH ROW EXECUTE FUNCTION public.notify_bus_number_change();