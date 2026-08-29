REVOKE SELECT ON public.buses FROM anon;
GRANT SELECT (
  id, trip_id, bus_number, capacity, active, blocked_seats, created_at,
  name, plate, model, status, priority, is_active_booking, updated_at,
  layout, image_url, bus_type, details, price_addition, layout_id,
  expenses, round_trip_price, outbound_price, return_price
) ON public.buses TO anon;