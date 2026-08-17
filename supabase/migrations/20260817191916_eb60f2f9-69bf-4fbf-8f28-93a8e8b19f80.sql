CREATE OR REPLACE FUNCTION public.get_ticket(_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(t) FROM (
    SELECT b.booking_code, b.booking_type, b.passenger_count, b.room_type, b.customer_name,
           b.id_number, b.contact_phone, b.whatsapp_phone, b.seat_numbers, b.price_per_person,
           b.total_price, b.discount_amount, b.coupon_code, b.id_image_url, b.created_at,
           b.notes, b.actual_return_day, b.extension_nights,
           (SELECT jsonb_build_object('name', p.name) FROM public.packages p WHERE p.id = b.package_id) AS packages,
           (SELECT jsonb_build_object('name', h.name) FROM public.hotels h WHERE h.id = b.hotel_id) AS hotels,
           (SELECT jsonb_build_object('name', tr.name, 'departure_day', tr.departure_day, 'return_day', tr.return_day)
              FROM public.trips tr WHERE tr.id = b.trip_id) AS trips,
           (SELECT jsonb_build_object('bus_number', bu.bus_number, 'name', bu.name, 'plate', bu.plate, 'layout_id', bu.layout_id)
              FROM public.buses bu WHERE bu.id = b.bus_id) AS buses,
           (SELECT bl.layout_json FROM public.buses bu2
              JOIN public.bus_layouts bl ON bl.id = bu2.layout_id
              WHERE bu2.id = b.bus_id) AS layout_json
    FROM public.bookings b
    WHERE b.booking_code = _code
    LIMIT 1
  ) t;
$$;

REVOKE ALL ON FUNCTION public.get_ticket(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ticket(text) TO anon, authenticated;