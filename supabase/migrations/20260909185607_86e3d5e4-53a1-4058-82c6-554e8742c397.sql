ALTER TABLE public.buses ADD COLUMN IF NOT EXISTS assigned_date date;

CREATE OR REPLACE FUNCTION public.tg_bus_assigned_date_trip_buses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.buses b
     SET assigned_date = COALESCE((SELECT t.departure_date FROM public.trips t WHERE t.id = NEW.trip_id), CURRENT_DATE)
   WHERE b.id = NEW.bus_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bus_assigned_date_trip_buses ON public.trip_buses;
CREATE TRIGGER trg_bus_assigned_date_trip_buses
AFTER INSERT ON public.trip_buses
FOR EACH ROW EXECUTE FUNCTION public.tg_bus_assigned_date_trip_buses();

CREATE OR REPLACE FUNCTION public.tg_bus_assigned_date_return_buses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.buses b
     SET assigned_date = COALESCE(NEW.trip_date, CURRENT_DATE)
   WHERE b.id = NEW.bus_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bus_assigned_date_return_buses ON public.return_trip_buses;
CREATE TRIGGER trg_bus_assigned_date_return_buses
AFTER INSERT ON public.return_trip_buses
FOR EACH ROW EXECUTE FUNCTION public.tg_bus_assigned_date_return_buses();

CREATE OR REPLACE FUNCTION public.tg_bus_assigned_date_self()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.trip_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.trip_id IS DISTINCT FROM OLD.trip_id)
     AND NEW.assigned_date IS NOT DISTINCT FROM COALESCE(OLD.assigned_date, NEW.assigned_date) THEN
    NEW.assigned_date := COALESCE(
      (SELECT t.departure_date FROM public.trips t WHERE t.id = NEW.trip_id),
      NEW.assigned_date,
      CURRENT_DATE
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_bus_assigned_date_self ON public.buses;
CREATE TRIGGER trg_bus_assigned_date_self
BEFORE INSERT OR UPDATE OF trip_id ON public.buses
FOR EACH ROW EXECUTE FUNCTION public.tg_bus_assigned_date_self();

UPDATE public.buses b
   SET assigned_date = COALESCE(
        (SELECT t.departure_date FROM public.trip_buses tb JOIN public.trips t ON t.id = tb.trip_id WHERE tb.bus_id = b.id ORDER BY t.departure_date DESC NULLS LAST LIMIT 1),
        (SELECT rtb.trip_date FROM public.return_trip_buses rtb WHERE rtb.bus_id = b.id ORDER BY rtb.trip_date DESC LIMIT 1),
        (SELECT t.departure_date FROM public.trips t WHERE t.id = b.trip_id),
        b.created_at::date)
 WHERE b.assigned_date IS NULL;