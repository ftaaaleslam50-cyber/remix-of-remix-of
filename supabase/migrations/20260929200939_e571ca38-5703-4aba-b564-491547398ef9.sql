CREATE OR REPLACE FUNCTION public.tg_booking_departure_from_bus()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _d date;
BEGIN
  IF NEW.bus_id IS NOT NULL THEN
    SELECT assigned_date INTO _d FROM public.buses WHERE id = NEW.bus_id AND COALESCE(direction,'outbound') <> 'return';
    IF _d IS NOT NULL THEN NEW.departure_date := _d; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_booking_departure_from_bus() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS booking_departure_from_bus ON public.bookings;
CREATE TRIGGER booking_departure_from_bus BEFORE INSERT OR UPDATE OF bus_id, departure_date ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.tg_booking_departure_from_bus();

SET LOCAL session_replication_role = replica;
UPDATE public.bookings b SET departure_date = bu.assigned_date
FROM public.buses bu
WHERE bu.id = b.bus_id AND bu.assigned_date IS NOT NULL AND COALESCE(bu.direction,'outbound') <> 'return'
  AND b.departure_date IS DISTINCT FROM bu.assigned_date;
SET LOCAL session_replication_role = origin;