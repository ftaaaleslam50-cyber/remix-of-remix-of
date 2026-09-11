
-- 1) إزالة الارتباط القديم غير المتوافق (buses.trip_id بدون صف في trip_buses)
UPDATE public.buses b
SET trip_id = NULL
WHERE b.trip_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.trip_buses tb WHERE tb.trip_id = b.trip_id AND tb.bus_id = b.id);

-- 2) مزامنة تلقائية مستقبلًا
CREATE OR REPLACE FUNCTION public.tg_sync_bus_trip_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.buses SET trip_id = NEW.trip_id WHERE id = NEW.bus_id;
    RETURN NEW;
  ELSE
    UPDATE public.buses SET trip_id = NULL WHERE id = OLD.bus_id AND trip_id = OLD.trip_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_bus_trip_link ON public.trip_buses;
CREATE TRIGGER trg_sync_bus_trip_link
AFTER INSERT OR DELETE ON public.trip_buses
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_bus_trip_link();
