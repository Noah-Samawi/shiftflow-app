-- ============================================================
-- Auto-create profile row when a new user signs up
-- Run this in Supabase SQL Editor
-- ============================================================

-- Function that creates a profile for every new auth.users row
-- The FIRST user to sign up automatically becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  existing_count integer;
  user_role text;
BEGIN
  -- Check how many profiles exist already
  SELECT COUNT(*) INTO existing_count FROM public.profiles;

  -- First user gets admin, everyone else gets employee
  IF existing_count = 0 THEN
    user_role := 'admin';
  ELSE
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    user_role
  );
  RETURN NEW;
END;
$$;

-- Trigger: fires AFTER INSERT on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
