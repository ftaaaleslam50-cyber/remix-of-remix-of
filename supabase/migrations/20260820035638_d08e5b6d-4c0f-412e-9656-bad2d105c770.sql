CREATE OR REPLACE FUNCTION public.enforce_booking_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_is_staff boolean := false;
  rep_owner uuid;
BEGIN
  IF NEW.rep_name IS NOT NULL AND btrim(NEW.rep_name) <> '' THEN
    SELECT r.user_id INTO rep_owner
    FROM public.representatives r
    WHERE r.user_id IS NOT NULL
      AND lower(btrim(r.name)) = lower(btrim(NEW.rep_name))
    ORDER BY r.active DESC
    LIMIT 1;
  END IF;

  IF caller IS NULL THEN
    IF COALESCE(auth.role(), '') <> 'service_role' THEN
      NEW.created_by := rep_owner;
    ELSE
      NEW.created_by := COALESCE(NEW.created_by, rep_owner);
    END IF;
    RETURN NEW;
  END IF;

  caller_is_staff := public.has_role(caller, 'admin')
                  OR public.has_role(caller, 'manager')
                  OR public.has_role(caller, 'user_manager');

  IF TG_OP = 'UPDATE' THEN
    IF caller_is_staff THEN
      NEW.created_by := COALESCE(NEW.created_by, rep_owner, OLD.created_by);
    ELSE
      NEW.created_by := OLD.created_by;
      RETURN NEW;
    END IF;
  ELSE
    IF caller_is_staff THEN
      NEW.created_by := COALESCE(NEW.created_by, rep_owner, caller);
    ELSE
      NEW.created_by := caller;
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.created_by IS NOT NULL
     AND NEW.created_by <> caller
     AND NOT public.has_role(NEW.created_by, 'representative')
     AND NOT EXISTS (SELECT 1 FROM public.representatives r WHERE r.user_id = NEW.created_by) THEN
    RAISE EXCEPTION 'Invalid booking owner' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_booking_owner ON public.bookings;
CREATE TRIGGER trg_enforce_booking_owner
BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_owner();