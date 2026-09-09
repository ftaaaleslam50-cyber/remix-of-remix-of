CREATE OR REPLACE FUNCTION public.tg_trip_date_sync_buses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.departure_date IS NOT NULL AND NEW.departure_date IS DISTINCT FROM OLD.departure_date THEN
    UPDATE public.buses b SET assigned_date = NEW.departure_date
     WHERE b.trip_id = NEW.id
        OR b.id IN (SELECT tb.bus_id FROM public.trip_buses tb WHERE tb.trip_id = NEW.id);
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.tg_trip_date_sync_buses() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_trip_date_sync_buses ON public.trips;
CREATE TRIGGER trg_trip_date_sync_buses
AFTER UPDATE OF departure_date ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.tg_trip_date_sync_buses();

CREATE OR REPLACE FUNCTION public.tg_return_trip_date_sync_buses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.return_date IS NOT NULL AND NEW.return_date IS DISTINCT FROM OLD.return_date THEN
    UPDATE public.buses b SET assigned_date = NEW.return_date
     WHERE b.id IN (SELECT rtb.bus_id FROM public.return_trip_buses rtb WHERE rtb.return_trip_id = NEW.id);
  END IF;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.tg_return_trip_date_sync_buses() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_return_trip_date_sync_buses ON public.return_trips;
CREATE TRIGGER trg_return_trip_date_sync_buses
AFTER UPDATE OF return_date ON public.return_trips
FOR EACH ROW EXECUTE FUNCTION public.tg_return_trip_date_sync_buses();

UPDATE public.buses b
   SET assigned_date = x.dep
  FROM (
    SELECT tb.bus_id, MAX(t.departure_date) AS dep
      FROM public.trip_buses tb JOIN public.trips t ON t.id = tb.trip_id
     WHERE t.departure_date IS NOT NULL
     GROUP BY tb.bus_id
  ) x
 WHERE b.id = x.bus_id AND b.assigned_date IS DISTINCT FROM x.dep;

UPDATE public.buses b
   SET assigned_date = t.departure_date
  FROM public.trips t
 WHERE b.trip_id = t.id
   AND t.departure_date IS NOT NULL
   AND b.id NOT IN (SELECT bus_id FROM public.trip_buses)
   AND b.assigned_date IS DISTINCT FROM t.departure_date;