
-- id-uploads: anyone can insert, only admin can read
CREATE POLICY "anyone upload id" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'id-uploads');
CREATE POLICY "admin read id" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'id-uploads' AND public.has_role(auth.uid(), 'admin'));

-- gallery & hotels: anyone read, admin write
CREATE POLICY "public read gallery" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('gallery','hotels'));
CREATE POLICY "admin write gallery" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('gallery','hotels') AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update gallery" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('gallery','hotels') AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete gallery" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('gallery','hotels') AND public.has_role(auth.uid(), 'admin'));
