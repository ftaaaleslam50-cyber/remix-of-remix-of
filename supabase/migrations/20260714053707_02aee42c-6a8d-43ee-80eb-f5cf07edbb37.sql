
-- 1) Hotel rating
ALTER TABLE public.packages ADD COLUMN IF NOT EXISTS stars smallint;

-- 2) Bus layouts
CREATE TABLE IF NOT EXISTS public.bus_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  seat_count integer NOT NULL DEFAULT 0,
  layout_json jsonb NOT NULL DEFAULT '{"rows":10,"cols":5,"cells":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bus_layouts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bus_layouts TO authenticated;
GRANT ALL ON public.bus_layouts TO service_role;
ALTER TABLE public.bus_layouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bus_layouts read all" ON public.bus_layouts FOR SELECT USING (true);
CREATE POLICY "bus_layouts admin write" ON public.bus_layouts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_bus_layouts_updated BEFORE UPDATE ON public.bus_layouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.buses ADD COLUMN IF NOT EXISTS layout_id uuid REFERENCES public.bus_layouts(id) ON DELETE SET NULL;

-- 3) Trip <-> Bus assignments
CREATE TABLE IF NOT EXISTS public.trip_buses (
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  bus_id uuid NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, bus_id)
);
GRANT SELECT ON public.trip_buses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_buses TO authenticated;
GRANT ALL ON public.trip_buses TO service_role;
ALTER TABLE public.trip_buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip_buses read all" ON public.trip_buses FOR SELECT USING (true);
CREATE POLICY "trip_buses admin write" ON public.trip_buses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) Gallery videos
ALTER TABLE public.gallery_images ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image';
ALTER TABLE public.gallery_images ADD COLUMN IF NOT EXISTS video_url text;

-- 5) Homepage sections
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  title text,
  subtitle text,
  image_url text,
  button_text text,
  button_link text,
  bg_color text,
  visible boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.homepage_sections TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homepage_sections TO authenticated;
GRANT ALL ON public.homepage_sections TO service_role;
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "homepage_sections read all" ON public.homepage_sections FOR SELECT USING (true);
CREATE POLICY "homepage_sections admin write" ON public.homepage_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_homepage_sections_updated BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.homepage_sections (section_key, title, subtitle, button_text, button_link, display_order, visible) VALUES
  ('hero','رحلات العمرة الفاخرة','احجز رحلتك بسهولة وراحة','احجز الآن','/booking',1,true),
  ('features','لماذا نحن','خدمة متميزة وأسعار تنافسية',NULL,NULL,2,true),
  ('hotels','فنادقنا','اختر من بين أفضل الفنادق',NULL,NULL,3,true),
  ('trips','رحلاتنا','جداول الرحلات المتاحة',NULL,NULL,4,true),
  ('gallery','معرض الصور','لحظات من رحلاتنا','عرض المعرض','/gallery',5,true),
  ('contact','تواصل معنا','نحن هنا للإجابة على استفساراتك','اتصل بنا','/contact',6,true)
ON CONFLICT (section_key) DO NOTHING;
