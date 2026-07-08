
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_log;

ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.audit_log REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.tg_booking_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(type, title, body, link)
    VALUES ('booking_created', 'حجز جديد',
      COALESCE(NEW.customer_name,'') || ' — ' || COALESCE(NEW.booking_code,''),
      '/ticket/' || NEW.booking_code);
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
    VALUES (NEW.user_id, 'booking.create', 'bookings', NEW.id::text,
      jsonb_build_object('code', NEW.booking_code, 'total', NEW.total_price));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.notifications(type, title, body, link)
      VALUES ('booking_status', 'تحديث حالة حجز',
        COALESCE(NEW.booking_code,'') || ': ' || COALESCE(OLD.status,'') || ' → ' || COALESCE(NEW.status,''),
        '/ticket/' || NEW.booking_code);
    END IF;
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
    VALUES (auth.uid(), 'booking.update', 'bookings', NEW.id::text,
      jsonb_build_object('code', NEW.booking_code,
        'from_status', OLD.status, 'to_status', NEW.status,
        'deleted', NEW.deleted_at IS NOT NULL));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS booking_notify ON public.bookings;
CREATE TRIGGER booking_notify AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_booking_notify();

CREATE OR REPLACE FUNCTION public.tg_bus_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(),
    CASE TG_OP WHEN 'INSERT' THEN 'bus.create' WHEN 'UPDATE' THEN 'bus.update' ELSE 'bus.delete' END,
    'buses',
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object(
      'bus_number', COALESCE(NEW.bus_number, OLD.bus_number),
      'name', COALESCE(NEW.name, OLD.name),
      'active', COALESCE(NEW.active, OLD.active),
      'is_active_booking', COALESCE(NEW.is_active_booking, OLD.is_active_booking)
    ));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS bus_audit ON public.buses;
CREATE TRIGGER bus_audit AFTER INSERT OR UPDATE OR DELETE ON public.buses
FOR EACH ROW EXECUTE FUNCTION public.tg_bus_audit();
