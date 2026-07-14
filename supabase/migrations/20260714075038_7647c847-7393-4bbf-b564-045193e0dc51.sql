
-- P5: Drop Events (exhibitions) module entirely
DROP TABLE IF EXISTS public.exhibition_registrations CASCADE;
DROP TABLE IF EXISTS public.exhibitions CASCADE;

-- P9: Add missing social-media columns on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS telegram_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS twitter_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube_url text DEFAULT '';
