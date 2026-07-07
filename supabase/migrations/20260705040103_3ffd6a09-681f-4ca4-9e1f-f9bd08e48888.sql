-- Tighten audit insert
DROP POLICY IF EXISTS "Authenticated insert audit" ON public.audit_log;
CREATE POLICY "Users insert their own audit" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id IS NULL OR actor_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Lock down handle_new_user to trigger use only
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
