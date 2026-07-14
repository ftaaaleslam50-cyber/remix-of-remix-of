
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS nationality text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS booking_source text;
