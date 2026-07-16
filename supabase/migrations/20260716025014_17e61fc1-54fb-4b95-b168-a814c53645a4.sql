
CREATE POLICY "assets_read_public" ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "assets_read_auth" ON storage.objects;
