CREATE OR REPLACE FUNCTION public.enforce_return_seat_count()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE n int := COALESCE(cardinality(NEW.return_seat_numbers), 0);
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelled' OR n = 0 THEN RETURN NEW; END IF;
  IF n = NEW.passenger_count THEN RETURN NEW; END IF;
  -- عدد الركاب تغيّر والمقاعد لم تتغير: فك إسناد العودة ليعاد تسكينه بدل بقاء عدد خاطئ
  IF TG_OP = 'UPDATE' AND NEW.passenger_count IS DISTINCT FROM OLD.passenger_count
     AND NEW.return_seat_numbers IS NOT DISTINCT FROM OLD.return_seat_numbers THEN
    NEW.return_seat_numbers := '{}';
    NEW.return_bus_id := NULL;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'عدد مقاعد العودة (%) لا يطابق عدد الركاب (%).', n, NEW.passenger_count USING ERRCODE = 'P0001';
END $$;
DROP TRIGGER IF EXISTS a_enforce_return_seat_count ON public.bookings;
CREATE TRIGGER a_enforce_return_seat_count BEFORE INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_return_seat_count();