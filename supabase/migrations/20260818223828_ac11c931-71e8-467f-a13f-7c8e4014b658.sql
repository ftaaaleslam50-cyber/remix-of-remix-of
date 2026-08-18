ALTER TABLE public.notification_settings ADD COLUMN IF NOT EXISTS cat_users boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.tg_profile_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.notifications(type, title, body, link, category)
  VALUES (
    'user_registered',
    'تسجيل حساب جديد',
    COALESCE(NULLIF(btrim(NEW.full_name), ''), 'مستخدم جديد')
      || CASE WHEN NEW.mobile_phone IS NOT NULL AND btrim(NEW.mobile_phone) <> ''
              THEN ' — ' || NEW.mobile_phone ELSE '' END,
    '/dashboard',
    'users'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_notify ON public.profiles;
CREATE TRIGGER trg_profile_notify
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profile_notify();