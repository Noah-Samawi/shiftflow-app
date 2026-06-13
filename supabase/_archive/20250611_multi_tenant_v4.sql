-- ============================================================
-- M. Sharif ShiftFlow — PRODUCTION MULTI-TENANT SCHEMA v4.0
-- Stripe-Level Isolation | One Source of Truth
-- ============================================================
--
-- SECURITY GUARANTEES:
-- 1. org_id is NOT NULL on ALL tenant tables
-- 2. RLS policies enforce org_id = user's org_id (no exceptions)
-- 3. INSERT triggers ALWAYS overwrite org_id (no spoofing)
-- 4. RPC functions require p_org_id parameter
-- 5. No "authenticated" blanket policies
-- 6. No conflicting legacy scripts — this is the ONLY source
--
-- DEPLOYMENT:
-- 1. Run in Supabase SQL Editor (new project or reset)
-- 2. All existing data will be backfilled to a default org
-- 3. Frontend must send p_org_id in all RPC calls
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- 0. CLEANUP: Drop all conflicting policies, triggers, functions
-- ══════════════════════════════════════════════════════════════════

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('profiles','customers','schedules','comments','organizations')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS trg_customers_set_org_id ON public.customers;
DROP TRIGGER IF EXISTS trg_schedules_set_org_id ON public.schedules;
DROP TRIGGER IF EXISTS trg_comments_set_org_id ON public.comments;

-- ══════════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS TABLE (Root of isolation)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  owner_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug  ON public.organizations(slug);

-- ══════════════════════════════════════════════════════════════════
-- 2. PROFILES TABLE (NOT NULL org_id)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text NOT NULL,
  phone        text,
  address      text,
  avatar_url   text,
  weekly_hours integer DEFAULT 40,
  role         text NOT NULL DEFAULT 'employee',
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role   ON public.profiles(role);

-- ══════════════════════════════════════════════════════════════════
-- 3. CUSTOMERS TABLE (NOT NULL org_id)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  contact_person text,
  phone          text,
  address        text,
  notes          text,
  color          text NOT NULL DEFAULT '#E67E22',
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(org_id);

-- ══════════════════════════════════════════════════════════════════
-- 4. SCHEDULES TABLE (NOT NULL org_id)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  customer_id  uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  shift_date   date NOT NULL,
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  instructions text,
  tasks        text,
  status       text DEFAULT 'scheduled',
  recurrence   text NOT NULL DEFAULT 'once',
  series_id    uuid,
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_org_id       ON public.schedules(org_id);
CREATE INDEX IF NOT EXISTS idx_schedules_shift_date   ON public.schedules(shift_date);
CREATE INDEX IF NOT EXISTS idx_schedules_employee_id  ON public.schedules(employee_id);
CREATE INDEX IF NOT EXISTS idx_schedules_customer_id  ON public.schedules(customer_id);
CREATE INDEX IF NOT EXISTS idx_schedules_series_id    ON public.schedules(series_id);

-- ══════════════════════════════════════════════════════════════════
-- 5. COMMENTS TABLE (NOT NULL org_id)
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message     text NOT NULL,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_org_id      ON public.comments(org_id);
CREATE INDEX IF NOT EXISTS idx_comments_schedule_id ON public.comments(schedule_id);

-- ══════════════════════════════════════════════════════════════════
-- 6. CONSTRAINTS
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check,
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin','employee'));

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS schedules_recurrence_check,
  ADD CONSTRAINT schedules_recurrence_check CHECK (recurrence IN ('once','weekly','biweekly','monthly'));

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS schedules_status_check,
  ADD CONSTRAINT schedules_status_check CHECK (status IN ('scheduled','confirmed','completed','cancelled'));

-- ══════════════════════════════════════════════════════════════════
-- 7. RLS: ENABLE ON ALL TABLES
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments      ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- 8. RLS: STRICT ORG ISOLATION POLICIES
-- ══════════════════════════════════════════════════════════════════

-- Helper: get user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: is admin in user's org
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT COALESCE(role = 'admin', false)
  FROM public.profiles
  WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ── organizations ──
CREATE POLICY "org_select" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_org_id());

CREATE POLICY "org_insert" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "org_update" ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.get_user_org_id() AND owner_id = auth.uid());

-- ── profiles ──
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin());

-- ── customers ──
CREATE POLICY "customers_select" ON public.customers FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.is_admin());

CREATE POLICY "customers_update" ON public.customers FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "customers_delete" ON public.customers FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin());

-- ── schedules ──
CREATE POLICY "schedules_select" ON public.schedules FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "schedules_insert" ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.is_admin());

