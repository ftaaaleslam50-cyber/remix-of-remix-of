
-- =========== ROLES ===========
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========== APP SETTINGS (singleton) ===========
CREATE TABLE public.app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL DEFAULT 'مؤسسة زهرة طيبة للعمرة',
  email TEXT NOT NULL DEFAULT 'zhrttybt888@gmail.com',
  national_number TEXT NOT NULL DEFAULT '7029663460',
  whatsapp TEXT NOT NULL DEFAULT '966573890050',
  phone TEXT NOT NULL DEFAULT '966500000000',
  tiktok_url TEXT DEFAULT '',
  instagram_url TEXT DEFAULT '',
  snapchat_url TEXT DEFAULT '',
  maps_url TEXT DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT 'https://i.ibb.co/8ntds0qQ/image.png',
  hero_title TEXT NOT NULL DEFAULT 'احجز رحلتك للعمرة الآن',
  hero_subtitle TEXT NOT NULL DEFAULT 'رحلات منظمة من المدينة المنورة إلى مكة المكرمة بأعلى درجات الراحة والموثوقية',
  hero_cta TEXT NOT NULL DEFAULT 'ابدأ الحجز الآن',
  -- pricing
  price_transport_only NUMERIC NOT NULL DEFAULT 60,
  price_individual NUMERIC NOT NULL DEFAULT 80,
  price_family_5 NUMERIC NOT NULL DEFAULT 80,
  price_family_4 NUMERIC NOT NULL DEFAULT 90,
  price_family_3 NUMERIC NOT NULL DEFAULT 100,
  price_family_2 NUMERIC NOT NULL DEFAULT 120,
  price_family_1 NUMERIC NOT NULL DEFAULT 180,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
INSERT INTO public.app_settings (id) VALUES (1);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings admin update" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========== HOTELS ===========
CREATE TABLE public.hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC NOT NULL DEFAULT 0,
  distance_km NUMERIC NOT NULL DEFAULT 0,
  amenities TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT NOT NULL DEFAULT '',
  gallery TEXT[] NOT NULL DEFAULT '{}',
  price_addition NUMERIC NOT NULL DEFAULT 0,
  price_label TEXT NOT NULL DEFAULT '',
  available BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_no_hotel BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER hotels_updated BEFORE UPDATE ON public.hotels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
