CREATE OR REPLACE FUNCTION public.profile_account_type_allowed(_profile_id uuid, _new_type public.account_type)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'user_manager')
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _profile_id
          AND p.id = auth.uid()
          AND p.account_type = _new_type
      );
$$;

REVOKE ALL ON FUNCTION public.profile_account_type_allowed(uuid, public.account_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_account_type_allowed(uuid, public.account_type) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = id
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'user_manager')
)
WITH CHECK (
  public.profile_account_type_allowed(id, account_type)
);