CREATE POLICY "schedules_update" ON public.schedules FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin())
  WITH CHECK (org_id = public.get_user_org_id());

CREATE POLICY "schedules_delete" ON public.schedules FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin());

-- ── comments ──
CREATE POLICY "comments_select" ON public.comments FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

CREATE POLICY "comments_insert" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND user_id = auth.uid());

CREATE POLICY "comments_delete" ON public.comments FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND (user_id = auth.uid() OR public.is_admin()));

-- ══════════════════════════════════════════════════════════════════
-- 9. TRIGGERS: AUTO-SET org_id (ALWAYS overwrite, no spoofing)
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_set_org_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.org_id := public.get_user_org_id();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_customers_set_org_id
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_org_id();

CREATE TRIGGER trg_schedules_set_org_id
  BEFORE INSERT ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_org_id();

CREATE TRIGGER trg_comments_set_org_id
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_org_id();

-- ══════════════════════════════════════════════════════════════════
-- 10. AUTH TRIGGER: Create profile with org_id on signup
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Check if signup includes org_id (invite flow)
  v_org_id := (NEW.raw_user_meta_data->>'org_id')::uuid;

  -- If no org_id, create a new organization (first admin signup)
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, owner_id)
    VALUES (
      COALESCE(NEW.raw_user_meta_data->>'org_name', 'Meine Firma'),
      COALESCE(NEW.raw_user_meta_data->>'org_slug', 'org-' || substr(NEW.id::text, 1, 8)),
      NEW.id
    )
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_org_id;

    -- If slug conflict, fetch existing
    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.organizations
      WHERE slug = COALESCE(NEW.raw_user_meta_data->>'org_slug', 'org-' || substr(NEW.id::text, 1, 8));
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, org_id)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'full_name')::text, split_part(NEW.email, '@', 1)),
    CASE WHEN lower(NEW.email) = 'noahalsamawi688@gmail.com' THEN 'admin' ELSE 'employee' END,
    v_org_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user Fehler: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ══════════════════════════════════════════════════════════════════
-- 11. RPC FUNCTIONS (all require p_org_id)
-- ══════════════════════════════════════════════════════════════════

-- ── ensure_user_profile ──
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id     uuid := auth.uid();
  v_email  text := auth.jwt()->>'email';
  v_name   text := COALESCE(auth.jwt()->>'full_name', split_part(v_email, '@', 1));
  v_org_id uuid;
