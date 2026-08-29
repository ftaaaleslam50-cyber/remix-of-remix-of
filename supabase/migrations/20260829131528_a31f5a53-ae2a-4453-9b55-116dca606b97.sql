ALTER TABLE public.return_trips ADD COLUMN IF NOT EXISTS return_date date;

UPDATE public.return_trips
SET return_date = (
  CURRENT_DATE + ((weekday - EXTRACT(DOW FROM CURRENT_DATE)::int + 7) % 7)
)
WHERE return_date IS NULL;