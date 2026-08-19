ALTER TABLE public.representatives
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS representatives_user_id_unique
  ON public.representatives (user_id)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_representative_directory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user uuid := COALESCE(NEW.user_id, OLD.user_id);
  p public.profiles%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.role = 'representative' THEN
    SELECT * INTO p FROM public.profiles WHERE id = NEW.user_id;

    INSERT INTO public.representatives (user_id, name, phone, whatsapp, active, display_order)
    VALUES (
      NEW.user_id,
      COALESCE(NULLIF(btrim(p.full_name), ''), 'مندوب'),
      COALESCE(p.mobile_phone, ''),
      COALESCE(NULLIF(btrim(p.whatsapp_phone), ''), p.mobile_phone, ''),
      COALESCE(p.active, true),
      COALESCE((SELECT max(display_order) + 1 FROM public.representatives), 0)
    )
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE
      SET name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          whatsapp = EXCLUDED.whatsapp,
          active = EXCLUDED.active;
  ELSIF TG_OP = 'DELETE' AND OLD.role = 'representative' THEN
    UPDATE public.representatives SET active = false WHERE user_id = OLD.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_representative_directory ON public.user_roles;
CREATE TRIGGER trg_sync_representative_directory
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_representative_directory();

INSERT INTO public.representatives (user_id, name, phone, whatsapp, active, display_order)
SELECT
  ur.user_id,
  COALESCE(NULLIF(btrim(p.full_name), ''), 'مندوب'),
  COALESCE(p.mobile_phone, ''),
  COALESCE(NULLIF(btrim(p.whatsapp_phone), ''), p.mobile_phone, ''),
  COALESCE(p.active, true),
  row_number() OVER (ORDER BY p.created_at)::integer + COALESCE((SELECT max(display_order) FROM public.representatives), 0)
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'representative'
ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE
SET name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    whatsapp = EXCLUDED.whatsapp,
    active = EXCLUDED.active;

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
    IF NEW.created_by IS NOT NULL
       AND NOT public.has_role(NEW.created_by, 'representative')
       AND NEW.created_by <> caller THEN
      RAISE EXCEPTION 'Invalid booking owner' USING ERRCODE = '42501';
    END IF;
  ELSE
    NEW.created_by := caller;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_owner ON public.bookings;
CREATE TRIGGER trg_enforce_booking_owner
BEFORE INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_owner();

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
BEGIN
  IF caller = OLD.id
     AND NEW.account_type IS DISTINCT FROM OLD.account_type
     AND NOT public.has_role(caller, 'admin')
     AND NOT public.has_role(caller, 'user_manager') THEN
    RAISE EXCEPTION 'Account type can only be changed by an administrator' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileges ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileges
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();