GRANT SELECT ON public.hotels TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hotels TO authenticated;
GRANT ALL ON public.hotels TO service_role;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotels public read" ON public.hotels FOR SELECT USING (true);
CREATE POLICY "hotels admin write" ON public.hotels FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.hotels (name, description, stars, price_addition, price_label, display_order, is_no_hotel, image_url) VALUES
('بدون فندق', 'اختر هذا إذا كان لديك إقامة خاصة', 0, 0, 'بدون تكلفة إضافية', 1, true, 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800'),
('فندق اقتصادي', 'إقامة مريحة بسعر مناسب', 2, 50, '+ 50 ريال للفرد', 2, false, 'https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=800'),
('فندق 3 نجوم', 'خدمات جيدة وقريب من الحرم', 3, 100, '+ 100 ريال للفرد', 3, false, 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800'),
('فندق 4 نجوم', 'فندق فاخر بإطلالة مميزة', 4, 200, '+ 200 ريال للفرد', 4, false, 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800'),
('فندق 5 نجوم', 'إطلالة مباشرة على الحرم', 5, 300, '+ 300 ريال للفرد', 5, false, 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800'),
('VIP Suite', 'تجربة VIP استثنائية', 5, 500, '+ 500 ريال للفرد', 6, false, 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800');

-- =========== TRIPS ===========
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  departure_day TEXT NOT NULL,
  return_day TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 48,
  active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trips TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.trips TO authenticated;
GRANT ALL ON public.trips TO service_role;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trips public read" ON public.trips FOR SELECT USING (true);
CREATE POLICY "trips admin write" ON public.trips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.trips (name, departure_day, return_day, display_order) VALUES
('رحلة السبت — عودة الاثنين', 'السبت', 'الاثنين', 1),
('رحلة الاثنين — عودة الأربعاء', 'الاثنين', 'الأربعاء', 2),
('رحلة الأربعاء — عودة الجمعة', 'الأربعاء', 'الجمعة', 3),
('رحلة الخميس — عودة السبت', 'الخميس', 'السبت', 4);

-- =========== BUSES ===========
CREATE TABLE public.buses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  bus_number INTEGER NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 48,
  active BOOLEAN NOT NULL DEFAULT true,
  blocked_seats TEXT[] NOT NULL DEFAULT '{"A2"}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trip_id, bus_number)
);
GRANT SELECT ON public.buses TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.buses TO authenticated;
GRANT ALL ON public.buses TO service_role;
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "buses public read" ON public.buses FOR SELECT USING (true);
CREATE POLICY "buses admin write" ON public.buses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create one bus per trip
INSERT INTO public.buses (trip_id, bus_number)
SELECT id, 1 FROM public.trips;

-- =========== BOOKINGS ===========
CREATE SEQUENCE public.booking_seq START 1;

CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code TEXT NOT NULL UNIQUE,
  booking_type TEXT NOT NULL CHECK (booking_type IN ('individual','family')),
  passenger_count INTEGER NOT NULL CHECK (passenger_count > 0),
  room_type TEXT NOT NULL CHECK (room_type IN ('1','2','3','4','5')),
  hotel_id UUID REFERENCES public.hotels(id),
  trip_id UUID NOT NULL REFERENCES public.trips(id),
  bus_id UUID NOT NULL REFERENCES public.buses(id),
  seat_numbers TEXT[] NOT NULL DEFAULT '{}',
  customer_name TEXT NOT NULL,
  id_number TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  whatsapp_phone TEXT NOT NULL,
  id_image_url TEXT,
  price_per_person NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled','pending')),
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER bookings_updated BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX bookings_bus_idx ON public.bookings(bus_id);
CREATE INDEX bookings_trip_idx ON public.bookings(trip_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO authenticated;
GRANT INSERT ON public.bookings TO anon;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can create booking" ON public.bookings FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "admin read all bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete bookings" ON public.bookings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Booking code generator
CREATE OR REPLACE FUNCTION public.generate_booking_code()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  next_n INTEGER;
BEGIN
  next_n := nextval('public.booking_seq');
  RETURN 'ZT-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(next_n::TEXT, 6, '0');
END $$;
GRANT EXECUTE ON FUNCTION public.generate_booking_code() TO anon, authenticated;

-- =========== GALLERY ===========
CREATE TABLE public.gallery_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gallery_albums TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gallery_albums TO authenticated;
GRANT ALL ON public.gallery_albums TO service_role;
ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "albums public read" ON public.gallery_albums FOR SELECT USING (true);
CREATE POLICY "albums admin write" ON public.gallery_albums FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.gallery_albums (name, slug, display_order) VALUES
('الرحلات','trips',1),('الفنادق','hotels',2),('الحافلات','buses',3),('الخدمات','services',4);

CREATE TABLE public.gallery_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES public.gallery_albums(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gallery_images TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gallery_images TO authenticated;
GRANT ALL ON public.gallery_images TO service_role;
ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "images public read" ON public.gallery_images FOR SELECT USING (true);
CREATE POLICY "images admin write" ON public.gallery_images FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed sample gallery
WITH a AS (SELECT id, slug FROM public.gallery_albums)
INSERT INTO public.gallery_images (album_id, image_url, display_order)
SELECT a.id, url, ord FROM a CROSS JOIN LATERAL (
  VALUES
    ('https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1200', 1),
    ('https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=1200', 2),
    ('https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?w=1200', 3)
) AS v(url, ord)
WHERE a.slug IN ('trips','hotels','buses','services');
