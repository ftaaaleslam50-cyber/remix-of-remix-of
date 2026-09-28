ALTER TABLE public.settlement_reference ADD COLUMN return_trip_company_profit_rate numeric NOT NULL DEFAULT 0 CHECK (return_trip_company_profit_rate >= 0 AND return_trip_company_profit_rate <= 1);

DO $migration$ DECLARE definition text; BEGIN
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'recalc_settled_profits';
  IF definition IS NULL OR position('rep_share = ROUND(gross * rate),' in definition) = 0 THEN
    RAISE EXCEPTION 'Existing settlement calculation has changed; cannot safely update';
  END IF;
  definition := replace(definition,
    'rep_share = ROUND(gross * rate),
          company_share = ROUND(gross - gross * rate)',
    'rep_share = CASE WHEN b.return_trip_id IS NOT NULL OR b.trip_mode = ''return'' THEN ROUND(gross - gross * COALESCE(ref.return_trip_company_profit_rate, 0)) ELSE ROUND(gross * rate) END,
          company_share = CASE WHEN b.return_trip_id IS NOT NULL OR b.trip_mode = ''return'' THEN ROUND(gross * COALESCE(ref.return_trip_company_profit_rate, 0)) ELSE ROUND(gross - gross * rate) END');
  IF position('CASE WHEN b.return_trip_id IS NOT NULL' in definition) = 0 THEN RAISE EXCEPTION 'Settlement replacement did not match'; END IF;
  EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.refresh_return_profit_shares() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.return_trip_company_profit_rate IS DISTINCT FROM OLD.return_trip_company_profit_rate THEN
    UPDATE public.bookings
    SET company_share = ROUND(gross_profit * NEW.return_trip_company_profit_rate),
        rep_share = ROUND(gross_profit - gross_profit * NEW.return_trip_company_profit_rate)
    WHERE gross_profit IS NOT NULL AND deleted_at IS NULL AND status <> 'cancelled'
      AND (return_trip_id IS NOT NULL OR trip_mode = 'return');
  END IF;
  RETURN NEW;
END $fn$;
CREATE TRIGGER refresh_return_profit_shares_on_rate AFTER UPDATE OF return_trip_company_profit_rate ON public.settlement_reference FOR EACH ROW EXECUTE FUNCTION public.refresh_return_profit_shares();
UPDATE public.bookings SET company_share = ROUND(gross_profit * 0), rep_share = ROUND(gross_profit - gross_profit * 0) WHERE gross_profit IS NOT NULL AND deleted_at IS NULL AND status <> 'cancelled' AND (return_trip_id IS NOT NULL OR trip_mode = 'return');