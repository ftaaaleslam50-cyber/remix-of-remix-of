
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS actual_return_day text;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS return_options text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.buses ADD COLUMN IF NOT EXISTS expenses numeric NOT NULL DEFAULT 0;
