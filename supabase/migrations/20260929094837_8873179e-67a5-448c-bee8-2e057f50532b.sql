CREATE OR REPLACE FUNCTION public.link_booking_rep_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.rep_profile_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT r.user_id INTO _uid FROM representatives r
   WHERE r.user_id IS NOT NULL
     AND trim(r.name) IN (trim(coalesce(NEW.rep_name,'')), trim(coalesce(NEW.booking_source,'')))
   GROUP BY r.user_id
   HAVING count(*) >= 1
   LIMIT 2;
  -- only link when the name resolves to exactly one representative account
  IF (SELECT count(DISTINCT r.user_id) FROM representatives r
       WHERE r.user_id IS NOT NULL
         AND trim(r.name) IN (trim(coalesce(NEW.rep_name,'')), trim(coalesce(NEW.booking_source,'')))) = 1 THEN
    NEW.rep_profile_id := _uid;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.link_booking_rep_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_link_booking_rep_profile ON public.bookings;
CREATE TRIGGER trg_link_booking_rep_profile BEFORE INSERT OR UPDATE OF rep_name, booking_source, rep_profile_id
ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.link_booking_rep_profile();

-- Backfill only (never deletes / never overwrites an existing link)
WITH m AS (
  SELECT b.id, min(r.user_id::text)::uuid uid
  FROM bookings b JOIN representatives r
    ON r.user_id IS NOT NULL AND trim(r.name) IN (trim(coalesce(b.rep_name,'')), trim(coalesce(b.booking_source,'')))
  WHERE b.rep_profile_id IS NULL
  GROUP BY b.id HAVING count(DISTINCT r.user_id) = 1
)
UPDATE bookings b SET rep_profile_id = m.uid FROM m WHERE b.id = m.id AND b.rep_profile_id IS NULL;