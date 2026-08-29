REVOKE SELECT ON public.buses FROM anon;
GRANT SELECT (
  id, trip_id, bus_number, name, capacity, active, status, priority,
  is_active_booking, blocked_seats, layout, layout_id, image_url,
  bus_type, details, price_addition, round_trip_price, outbound_price,
  return_price, plate, model, expenses, created_at, updated_at
) ON public.buses TO anon;
GRANT SELECT ON public.buses TO authenticated;