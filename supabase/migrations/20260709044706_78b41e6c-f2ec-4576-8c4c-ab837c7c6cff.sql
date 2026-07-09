
-- Fix booking notify trigger: use created_by, not non-existent user_id
CREATE OR REPLACE FUNCTION public.tg_booking_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(type, title, body, link)
    VALUES ('booking_created', 'حجز جديد',
      COALESCE(NEW.customer_name,'') || ' — ' || COALESCE(NEW.booking_code,''),
      '/ticket/' || NEW.booking_code);
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
    VALUES (NEW.created_by, 'booking.create', 'bookings', NEW.id::text,
      jsonb_build_object('code', NEW.booking_code, 'total', NEW.total_price));
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.notifications(type, title, body, link)
      VALUES ('booking_status', 'تحديث حالة حجز',
        COALESCE(NEW.booking_code,'') || ': ' || COALESCE(OLD.status,'') || ' → ' || COALESCE(NEW.status,''),
        '/ticket/' || NEW.booking_code);
    END IF;
    INSERT INTO public.audit_log(actor_id, action, entity, entity_id, details)
    VALUES (COALESCE(auth.uid(), NEW.updated_by, NEW.created_by),
      'booking.update', 'bookings', NEW.id::text,
      jsonb_build_object('code', NEW.booking_code,
        'from_status', OLD.status, 'to_status', NEW.status,
        'deleted', NEW.deleted_at IS NOT NULL));
  END IF;
  RETURN NEW;
END $function$;

-- Add configurable seat layout per bus: 'A' = 49 seats, 'B' = 51 seats (adds F1..F4)
ALTER TABLE public.buses
  ADD COLUMN IF NOT EXISTS layout text NOT NULL DEFAULT 'A'
    CHECK (layout IN ('A','B'));

-- Sync capacity to layout for existing rows if it looks like a default
UPDATE public.buses SET capacity = 49 WHERE layout = 'A' AND capacity IS NULL;
