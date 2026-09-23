DROP POLICY IF EXISTS "reps_read_authenticated" ON public.representatives;
CREATE POLICY "reps_read_staff_or_self" ON public.representatives
FOR SELECT TO authenticated
USING (public.is_admin_or_manager(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS "notif_settings_read" ON public.notification_settings;
CREATE POLICY "notif_settings_read_staff" ON public.notification_settings
FOR SELECT TO authenticated
USING (public.can_manage_bookings(auth.uid()) OR public.is_admin_or_manager(auth.uid()));