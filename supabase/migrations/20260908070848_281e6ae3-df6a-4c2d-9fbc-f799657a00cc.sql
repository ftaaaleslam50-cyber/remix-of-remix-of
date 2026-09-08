-- Helper predicates for the new role ladder.
CREATE OR REPLACE FUNCTION public.is_admin_or_manager(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager'));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_bookings(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','manager','supervisor'));
$$;

-- Highest staff role for the signed-in user (drives the admin UI).
CREATE OR REPLACE FUNCTION public.my_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN 'admin'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager') THEN 'manager'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'supervisor') THEN 'supervisor'
    WHEN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'representative') THEN 'representative'
    ELSE 'user'
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin_or_manager(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_bookings(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_staff_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_staff_role() TO authenticated;

-- Mirror every admin-only policy with a manager version, except users/audit areas.
DO $do$
DECLARE
  p record;
  new_qual text;
  new_check text;
  new_name text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename NOT IN ('user_roles','audit_log','profiles','push_hook_config')
      AND (COALESCE(qual,'') LIKE '%''admin''::app_role%' OR COALESCE(with_check,'') LIKE '%''admin''::app_role%')
  LOOP
    new_name := left('mgr ' || p.policyname, 60);
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=p.tablename AND policyname=new_name) THEN
      CONTINUE;
    END IF;
    new_qual := replace(COALESCE(p.qual,''), '''admin''::app_role', '''manager''::app_role');
    new_check := replace(COALESCE(p.with_check,''), '''admin''::app_role', '''manager''::app_role');

    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR %s TO %s %s %s',
      new_name, p.tablename,
      CASE p.cmd WHEN 'ALL' THEN 'ALL' ELSE p.cmd END,
      array_to_string(p.roles, ','),
      CASE WHEN p.qual IS NULL THEN '' ELSE 'USING (' || new_qual || ')' END,
      CASE WHEN p.with_check IS NULL THEN '' ELSE 'WITH CHECK (' || new_check || ')' END
    );
  END LOOP;
END
$do$;

-- Supervisor: bookings only.
DROP POLICY IF EXISTS "supervisor read bookings" ON public.bookings;
CREATE POLICY "supervisor read bookings" ON public.bookings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role));

DROP POLICY IF EXISTS "supervisor update bookings" ON public.bookings;
CREATE POLICY "supervisor update bookings" ON public.bookings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'supervisor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'::public.app_role));

DROP POLICY IF EXISTS "supervisor insert bookings" ON public.bookings;
CREATE POLICY "supervisor insert bookings" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'supervisor'::public.app_role));