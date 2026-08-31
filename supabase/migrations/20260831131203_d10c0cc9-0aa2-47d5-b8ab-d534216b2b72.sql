ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS no_show boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz;

CREATE INDEX IF NOT EXISTS bookings_no_show_idx ON public.bookings (no_show) WHERE no_show;