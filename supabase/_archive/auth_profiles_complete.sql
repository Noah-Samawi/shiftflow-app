-- ============================================================
-- AUTH + PROFILES: Komplett-Fix (einmal im Supabase SQL Editor ausführen)
-- Behebt: fehlende Profile bei Registrierung, Admin-Rolle, RLS-Deadlocks
-- ============================================================

-- ── 1) Admin-Rolle für Noah setzen ─────────────────────────
UPDATE public.profiles
SET role = 'admin'
WHERE id IN (
  SELECT id FROM auth.users
  WHERE lower(email) = lower('noahalsamawi688@gmail.com')
);

-- ── 2) Trigger: Profil bei jedem neuen auth.users ───────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  IF lower(NEW.email) = lower('noahalsamawi688@gmail.com') THEN
    user_role := 'admin';
  ELSE
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'employee');
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    user_role
  )
  ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role
    WHERE public.profiles.role IS DISTINCT FROM EXCLUDED.role;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 3) RPCs für Frontend (SECURITY DEFINER = kein RLS-Block) ─

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  u_email text;
  u_role text;
  result public.profiles;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  SELECT * INTO result FROM public.profiles WHERE id = uid;
  IF FOUND THEN
    RETURN result;
  END IF;

  SELECT email INTO u_email FROM auth.users WHERE id = uid;

  IF lower(u_email) = lower('noahalsamawi688@gmail.com') THEN
    u_role := 'admin';
  ELSE
    u_role := 'employee';
  END IF;

  INSERT INTO public.profiles (id, full_name, role)
  VALUES (uid, split_part(COALESCE(u_email, 'user'), '@', 1), u_role)
  RETURNING * INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ── 4) is_admin() ohne RLS-Rekursion ────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── 5) RLS-Policies (eigenes Profil OHNE is_admin()-Aufruf) ─
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles: select" ON public.profiles;
DROP POLICY IF EXISTS "profiles: update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- Jeder sieht die eigene Zeile (wichtig für AuthContext / role)
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- Admins sehen alle Profile (Mitarbeiter-Seite)
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- ── Verifikation ────────────────────────────────────────────
-- SELECT u.email, p.role FROM auth.users u
-- JOIN public.profiles p ON p.id = u.id
-- WHERE lower(u.email) = lower('noahalsamawi688@gmail.com');
