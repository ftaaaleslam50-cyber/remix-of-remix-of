
CREATE TABLE IF NOT EXISTS public.bus_occupancy_alerts (
  bus_id uuid NOT NULL,
  threshold int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bus_id, threshold)
);
GRANT SELECT ON public.bus_occupancy_alerts TO authenticated;
GRANT ALL ON public.bus_occupancy_alerts TO service_role;
ALTER TABLE public.bus_occupancy_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bus_occupancy_alerts_admin_read" ON public.bus_occupancy_alerts;
CREATE POLICY "bus_occupancy_alerts_admin_read" ON public.bus_occupancy_alerts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.notify_bus_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bus uuid;
  v_cap int;
  v_used int;
  v_pct int;
  v_name text;
  t int;
BEGIN
  v_bus := COALESCE(NEW.bus_id, OLD.bus_id);
  IF v_bus IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT capacity, COALESCE(name, 'حافلة ' || bus_number) INTO v_cap, v_name
  FROM public.buses WHERE id = v_bus;
  IF v_cap IS NULL OR v_cap <= 0 THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT COALESCE(SUM(COALESCE(array_length(seat_numbers, 1), 0)), 0) INTO v_used
  FROM public.bookings
  WHERE bus_id = v_bus AND COALESCE(status, '') <> 'cancelled';

  v_pct := FLOOR((v_used::numeric / v_cap) * 100);

  -- allow re-alerting if occupancy dropped below a level
  DELETE FROM public.bus_occupancy_alerts WHERE bus_id = v_bus AND threshold > v_pct;

  FOREACH t IN ARRAY ARRAY[50, 70, 80, 90, 100] LOOP
    IF v_pct >= t AND NOT EXISTS (
      SELECT 1 FROM public.bus_occupancy_alerts WHERE bus_id = v_bus AND threshold = t
    ) THEN
      INSERT INTO public.bus_occupancy_alerts (bus_id, threshold) VALUES (v_bus, t);
      INSERT INTO public.notifications (type, category, title, body, link, metadata)
      VALUES (
        'bus_occupancy',
        'buses',
        CASE WHEN t = 100 THEN 'اكتملت الحافلة: ' || v_name
             ELSE 'إشغال الحافلة ' || v_name || ' بلغ ' || t || '%' END,
        'المقاعد المحجوزة ' || v_used || ' من ' || v_cap || ' (' || v_pct || '%)',
        '/dashboard',
        jsonb_build_object('bus_id', v_bus, 'threshold', t, 'used', v_used, 'capacity', v_cap)
      );
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bus_occupancy_notify ON public.bookings;
CREATE TRIGGER trg_bus_occupancy_notify
AFTER INSERT OR UPDATE OF seat_numbers, bus_id, status OR DELETE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_bus_occupancy();
