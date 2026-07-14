
REVOKE EXECUTE ON FUNCTION public.generate_booking_code() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_booking_notify() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_bus_audit() FROM anon, authenticated, PUBLIC;
-- has_role: only authenticated + service_role should be able to call it
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
