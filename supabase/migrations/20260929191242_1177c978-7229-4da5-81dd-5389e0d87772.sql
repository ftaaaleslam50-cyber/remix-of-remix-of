DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.recalc_settled_profits'::regproc);
  d := replace(d,'IF NOT public.is_admin_or_manager(auth.uid()) THEN','IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_manager(auth.uid()) THEN');
  d := replace(d,'IF bus.id IS NULL OR bus.settled_at IS NULL OR occ.id IS NULL OR occ.settled_at IS NULL THEN','IF bus.id IS NULL OR bus.settled_at IS NULL THEN');
  EXECUTE d;
END $m$;
REVOKE EXECUTE ON FUNCTION public.recalc_settled_profits(uuid,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalc_settled_profits(uuid,uuid,date) TO authenticated;

-- Recompute every already-approved bus
DO $r$
DECLARE x uuid;
BEGIN
  FOR x IN SELECT id FROM public.buses WHERE settled_at IS NOT NULL LOOP
    PERFORM public.recalc_settled_profits(x, NULL, NULL);
  END LOOP;
END $r$;