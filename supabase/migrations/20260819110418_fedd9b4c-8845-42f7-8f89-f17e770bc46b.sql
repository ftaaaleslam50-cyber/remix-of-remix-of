CREATE OR REPLACE FUNCTION public.enforce_booking_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_staff boolean := false;
BEGIN
  IF caller IS NULL THEN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      NEW.created_by := NULL;
    END IF;
    RETURN NEW;
  END IF;

  caller_is_staff := public.has_role(caller, 'admin')
                  OR public.has_role(caller, 'manager')
                  OR public.has_role(caller, 'user_manager');

  IF caller_is_staff THEN
    NEW.created_by := COALESCE(NEW.created_by, caller);
    IF NEW.created_by <> caller
       AND NOT public.has_role(NEW.created_by, 'representative') THEN
      RAISE EXCEPTION 'Invalid booking owner' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.created_by := caller;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_booking_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_booking_owner() TO service_role;