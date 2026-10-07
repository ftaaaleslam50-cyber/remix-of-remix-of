ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_extension_nights_check;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_extension_nights_check CHECK (extension_nights >= 0);