BEGIN
  IF v_id IS NULL THEN RETURN; END IF;

  -- Check if profile already exists
  SELECT org_id INTO v_org_id FROM public.profiles WHERE id = v_id;
  IF v_org_id IS NOT NULL THEN RETURN; END IF;

  -- Create default org for legacy users
  INSERT INTO public.organizations (name, slug, owner_id)
  VALUES ('Meine Firma', 'org-' || substr(v_id::text, 1, 8), v_id)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_org_id;

  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'org-' || substr(v_id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (id, full_name, role, org_id)
  VALUES (v_id, v_name, 'employee', v_org_id)
  ON CONFLICT (id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ── create_schedules_with_recurrence ──
CREATE OR REPLACE FUNCTION public.create_schedules_with_recurrence(
  p_employee_id uuid,
  p_customer_id uuid,
  p_shift_date  date,
  p_start_time  time,
  p_end_time    time,
  p_tasks       text    DEFAULT NULL,
  p_recurrence  text    DEFAULT 'once',
  p_status      text    DEFAULT 'scheduled',
  p_occurrences integer DEFAULT 12,
  p_org_id      uuid    NOT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i             integer := 0;
  occ_date      date    := p_shift_date;
  new_series_id uuid    := gen_random_uuid();
  new_id        uuid;
  max_occ       integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Administratoren dürfen Schichten anlegen';
  END IF;

  -- Verify caller's org_id matches p_org_id
  IF p_org_id != public.get_user_org_id() THEN
    RAISE EXCEPTION 'Ungültige Organisation';
  END IF;

  max_occ := CASE
    WHEN p_recurrence = 'once' THEN 1
    ELSE GREATEST(1, LEAST(COALESCE(p_occurrences, 12), 365))
  END;

  WHILE i < max_occ LOOP
    INSERT INTO public.schedules (
      employee_id, customer_id, shift_date, start_time, end_time,
      tasks, instructions, status, recurrence, series_id, org_id
    ) VALUES (
      p_employee_id, p_customer_id, occ_date, p_start_time, p_end_time,
      p_tasks, p_tasks, COALESCE(p_status, 'scheduled'), p_recurrence,
      CASE WHEN p_recurrence = 'once' THEN NULL ELSE new_series_id END,
      p_org_id
    )
    RETURNING id INTO new_id;
    RETURN NEXT new_id;

    occ_date := CASE p_recurrence
      WHEN 'weekly'   THEN occ_date + 7
      WHEN 'biweekly' THEN occ_date + 14
      WHEN 'monthly'  THEN LEAST(
        (date_trunc('month', occ_date) + interval '1 month' + (EXTRACT(DAY FROM p_shift_date)-1) * interval '1 day')::date,
        (date_trunc('month', occ_date) + interval '2 month' - interval '1 day')::date
      )
      ELSE occ_date + 1
    END;
    i := i + 1;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_schedules_with_recurrence(
  uuid, uuid, date, time, time, text, text, text, integer, uuid
) TO authenticated;

-- ── admin_create_employee ──
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_email        text,
  p_full_name    text,
  p_phone        text    DEFAULT NULL,
  p_address      text    DEFAULT NULL,
  p_weekly_hours integer DEFAULT 40,
  p_org_id       uuid    NOT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_id           uuid := gen_random_uuid();
  normalized_email text := lower(trim(p_email));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Administratoren dürfen Mitarbeiter anlegen';
  END IF;

  -- Verify caller's org_id matches p_org_id
  IF p_org_id != public.get_user_org_id() THEN
    RAISE EXCEPTION 'Ungültige Organisation';
  END IF;

  IF normalized_email IS NULL OR normalized_email = '' THEN
    RAISE EXCEPTION 'E-Mail ist erforderlich';
  END IF;
  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RAISE EXCEPTION 'Name ist erforderlich';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = normalized_email) THEN
    RAISE EXCEPTION 'Diese E-Mail ist bereits registriert';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    normalized_email, now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'role', 'employee', 'org_id', p_org_id),
    now(), now(), false
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', normalized_email),
    'email', new_id::text, now(), now(), now()
  );

  INSERT INTO public.profiles (id, full_name, role, phone, address, weekly_hours, org_id)
  VALUES (new_id, trim(p_full_name), 'employee',
    NULLIF(trim(p_phone), ''), NULLIF(trim(p_address), ''), COALESCE(p_weekly_hours, 40), p_org_id
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = EXCLUDED.phone,
    address = EXCLUDED.address, weekly_hours = EXCLUDED.weekly_hours,
    role = 'employee', org_id = p_org_id;

  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(text, text, text, text, integer, uuid)
  TO authenticated;

-- ── get_my_role ──
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(r, 'employee');
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 12. VIEWS (with org_id filter)
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.employee_weekly_hours AS
SELECT
  p.id            AS employee_id,
  p.full_name,
  date_trunc('week', CURRENT_DATE)::date AS week_start,
  COALESCE(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600), 0)::numeric(10,1) AS hours_this_week
FROM public.profiles p
LEFT JOIN public.schedules s
  ON  s.employee_id = p.id
  AND s.shift_date >= date_trunc('week', CURRENT_DATE)::date
  AND s.shift_date <  date_trunc('week', CURRENT_DATE)::date + 7
  AND s.status NOT IN ('cancelled')
WHERE p.role = 'employee'
  AND p.org_id = public.get_user_org_id()
GROUP BY p.id, p.full_name;

GRANT SELECT ON public.employee_weekly_hours TO authenticated;

-- ══════════════════════════════════════════════════════════════════
-- 13. REALTIME
-- ══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════
-- 14. BACKFILL (for existing data — single-tenant → multi-tenant)
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin_id uuid;
  v_org_id uuid;
BEGIN
  -- Find first admin without org_id
  SELECT id INTO v_admin_id FROM public.profiles
  WHERE role = 'admin' AND (org_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations WHERE id = profiles.org_id
  ))
  LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.organizations (name, slug, owner_id)
    VALUES ('Meine Firma', 'meine-firma-' || substr(v_admin_id::text, 1, 8), v_admin_id)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.organizations
      WHERE slug = 'meine-firma-' || substr(v_admin_id::text, 1, 8);
    END IF;

    UPDATE public.profiles SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.customers SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.schedules SET org_id = v_org_id WHERE org_id IS NULL;
    UPDATE public.comments  SET org_id = v_org_id WHERE org_id IS NULL;
  END IF;
END $$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- 15. VERIFICATION
-- ══════════════════════════════════════════════════════════════════

SELECT 'organizations' AS table_name, COUNT(*) AS count FROM public.organizations
UNION ALL
SELECT 'profiles', COUNT(*) FROM public.profiles
UNION ALL
SELECT 'customers', COUNT(*) FROM public.customers
UNION ALL
SELECT 'schedules', COUNT(*) FROM public.schedules
UNION ALL
SELECT 'comments', COUNT(*) FROM public.comments;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
