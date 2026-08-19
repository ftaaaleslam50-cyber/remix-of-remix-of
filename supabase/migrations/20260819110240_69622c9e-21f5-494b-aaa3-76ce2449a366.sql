CREATE OR REPLACE FUNCTION public.sync_representative_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.representatives
  SET name = COALESCE(NULLIF(btrim(NEW.full_name), ''), name),
      phone = COALESCE(NEW.mobile_phone, ''),
      whatsapp = COALESCE(NULLIF(btrim(NEW.whatsapp_phone), ''), NEW.mobile_phone, ''),
      active = NEW.active
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_representative_profile ON public.profiles;
CREATE TRIGGER trg_sync_representative_profile
AFTER UPDATE OF full_name, mobile_phone, whatsapp_phone, active ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_representative_profile();

REVOKE ALL ON FUNCTION public.sync_representative_profile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_representative_profile() TO service_role;