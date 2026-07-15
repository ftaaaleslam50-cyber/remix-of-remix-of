
CREATE TABLE public.package_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.package_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_images TO authenticated;
GRANT ALL ON public.package_images TO service_role;

ALTER TABLE public.package_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "package_images_public_read" ON public.package_images
  FOR SELECT USING (true);

CREATE POLICY "package_images_admin_insert" ON public.package_images
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "package_images_admin_update" ON public.package_images
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "package_images_admin_delete" ON public.package_images
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_package_images_updated_at
  BEFORE UPDATE ON public.package_images
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
