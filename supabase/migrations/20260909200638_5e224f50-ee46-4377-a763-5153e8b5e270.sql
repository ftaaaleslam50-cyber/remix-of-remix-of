ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS rep_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS gross_profit numeric,
  ADD COLUMN IF NOT EXISTS rep_share numeric,
  ADD COLUMN IF NOT EXISTS company_share numeric;

CREATE INDEX IF NOT EXISTS bookings_rep_profile_id_idx ON public.bookings (rep_profile_id);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_rate numeric;