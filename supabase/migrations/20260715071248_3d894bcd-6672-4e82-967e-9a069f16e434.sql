
-- Null out older duplicates so unique index can be created.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY mobile_phone ORDER BY created_at DESC NULLS LAST, id) AS rn
    FROM public.profiles
   WHERE mobile_phone IS NOT NULL AND mobile_phone <> ''
)
UPDATE public.profiles p
   SET mobile_phone = NULL
  FROM ranked r
 WHERE p.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_mobile_phone_unique_idx
  ON public.profiles (mobile_phone)
  WHERE mobile_phone IS NOT NULL AND mobile_phone <> '';

CREATE OR REPLACE FUNCTION public.mobile_exists(_mobile text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE mobile_phone = _mobile
  );
$$;

REVOKE ALL ON FUNCTION public.mobile_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_exists(text) TO anon, authenticated, service_role;
