-- ============================================================
-- M. Sharif Nachbarschaftshilfe – FINALES RESET SCRIPT
-- 100% idempotent | Im Supabase SQL Editor ausführen
-- ============================================================

-- ---------------------------------------------------------
-- SCHRITT 0: Sicherheit – Alle Policies löschen (42710 verhindern)
-- ---------------------------------------------------------
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN (
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename IN ('profiles','customers','schedules','comments')
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------
-- SCHRITT 1: Tabellen erstellen / sicherstellen
-- ---------------------------------------------------------

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    text NOT NULL,
  phone        text,
  address      text,
  avatar_url   text,
  weekly_hours integer DEFAULT 40,
  role         text NOT NULL DEFAULT 'employee',
  created_at   timestamptz DEFAULT now()
);

-- customers (neue Kunden-Tabelle)
CREATE TABLE IF NOT EXISTS public.customers (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  contact_person text,
  phone          text,
  address        text,
  notes          text,
  color          text NOT NULL DEFAULT '#E67E22',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- schedules
CREATE TABLE IF NOT EXISTS public.schedules (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid,
  customer_id  uuid,
  shift_date   date NOT NULL,
  start_time   time NOT NULL,
  end_time     time NOT NULL,
  instructions text,
  tasks        text,
  status       text DEFAULT 'scheduled',
  recurrence   text NOT NULL DEFAULT 'once',
  series_id    uuid,
  created_at   timestamptz DEFAULT now()
);

-- comments
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL,
  user_id     uuid,
  message     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- ---------------------------------------------------------
-- SCHRITT 2: Spalten nachrüsten / Migrieren (idempotent)
-- ---------------------------------------------------------

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS tasks         text,
  ADD COLUMN IF NOT EXISTS recurrence    text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS series_id     uuid,
  ADD COLUMN IF NOT EXISTS customer_id   uuid;

-- Falls alt: client_id umbenennen
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schedules' AND column_name='client_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='schedules' AND column_name='customer_id'
  ) THEN
    ALTER TABLE public.schedules RENAME COLUMN client_id TO customer_id;
  END IF;
END $$;

-- instructions → tasks kopieren (nur wenn tasks leer)
UPDATE public.schedules
SET tasks = instructions
WHERE tasks IS NULL AND instructions IS NOT NULL;

-- ---------------------------------------------------------
-- SCHRITT 3: Constraints löschen & neu setzen
-- ---------------------------------------------------------

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS schedules_recurrence_check,
  DROP CONSTRAINT IF EXISTS schedules_status_check,
  DROP CONSTRAINT IF EXISTS schedules_customer_id_fkey,
  DROP CONSTRAINT IF EXISTS schedules_employee_id_fkey;

ALTER TABLE public.comments
  DROP CONSTRAINT IF EXISTS comments_schedule_id_fkey,
  DROP CONSTRAINT IF EXISTS comments_user_id_fkey;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Foreign Keys NEU
ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT schedules_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_schedule_id_fkey
    FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE CASCADE,
  ADD CONSTRAINT comments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Check Constraints
