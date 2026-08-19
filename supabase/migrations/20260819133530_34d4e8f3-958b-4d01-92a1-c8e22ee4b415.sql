CREATE OR REPLACE FUNCTION public.get_bus_occupancy(_trip_id uuid DEFAULT NULL, _bus_id uuid DEFAULT NULL, _exclude_code text DEFAULT NULL)
RETURNS TABLE(bus_id uuid, seat_numbers text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT b.bus_id, b.seat_numbers
  FROM public.bookings b
  WHERE b.bus_id IS NOT NULL
    AND b.deleted_at IS NULL
    AND b.status <> 'cancelled'
    AND (_trip_id IS NULL OR b.trip_id = _trip_id)
    AND (_bus_id IS NULL OR b.bus_id = _bus_id)
    AND (_exclude_code IS NULL OR b.booking_code <> _exclude_code);
$$;

REVOKE ALL ON FUNCTION public.get_bus_occupancy(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bus_occupancy(uuid, uuid, text) TO anon, authenticated, service_role;