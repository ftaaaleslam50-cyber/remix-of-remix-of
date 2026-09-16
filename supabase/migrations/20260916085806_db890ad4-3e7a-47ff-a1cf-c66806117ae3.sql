CREATE POLICY "Reps can view bookings linked to them"
ON public.bookings FOR SELECT
TO authenticated
USING (rep_profile_id = auth.uid());