CREATE TABLE public.travel_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  id_number text NOT NULL,
  contact_phone text NOT NULL,
  whatsapp_phone text,
  same_whatsapp boolean NOT NULL DEFAULT true,
  id_image_url text,
  nationality text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_customers TO authenticated;
GRANT ALL ON public.travel_customers TO service_role;
ALTER TABLE public.travel_customers ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX travel_customers_id_number_uniq ON public.travel_customers (btrim(id_number)) WHERE btrim(id_number) <> '';
CREATE INDEX travel_customers_name_idx ON public.travel_customers (lower(full_name) text_pattern_ops);
CREATE INDEX travel_customers_phone_idx ON public.travel_customers (contact_phone);
CREATE INDEX travel_customers_wa_idx ON public.travel_customers (whatsapp_phone);
CREATE POLICY "staff manage customers" ON public.travel_customers FOR ALL TO authenticated
  USING (public.can_manage_bookings(auth.uid())) WITH CHECK (public.can_manage_bookings(auth.uid()));
CREATE TRIGGER trg_travel_customers_updated BEFORE UPDATE ON public.travel_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.bus_image_template (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  template_image_url text,
  bus_number_enabled boolean NOT NULL DEFAULT true,
  bus_number_x numeric NOT NULL DEFAULT 0.22,
  bus_number_y numeric NOT NULL DEFAULT 0.66,
  bus_number_width numeric NOT NULL DEFAULT 0.14,
  bus_number_font_size numeric NOT NULL DEFAULT 0.045,
  bus_number_font_weight integer NOT NULL DEFAULT 800,
  bus_number_alignment text NOT NULL DEFAULT 'center',
  bus_number_color text NOT NULL DEFAULT '#111111',
  bus_number2_enabled boolean NOT NULL DEFAULT false,
  bus_number2_x numeric NOT NULL DEFAULT 0.78,
  bus_number2_y numeric NOT NULL DEFAULT 0.66,
  plate_x numeric NOT NULL DEFAULT 0.5,
  plate_y numeric NOT NULL DEFAULT 0.72,
  plate_width numeric NOT NULL DEFAULT 0.14,
  plate_height numeric NOT NULL DEFAULT 0.04,
  plate_font_size numeric NOT NULL DEFAULT 0.026,
  plate_font_weight integer NOT NULL DEFAULT 800,
  plate_alignment text NOT NULL DEFAULT 'center',
  plate_color text NOT NULL DEFAULT '#111111',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bus_image_template TO authenticated;
GRANT ALL ON public.bus_image_template TO service_role;
ALTER TABLE public.bus_image_template ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read bus template" ON public.bus_image_template FOR SELECT TO authenticated USING (public.can_manage_bookings(auth.uid()));
CREATE POLICY "managers write bus template" ON public.bus_image_template FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "managers update bus template" ON public.bus_image_template FOR UPDATE TO authenticated USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
INSERT INTO public.bus_image_template (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE POLICY "staff manage customer id images" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'id-uploads' AND (storage.foldername(name))[1] = 'customers' AND public.can_manage_bookings(auth.uid()))
  WITH CHECK (bucket_id = 'id-uploads' AND (storage.foldername(name))[1] = 'customers' AND public.can_manage_bookings(auth.uid()));