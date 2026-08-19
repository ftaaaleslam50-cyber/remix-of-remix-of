REVOKE ALL ON FUNCTION public.sync_representative_directory() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_booking_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_privileges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_representative_directory() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_booking_owner() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_privileges() TO service_role;