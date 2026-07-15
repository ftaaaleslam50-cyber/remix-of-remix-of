-- Attach handle_new_user trigger so profiles are auto-created from signup metadata.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any missing profiles for existing users using their signup metadata.
INSERT INTO public.profiles (id, full_name, mobile_phone, whatsapp_phone)
SELECT
  u.id,
  u.raw_user_meta_data->>'full_name',
  u.raw_user_meta_data->>'mobile_phone',
  u.raw_user_meta_data->>'whatsapp_phone'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;