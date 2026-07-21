
-- Packages
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  tier TEXT NOT NULL DEFAULT 'standard',
  includes JSONB DEFAULT '[]'::jsonb,
  base_price NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.packages TO anon, authenticated;
GRANT ALL ON public.packages TO authenticated, service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages public read" ON public.packages FOR SELECT USING (active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "packages admin all" ON public.packages FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER packages_updated BEFORE UPDATE ON public.packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pricing matrix: package × room × passenger count
CREATE TABLE public.pricing_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  passenger_count INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  season TEXT DEFAULT 'default',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(package_id, room_type, passenger_count, season)
);
GRANT SELECT ON public.pricing_matrix TO anon, authenticated;
GRANT ALL ON public.pricing_matrix TO authenticated, service_role;
ALTER TABLE public.pricing_matrix ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pricing public read" ON public.pricing_matrix FOR SELECT USING (true);
CREATE POLICY "pricing admin all" ON public.pricing_matrix FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER pricing_updated BEFORE UPDATE ON public.pricing_matrix FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wheel config (single row)
CREATE TABLE public.wheel_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  spin_cooldown_days INTEGER NOT NULL DEFAULT 30,
  coupon_expiry_hours INTEGER NOT NULL DEFAULT 24,
  title TEXT DEFAULT 'عجلة السحب',
  subtitle TEXT DEFAULT 'جرّب حظك واحصل على خصومات مميزة',
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (id = 1)
);
GRANT SELECT ON public.wheel_config TO anon, authenticated;
GRANT ALL ON public.wheel_config TO authenticated, service_role;
ALTER TABLE public.wheel_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wheel_config read" ON public.wheel_config FOR SELECT USING (true);
CREATE POLICY "wheel_config admin" ON public.wheel_config FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.wheel_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Wheel segments
CREATE TABLE public.wheel_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#c8102e',
  prize_type TEXT NOT NULL DEFAULT 'lose', -- lose | percent | fixed
  prize_value NUMERIC NOT NULL DEFAULT 0,
  probability_weight NUMERIC NOT NULL DEFAULT 1,
  display_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT ON public.wheel_segments TO anon, authenticated;
GRANT ALL ON public.wheel_segments TO authenticated, service_role;
ALTER TABLE public.wheel_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments read" ON public.wheel_segments FOR SELECT USING (true);
CREATE POLICY "segments admin" ON public.wheel_segments FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Wheel spins log
CREATE TABLE public.wheel_spins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  ip TEXT,
  segment_id UUID REFERENCES public.wheel_segments(id) ON DELETE SET NULL,
  coupon_id UUID,
  spun_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wheel_spins TO anon, authenticated;
GRANT ALL ON public.wheel_spins TO service_role;
ALTER TABLE public.wheel_spins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spins admin read" ON public.wheel_spins FOR SELECT USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "spins admin all" ON public.wheel_spins FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX wheel_spins_phone_idx ON public.wheel_spins(phone, spun_at DESC);
CREATE INDEX wheel_spins_ip_idx ON public.wheel_spins(ip, spun_at DESC);

-- Coupons
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  ip TEXT,
  prize_type TEXT NOT NULL, -- percent | fixed
  prize_value NUMERIC NOT NULL,
  label TEXT,
  issue_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  used_in_booking_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.coupons TO anon, authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons public lookup" ON public.coupons FOR SELECT USING (true);
CREATE POLICY "coupons public update usage" ON public.coupons FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "coupons admin all" ON public.coupons FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Bookings: add coupon + discount + booking_steps/ticket_template settings
ALTER TABLE public.bookings 
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS booking_steps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ticket_template JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS terms_text TEXT DEFAULT '';

-- Update whatsapp default
UPDATE public.app_settings SET whatsapp = '966573890050' WHERE id = 1 AND (whatsapp IS NULL OR whatsapp = '' OR whatsapp = '966573890050');

-- Seed packages
INSERT INTO public.packages (slug, name, description, tier, base_price, display_order) VALUES
  ('transport', 'باقة مواصلات فقط', 'مقعد في الحافلة من المدينة إلى مكة بدون فندق', 'basic', 60, 1),
  ('economy', 'باقة فندق اقتصادي', 'إقامة في فندق اقتصادي مع مواصلات مريحة', 'economy', 80, 2),
  ('3stars', 'باقة 3 نجوم', 'فندق 3 نجوم قريب من الحرم', '3stars', 100, 3),
  ('4stars', 'باقة 4 نجوم', 'فندق 4 نجوم مع خدمات مميزة', '4stars', 130, 4),
  ('5stars', 'باقة 5 نجوم', 'تجربة فاخرة في فندق 5 نجوم', '5stars', 180, 5)
ON CONFLICT (slug) DO NOTHING;

-- Seed pricing_matrix (rooms 1..5, passenger_count corresponds to room)
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id, slug, base_price FROM public.packages LOOP
    -- transport-only: 60 per person, any room
    IF p.slug = 'transport' THEN
      INSERT INTO public.pricing_matrix (package_id, room_type, passenger_count, price)
      VALUES 
        (p.id,'1',1,60),(p.id,'2',2,60),(p.id,'3',3,60),(p.id,'4',4,60),(p.id,'5',5,60)
      ON CONFLICT DO NOTHING;
    ELSIF p.slug = 'economy' THEN
      INSERT INTO public.pricing_matrix (package_id, room_type, passenger_count, price)
      VALUES 
        (p.id,'5',5,80),(p.id,'4',4,90),(p.id,'3',3,100),(p.id,'2',2,120),(p.id,'1',1,150)
      ON CONFLICT DO NOTHING;
    ELSIF p.slug = '3stars' THEN
      INSERT INTO public.pricing_matrix (package_id, room_type, passenger_count, price)
      VALUES 
        (p.id,'5',5,100),(p.id,'4',4,115),(p.id,'3',3,130),(p.id,'2',2,160),(p.id,'1',1,200)
      ON CONFLICT DO NOTHING;
    ELSIF p.slug = '4stars' THEN
      INSERT INTO public.pricing_matrix (package_id, room_type, passenger_count, price)
      VALUES 
        (p.id,'5',5,130),(p.id,'4',4,150),(p.id,'3',3,170),(p.id,'2',2,210),(p.id,'1',1,260)
      ON CONFLICT DO NOTHING;
    ELSIF p.slug = '5stars' THEN
      INSERT INTO public.pricing_matrix (package_id, room_type, passenger_count, price)
      VALUES 
        (p.id,'5',5,180),(p.id,'4',4,210),(p.id,'3',3,240),(p.id,'2',2,290),(p.id,'1',1,360)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Seed wheel segments (default 6)
INSERT INTO public.wheel_segments (label, color, prize_type, prize_value, probability_weight, display_order) VALUES
  ('عوضك الله في المرة القادمة', '#334155', 'lose', 0, 25, 1),
  ('خصم 5%', '#c8102e', 'percent', 5, 15, 2),
  ('عوضك الله في المرة القادمة', '#475569', 'lose', 0, 25, 3),
  ('خصم 10%', '#d4af37', 'percent', 10, 9, 4),
  ('عوضك الله في المرة القادمة', '#64748b', 'lose', 0, 25, 5),
  ('عمرة مجانية لشخص واحد', '#065f46', 'fixed', 60, 1, 6)
ON CONFLICT DO NOTHING;