ALTER TABLE public.schedules
  ADD CONSTRAINT schedules_recurrence_check
    CHECK (recurrence IN ('once','daily_workdays','daily_all','weekly','biweekly')),
  ADD CONSTRAINT schedules_status_check
    CHECK (status IN ('scheduled','confirmed','completed','cancelled'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin','employee'));

-- ---------------------------------------------------------
-- SCHRITT 4: Indizes
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS schedules_shift_date_idx  ON public.schedules (shift_date);
CREATE INDEX IF NOT EXISTS schedules_employee_id_idx ON public.schedules (employee_id);
CREATE INDEX IF NOT EXISTS schedules_series_id_idx    ON public.schedules (series_id);
CREATE INDEX IF NOT EXISTS schedules_customer_id_idx  ON public.schedules (customer_id);

-- ---------------------------------------------------------
-- SCHRITT 5: Trigger – Profil bei Registrierung
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE((NEW.raw_user_meta_data->>'full_name')::text, split_part(NEW.email, '@', 1)),
    CASE WHEN lower(NEW.email) = 'noahalsamawi688@gmail.com' THEN 'admin' ELSE 'employee' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user Fehler: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------
-- SCHRITT 6: ensure_user_profile (für direktes signUp ohne Bestätigung)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id    uuid := auth.uid();
  v_email text := auth.jwt()->>'email';
  v_name  text := COALESCE(auth.jwt()->>'full_name', split_part(v_email, '@', 1));
BEGIN
  IF v_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (v_id, v_name, CASE WHEN lower(v_email) = 'noahalsamawi688@gmail.com'
    THEN 'admin' ELSE 'employee' END)
  ON CONFLICT (id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ---------------------------------------------------------
-- SCHRITT 7: is_admin Helper
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
DECLARE r text;
BEGIN
  SELECT role INTO r FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(r = 'admin', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ---------------------------------------------------------
-- SCHRITT 8: create_schedules_with_recurrence (alle Recurrence-Typen)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_schedules_with_recurrence(
  p_employee_id uuid,
  p_customer_id uuid,
  p_shift_date  date,
  p_start_time  time,
  p_end_time    time,
  p_tasks       text    DEFAULT NULL,
  p_recurrence  text    DEFAULT 'once',
  p_status      text    DEFAULT 'scheduled',
  p_occurrences integer DEFAULT 12
)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i             integer;
  occ_date      date;
  new_series_id uuid := gen_random_uuid();
  new_id        uuid;
  step_days     integer;
  max_occ       integer;
  dow           integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Administratoren dürfen Schichten anlegen';
  END IF;

  max_occ := CASE
    WHEN p_recurrence = 'once' THEN 1
    ELSE GREATEST(1, LEAST(COALESCE(p_occurrences, 12), 365))
  END;

  step_days := CASE
    WHEN p_recurrence = 'weekly'       THEN 7
    WHEN p_recurrence = 'biweekly'   THEN 14
    WHEN p_recurrence = 'daily_all'    THEN 1
    WHEN p_recurrence = 'daily_workdays' THEN 1
    ELSE 0
  END;

  i        := 0;
  occ_date := p_shift_date;
  WHILE i < max_occ LOOP
    IF p_recurrence = 'daily_workdays' THEN
      dow := EXTRACT(DOW FROM occ_date)::integer;
      WHILE dow = 0 OR dow = 6 LOOP
        occ_date := occ_date + 1;
        dow := EXTRACT(DOW FROM occ_date)::integer;
      END LOOP;
    END IF;

    INSERT INTO public.schedules (
      employee_id, customer_id, shift_date,
      start_time,  end_time,
      tasks,       instructions,
      status,      recurrence, series_id
    ) VALUES (
      p_employee_id, p_customer_id, occ_date,
      p_start_time,  p_end_time,
      p_tasks,       p_tasks,
      COALESCE(p_status, 'scheduled'),
      p_recurrence,
      CASE WHEN p_recurrence = 'once' THEN NULL ELSE new_series_id END
    ) RETURNING id INTO new_id;
    RETURN NEXT new_id;
    occ_date := occ_date + GREATEST(step_days, 1);
    i        := i + 1;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_schedules_with_recurrence(
  uuid, uuid, date, time, time, text, text, text, integer
) TO authenticated;

-- ---------------------------------------------------------
-- SCHRITT 9: admin_create_employee (RPC)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_email        text,
  p_full_name    text,
  p_phone        text    DEFAULT NULL,
  p_address      text    DEFAULT NULL,
  p_weekly_hours integer DEFAULT 40
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
    instance_id, id, aud, role, email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at, updated_at, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', normalized_email,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'role', 'employee'),
    now(), now(), false
  );
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', normalized_email),
    'email', new_id::text,
    now(), now(), now()
  );
  INSERT INTO public.profiles (id, full_name, role, phone, address, weekly_hours)
  VALUES (new_id, trim(p_full_name), 'employee',
    NULLIF(trim(p_phone), ''),
    NULLIF(trim(p_address), ''),
    COALESCE(p_weekly_hours, 40)
  ) ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone     = EXCLUDED.phone,
    address   = EXCLUDED.address,
    weekly_hours = EXCLUDED.weekly_hours,
    role      = 'employee';
  RETURN new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(text, text, text, text, integer)
  TO authenticated;

-- ---------------------------------------------------------
-- SCHRITT 10: get_my_role RPC (Frontend nutzt diese zum Laden der Rolle)
-- ---------------------------------------------------------
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

-- ---------------------------------------------------------
-- SCHRITT 11: Admin-Rolle sofort setzen
-- ---------------------------------------------------------
UPDATE public.profiles SET role = 'admin'
WHERE id = (SELECT id FROM auth.users
  WHERE lower(email) = 'noahalsamawi688@gmail.com');

-- ---------------------------------------------------------
-- SCHRITT 12: RLS aktivieren
-- ---------------------------------------------------------
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments   ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------
-- SCHRITT 13: Policies erstellen (idempotent)
-- ---------------------------------------------------------
-- profiles
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_insert_own"          ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update"              ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "profiles_delete_admin"        ON public.profiles FOR DELETE
  USING (public.is_admin());

-- customers
CREATE POLICY "customers_select_all"    ON public.customers FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "customers_insert_admin"  ON public.customers FOR INSERT
  WITH CHECK (public.is_admin());
CREATE POLICY "customers_update_admin"    ON public.customers FOR UPDATE
  USING (public.is_admin());
CREATE POLICY "customers_delete_admin"    ON public.customers FOR DELETE
  USING (public.is_admin());

-- schedules
CREATE POLICY "schedules_select_own_or_admin" ON public.schedules FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "schedules_insert_admin"          ON public.schedules FOR INSERT
  WITH CHECK (public.is_admin());
CREATE POLICY "schedules_update_admin"        ON public.schedules FOR UPDATE
  USING (public.is_admin());
CREATE POLICY "schedules_delete_admin"        ON public.schedules FOR DELETE
  USING (public.is_admin());

-- comments
CREATE POLICY "comments_select_auth"    ON public.comments FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "comments_insert_auth"    ON public.comments FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND user_id = auth.uid());
CREATE POLICY "comments_delete_own_admin" ON public.comments FOR DELETE
  USING (user_id = auth.uid() OR public.is_admin());

-- ---------------------------------------------------------
-- SCHRITT 14: Realtime Extensions
-- ---------------------------------------------------------
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ---------------------------------------------------------
-- SCHRITT 15: VERIFIKATION
-- ---------------------------------------------------------
SELECT
  u.email,
  p.role,
  CASE WHEN p.role = 'admin' THEN '✅ Admin OK' ELSE '❌ Kein Admin!' END AS status
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'noahalsamawi688@gmail.com';

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'schedules'
ORDER BY ordinal_position;
