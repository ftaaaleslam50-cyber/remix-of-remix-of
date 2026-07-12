
-- Trips: add time & period fields
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS departure_time time,
  ADD COLUMN IF NOT EXISTS return_time time,
  ADD COLUMN IF NOT EXISTS departure_period text,
  ADD COLUMN IF NOT EXISTS return_period text;

-- Homepage CMS: extend app_settings for editable sections
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS hero_image_url text,
  ADD COLUMN IF NOT EXISTS about_title text,
  ADD COLUMN IF NOT EXISTS about_body text,
  ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS testimonials jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faq jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cta_title text,
  ADD COLUMN IF NOT EXISTS cta_body text,
  ADD COLUMN IF NOT EXISTS cta_button_label text;

-- Exhibition module
CREATE TABLE IF NOT EXISTS public.exhibitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  image_url text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.exhibitions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhibitions TO authenticated;
GRANT ALL ON public.exhibitions TO service_role;
ALTER TABLE public.exhibitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exhibitions_public_read_active" ON public.exhibitions
  FOR SELECT USING (active = true);
CREATE POLICY "exhibitions_admin_all" ON public.exhibitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE TRIGGER trg_exhibitions_updated_at BEFORE UPDATE ON public.exhibitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Exhibition registrations
CREATE TABLE IF NOT EXISTS public.exhibition_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exhibition_id uuid NOT NULL REFERENCES public.exhibitions(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.exhibition_registrations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exhibition_registrations TO authenticated;
GRANT ALL ON public.exhibition_registrations TO service_role;
ALTER TABLE public.exhibition_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exh_reg_public_insert" ON public.exhibition_registrations
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "exh_reg_auth_insert" ON public.exhibition_registrations
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "exh_reg_admin_read" ON public.exhibition_registrations
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
CREATE POLICY "exh_reg_admin_delete" ON public.exhibition_registrations
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));
