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
    'bus_number', COALESCE(NULLIF(bs.bus_number, 0)::text, bs.name, '—'),
    'bus_plate', bs.plate,
    'driver_name', bs.driver_name,
    'driver_phone', bs.driver_phone,
    'seat_number', COALESCE(NULLIF(array_to_string(b.seat_numbers, '، '), ''), '—'),
    'return_bus_number', COALESCE(NULLIF(rb.bus_number, 0)::text, rb.name),
    'return_seat_number', NULLIF(array_to_string(b.return_seat_numbers, '، '), ''),
    'return_date', to_char(COALESCE(b.actual_return_date, b.return_date), 'YYYY-MM-DD'),
    'passenger_count', b.passenger_count::text,
    'booking_type', CASE b.booking_type WHEN 'family' THEN 'عائلة' WHEN 'individual' THEN 'أفراد' ELSE b.booking_type END,
    'rep_name', COALESCE(NULLIF(btrim(b.rep_name), ''), b.created_by_name, '—'),
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
  LEFT JOIN public.buses rb ON rb.id = b.return_bus_id
  LEFT JOIN public.hotels h ON h.id = b.hotel_id
  LEFT JOIN public.packages p ON p.id = b.package_id
  WHERE b.id = _booking_id
$$;
REVOKE EXECUTE ON FUNCTION public.booking_notification_vars(uuid) FROM PUBLIC, anon, authenticated;

INSERT INTO public.notification_types (key, category, name, description, is_automatic, is_critical, priority, variables, default_title, default_body, display_order)
VALUES ('booking_deleted','bookings','حذف حجز','عند حذف حجز',true,false,'high',
  ARRAY['customer_name','booking_code','passenger_count','bus_number','seat_number','trip_date','rep_name','deleted_by'],
  '{"ar":"🗑️ حذف حجز: {customer_name}","en":"Booking deleted: {customer_name}"}',
  '{"ar":"رقم {booking_code} — {passenger_count} ركاب في باص {bus_number} (المقاعد: {seat_number}) — رحلة {trip_date} — المندوب: {rep_name} — حذفه: {deleted_by}","en":"{booking_code} — {passenger_count} pax, bus {bus_number}, seats {seat_number}, {trip_date}"}',
  9)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.notify_booking_deleted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recips uuid[]; r uuid; vars jsonb; actor text; dkey text;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    vars := public.booking_notification_vars(NEW.id);
  ELSE
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'customer_name', COALESCE(NULLIF(btrim(OLD.customer_name), ''), 'العميل'),
      'booking_code', OLD.booking_code,
      'passenger_count', OLD.passenger_count::text,
      'bus_number', COALESCE(NULLIF(bs.bus_number, 0)::text, bs.name, '—'),
      'seat_number', COALESCE(NULLIF(array_to_string(OLD.seat_numbers, '، '), ''), '—'),
      'return_seat_number', NULLIF(array_to_string(OLD.return_seat_numbers, '، '), ''),
      'trip_name', t.name,
      'trip_date', COALESCE(to_char(COALESCE(OLD.departure_date, t.departure_date), 'YYYY-MM-DD'), '—'),
      'rep_name', COALESCE(NULLIF(btrim(OLD.rep_name), ''), OLD.created_by_name, '—'),
      'customer_phone', OLD.contact_phone
    )) INTO vars
    FROM (SELECT 1) x
    LEFT JOIN public.buses bs ON bs.id = OLD.bus_id
    LEFT JOIN public.trips t ON t.id = OLD.trip_id;
  END IF;
  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'غير معروف') INTO actor FROM public.profiles p WHERE p.id = auth.uid();
  vars := vars || jsonb_build_object('deleted_by', COALESCE(actor, 'النظام'));
  dkey := 'booking_deleted:' || OLD.id::text;

  recips := public.booking_recipients(OLD.created_by, OLD.rep_profile_id, OLD.rep_name);
  IF array_length(recips, 1) IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  FOREACH r IN ARRAY recips LOOP
    PERFORM public.emit_notification('booking_deleted', r, vars, dkey, '/dashboard', NULL);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.notify_booking_deleted() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_booking_deleted ON public.bookings;
CREATE TRIGGER trg_notify_booking_deleted
AFTER DELETE OR UPDATE OF deleted_at ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_booking_deleted();