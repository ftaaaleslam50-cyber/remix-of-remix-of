
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_uses integer,
  ADD COLUMN IF NOT EXISTS usage_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

-- Ensure phone is nullable for manual coupons (not tied to a user's phone)
ALTER TABLE public.coupons ALTER COLUMN phone DROP NOT NULL;
