-- ============================================================
-- COMPLETE FIX: Admin Role + RLS Policies
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- STEP 1: Fix Admin Role for noahalsamawi688@gmail.com
-- ============================================================

UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users
  WHERE email = 'noahalsamawi688@gmail.com'
);

-- ============================================================
-- STEP 2: Fix handle_new_user() Trigger
-- Hardcode admin email to always get admin role
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Hardcode admin for this specific email
  IF NEW.email = 'noahalsamawi688@gmail.com' THEN
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

-- ============================================================
-- STEP 3: Recreate is_admin() Function (Robust)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.profiles
  WHERE id = auth.uid();
  RETURN user_role = 'admin';
END;
$$;

-- ============================================================
-- STEP 4: Recreate All RLS Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments  ENABLE ROW LEVEL SECURITY;

-- Drop old policies
DROP POLICY IF EXISTS "profiles: select" ON public.profiles;
DROP POLICY IF EXISTS "profiles: update" ON public.profiles;
DROP POLICY IF EXISTS "clients: insert admin" ON public.clients;
DROP POLICY IF EXISTS "clients: update admin" ON public.clients;
DROP POLICY IF EXISTS "clients: delete admin" ON public.clients;
DROP POLICY IF EXISTS "schedules: select" ON public.schedules;
DROP POLICY IF EXISTS "schedules: insert admin" ON public.schedules;
DROP POLICY IF EXISTS "schedules: update admin" ON public.schedules;
DROP POLICY IF EXISTS "schedules: delete admin" ON public.schedules;
DROP POLICY IF EXISTS "comments: select authenticated" ON public.comments;
DROP POLICY IF EXISTS "comments: insert authenticated" ON public.comments;
DROP POLICY IF EXISTS "comments: delete" ON public.comments;

-- Profiles Policies
CREATE POLICY "profiles: select"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles: update"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin());

-- Clients Policies (Admin only for write operations)
CREATE POLICY "clients: select all"
  ON public.clients FOR SELECT
  USING (true);  -- Everyone can view clients

CREATE POLICY "clients: insert admin"
  ON public.clients FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "clients: update admin"
  ON public.clients FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "clients: delete admin"
  ON public.clients FOR DELETE
  USING (public.is_admin());

-- Schedules Policies
CREATE POLICY "schedules: select"
  ON public.schedules FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin());

CREATE POLICY "schedules: insert admin"
  ON public.schedules FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "schedules: update admin"
  ON public.schedules FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "schedules: delete admin"
  ON public.schedules FOR DELETE
  USING (public.is_admin());

-- Comments Policies
CREATE POLICY "comments: select authenticated"
  ON public.comments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "comments: insert authenticated"
  ON public.comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());

CREATE POLICY "comments: delete"
  ON public.comments FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================
-- VERIFICATION QUERIES (Check results after running)
-- ============================================================

-- Check admin role:
SELECT email, p.role
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'noahalsamawi688@gmail.com';

-- Check all policies:
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
