UPDATE public.bookings b
SET return_date = t.return_date
FROM public.trips t
WHERE t.id = b.trip_id
  AND b.deleted_at IS NULL
  AND b.return_date IS NULL
  AND COALESCE(b.trip_mode, 'round') <> 'outbound'
  AND t.return_date IS NOT NULL;