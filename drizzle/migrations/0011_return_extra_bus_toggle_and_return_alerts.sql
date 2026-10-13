ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS return_extra_bus_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.return_bus_occupancy_alerts (
  bus_id uuid NOT NULL,
  return_date date NOT NULL,
  threshold integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bus_id, return_date, threshold)
);
GRANT ALL ON public.return_bus_occupancy_alerts TO service_role;
ALTER TABLE public.return_bus_occupancy_alerts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notify_return_bus_occupancy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
  v_cap int; v_used int; v_pct int; v_name text; t int;
BEGIN
  FOR r IN
    SELECT DISTINCT x.bus_id, x.d FROM (
      SELECT NEW.return_bus_id AS bus_id, NEW.actual_return_date AS d WHERE TG_OP <> 'DELETE'
      UNION ALL
      SELECT OLD.return_bus_id, OLD.actual_return_date WHERE TG_OP <> 'INSERT'
    ) x WHERE x.bus_id IS NOT NULL AND x.d IS NOT NULL
  LOOP
    SELECT capacity, COALESCE(name, 'حافلة ' || bus_number) INTO v_cap, v_name FROM public.buses WHERE id = r.bus_id;
    CONTINUE WHEN v_cap IS NULL OR v_cap <= 0;
    SELECT COALESCE(SUM(COALESCE(array_length(return_seat_numbers, 1), 0)), 0) INTO v_used
      FROM public.bookings
      WHERE return_bus_id = r.bus_id AND actual_return_date = r.d
        AND deleted_at IS NULL AND COALESCE(status, '') <> 'cancelled';
    v_pct := FLOOR((v_used::numeric / v_cap) * 100);
    DELETE FROM public.return_bus_occupancy_alerts WHERE bus_id = r.bus_id AND return_date = r.d AND threshold > v_pct;
    FOREACH t IN ARRAY ARRAY[50, 70, 80, 90, 100] LOOP
      IF v_pct >= t AND NOT EXISTS (
        SELECT 1 FROM public.return_bus_occupancy_alerts WHERE bus_id = r.bus_id AND return_date = r.d AND threshold = t
      ) THEN
        INSERT INTO public.return_bus_occupancy_alerts (bus_id, return_date, threshold) VALUES (r.bus_id, r.d, t);
        INSERT INTO public.notifications (type, category, title, body, link, metadata)
        VALUES (
          'return_bus_occupancy', 'buses',
          CASE WHEN t = 100 THEN 'اكتملت حافلة العودة: ' || v_name || ' (' || to_char(r.d, 'YYYY-MM-DD') || ')'
               ELSE 'إشغال حافلة العودة ' || v_name || ' بلغ ' || t || '% (' || to_char(r.d, 'YYYY-MM-DD') || ')' END,
          'مقاعد العودة المحجوزة ' || v_used || ' من ' || v_cap || ' (' || v_pct || '%)',
          '/dashboard',
          jsonb_build_object('bus_id', r.bus_id, 'return_date', r.d, 'threshold', t, 'used', v_used, 'capacity', v_cap, 'direction', 'return')
        );
      END IF;
    END LOOP;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_return_bus_occupancy_notify ON public.bookings;
CREATE TRIGGER trg_return_bus_occupancy_notify
AFTER INSERT OR DELETE OR UPDATE OF return_seat_numbers, return_bus_id, actual_return_date, status, deleted_at ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_return_bus_occupancy();