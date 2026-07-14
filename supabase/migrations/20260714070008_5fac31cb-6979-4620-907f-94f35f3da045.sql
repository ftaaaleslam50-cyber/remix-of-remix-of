
-- 1) Relax bookings insert policy: allow zero total (transport-only / promo)
DROP POLICY IF EXISTS "anyone can create booking" ON public.bookings;
CREATE POLICY "anyone can create booking"
  ON public.bookings
  FOR INSERT
  WITH CHECK (
    passenger_count > 0
    AND length(customer_name) > 1
    AND length(id_number) > 3
    AND length(contact_phone) > 5
    AND total_price >= 0
  );

-- 2) id-uploads own-folder policies (for profile upsert + read own)
DROP POLICY IF EXISTS "id_own_read" ON storage.objects;
DROP POLICY IF EXISTS "id_own_update" ON storage.objects;
DROP POLICY IF EXISTS "id_own_delete" ON storage.objects;

CREATE POLICY "id_own_read" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'id-uploads'
    AND (
      (auth.uid())::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE POLICY "id_own_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'id-uploads'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'id-uploads'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "id_own_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'id-uploads'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
