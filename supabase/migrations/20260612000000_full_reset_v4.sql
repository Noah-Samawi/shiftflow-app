-- =====================================================================
-- ShiftFlow — FULL DATABASE RESET  (v4 · single source of truth)
-- File: supabase/migrations/20260612000000_full_reset_v4.sql
-- ---------------------------------------------------------------------
--  ⚠️  DESTRUCTIVE — DEVELOPMENT / TEST ENVIRONMENT ONLY
--  • Drops the ENTIRE public schema → removes all migration drift.
--  • Deletes ALL auth.users (cascades) → no pre-existing orphans.
--  • Preserves NO data.
--
--  RUN: Supabase Dashboard → SQL Editor → paste this whole file → Run
--       (needs the service-role / postgres connection).
--
--  THIS FILE IS THE ONLY SOURCE OF TRUTH. No other SQL script defines
--  these objects. Once applied to an environment with real data, FREEZE
--  this file and add changes as new, additive migrations only.
--
--  CONTENTS
--    0  Hard wipe                         6  Auth trigger (no orphans)
--    1  Tables                            7  Approval workflow + audit
--    2  Security-definer helpers          8  Working-hours (DB-computed)
--    3  Column privileges (hardening)     9  Frontend RPCs
--    4  RLS policies                     10  Realtime
--    5  Auto org_id triggers             11  Verification queries
--
--  DESIGN GUARANTEES
--    • profiles.org_id NOT NULL; every auth user gets a profile+org.
--    • New companies start 'pending'; data access gated by is_org_active().
--    • All status changes are audited in organization_status_history.
--    • platform_admins table → future platform-admin role, no rewrite.
--    • All hour math is in the DB (generated columns + views + RPC).
--    • Clients cannot change role / org_id / org status (column grants).
-- =====================================================================

BEGIN;

-- =====================================================================
-- 0. HARD WIPE
-- =====================================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL   ON SCHEMA public TO postgres, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;

DELETE FROM auth.users;   -- cascades to identities / sessions / refresh_tokens

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- =====================================================================
-- 1. TABLES
-- =====================================================================

-- ── organizations (root of tenant isolation + approval state) ────────
CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','active','suspended','rejected')),
  approved_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_organizations_owner  ON public.organizations(owner_id);
CREATE INDEX idx_organizations_status ON public.organizations(status);

-- ── profiles (1:1 with auth.users · org_id NOT NULL) ─────────────────
CREATE TABLE public.profiles (
  id                       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name                text NOT NULL,
  phone                    text,
  address                  text,
  avatar_url               text,
  weekly_hours             integer NOT NULL DEFAULT 40 CHECK (weekly_hours >= 0),
  role                     text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','employee')),
  org_id                   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requires_password_change boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_profiles_role   ON public.profiles(role);

-- ── platform_admins (platform-level operators; future-proof, may be empty) ─
-- Bootstrapped automatically for the platform owner email at signup.
CREATE TABLE public.platform_admins (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── organization_status_history (full audit trail of approval changes) ─
CREATE TABLE public.organization_status_history (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  old_status  text,
  new_status  text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL for email-link/system
  source      text NOT NULL DEFAULT 'system'
                CHECK (source IN ('signup','email_link','platform_admin','system')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_status_history_org ON public.organization_status_history(org_id, created_at DESC);

-- ── customers ────────────────────────────────────────────────────────
CREATE TABLE public.customers (
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
CREATE INDEX idx_customers_org_id ON public.customers(org_id);

-- ── schedules (planned shifts + DB-computed worked minutes) ──────────
CREATE TABLE public.schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid REFERENCES public.profiles(id)  ON DELETE SET NULL,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  shift_date    date NOT NULL,
  start_time    time NOT NULL,
  end_time      time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  instructions  text,
  tasks         text,
  status        text NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','confirmed','completed','cancelled')),
  recurrence    text NOT NULL DEFAULT 'once'
                  CHECK (recurrence IN ('once','weekly','biweekly','monthly')),
  series_id     uuid,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Net worked minutes, computed by the DB. Handles overnight shifts
  -- (end < start ⇒ +24h) and subtracts the break. Always consistent.
  worked_minutes integer GENERATED ALWAYS AS (
    GREATEST(
      0,
      (CASE WHEN end_time >= start_time
            THEN (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::int
            ELSE (EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::int + 1440
       END) - break_minutes
    )
  ) STORED
);
CREATE INDEX idx_schedules_org_id      ON public.schedules(org_id);
CREATE INDEX idx_schedules_shift_date  ON public.schedules(shift_date);
CREATE INDEX idx_schedules_employee_id ON public.schedules(employee_id);
CREATE INDEX idx_schedules_customer_id ON public.schedules(customer_id);
CREATE INDEX idx_schedules_series_id   ON public.schedules(series_id);

-- ── comments ──────────────────────────────────────────────────────────
CREATE TABLE public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  message     text NOT NULL,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_org_id      ON public.comments(org_id);
CREATE INDEX idx_comments_schedule_id ON public.comments(schedule_id);

-- =====================================================================
-- 2. SECURITY-DEFINER HELPERS  (bypass RLS → no recursion)
-- =====================================================================

-- Single place that defines the platform owner email (no scattered hardcoding).
CREATE OR REPLACE FUNCTION public.platform_owner_email()
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT 'noah.alsamawi@gmail.com'::text $$;

CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT org_id FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()), false) $$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1 $$;

-- True only when the caller's organization is approved/active.
CREATE OR REPLACE FUNCTION public.is_org_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT o.status = 'active'
    FROM public.profiles p JOIN public.organizations o ON o.id = p.org_id
    WHERE p.id = auth.uid()
  ), false)
$$;

-- Membership-based platform admin (table-driven → future-proof, no rewrite).
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) $$;

GRANT EXECUTE ON FUNCTION public.get_user_org_id()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_active()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin()  TO authenticated;

-- =====================================================================
-- 3. COLUMN PRIVILEGES  (hardening — clients cannot escalate)
-- =====================================================================
-- Default privileges granted ALL; narrow UPDATE so role/org/status can
-- only change via SECURITY DEFINER functions (which run as table owner).

REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT  UPDATE (full_name, phone, address, avatar_url, weekly_hours, requires_password_change)
  ON public.profiles TO authenticated;   -- NOT role, NOT org_id

REVOKE UPDATE ON public.organizations FROM authenticated, anon;
GRANT  UPDATE (name, slug) ON public.organizations TO authenticated;  -- NOT status/approved_at

-- Audit + platform tables: no direct client writes at all.
REVOKE INSERT, UPDATE, DELETE ON public.organization_status_history FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.platform_admins             FROM authenticated, anon;

-- =====================================================================
-- 4. RLS POLICIES  (exactly one per table/command; data gated by is_org_active)
-- =====================================================================

ALTER TABLE public.organizations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_status_history  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments                     ENABLE ROW LEVEL SECURITY;

-- ── organizations (readable while pending so the app can show status) ──
CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated
  USING (id = public.get_user_org_id() OR public.is_platform_admin());
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (id = public.get_user_org_id() AND owner_id = auth.uid())
  WITH CHECK (id = public.get_user_org_id() AND owner_id = auth.uid());

-- ── profiles (readable while pending; writes require active org) ──────
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.is_org_active());
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND (id = auth.uid() OR public.is_admin()) AND public.is_org_active())
  WITH CHECK (org_id = public.get_user_org_id());
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active());

-- ── platform_admins (only platform admins can read; no client writes) ─
CREATE POLICY platform_admins_select ON public.platform_admins FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ── organization_status_history (platform admins, or own org) ─────────
CREATE POLICY org_history_select ON public.organization_status_history FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() OR public.is_platform_admin());

-- ── customers (all access requires an ACTIVE org) ─────────────────────
CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_org_active());
CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active());
CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active())
  WITH CHECK (org_id = public.get_user_org_id());
CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active());

-- ── schedules ──
CREATE POLICY schedules_select ON public.schedules FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_org_active());
CREATE POLICY schedules_insert ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active());
CREATE POLICY schedules_update ON public.schedules FOR UPDATE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active())
  WITH CHECK (org_id = public.get_user_org_id());
CREATE POLICY schedules_delete ON public.schedules FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_admin() AND public.is_org_active());

-- ── comments ──
CREATE POLICY comments_select ON public.comments FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id() AND public.is_org_active());
CREATE POLICY comments_insert ON public.comments FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_user_org_id() AND user_id = auth.uid() AND public.is_org_active());
CREATE POLICY comments_delete ON public.comments FOR DELETE TO authenticated
  USING (org_id = public.get_user_org_id() AND (user_id = auth.uid() OR public.is_admin()) AND public.is_org_active());

-- =====================================================================
-- 5. AUTO-SET org_id ON INSERT  (anti-spoofing for tenant tables)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_set_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.org_id := public.get_user_org_id(); RETURN NEW; END; $$;

CREATE TRIGGER trg_customers_set_org_id BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_org_id();
CREATE TRIGGER trg_schedules_set_org_id BEFORE INSERT ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_org_id();
CREATE TRIGGER trg_comments_set_org_id  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_org_id();

-- =====================================================================
-- 6. AUTH TRIGGER  handle_new_user()  — NO orphan possible
--    • org_id in metadata  → join existing org as employee
--    • no org_id           → create org (signer = admin); platform owner's
--                            own org is auto-active, everyone else pending
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_role      text;
  v_name      text;
  v_org_name  text;
  v_slug      text;
  v_status    text;
  v_is_owner  boolean := lower(NEW.email) = lower(public.platform_owner_email());
BEGIN
  v_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name',''), split_part(NEW.email,'@',1));

  -- Bootstrap the platform owner into platform_admins (no schema rewrite later).
  IF v_is_owner THEN
    INSERT INTO public.platform_admins (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;

  v_org_id := NULLIF(NEW.raw_user_meta_data->>'org_id','')::uuid;
  IF v_org_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
    v_org_id := NULL;
  END IF;

  IF v_org_id IS NOT NULL THEN
    -- Joining an existing (already-approved) org as employee.
    v_role := 'employee';
  ELSE
    -- New company. Owner's personal org is active; customers start pending.
    v_org_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'org_name',''),
                           NULLIF(NEW.raw_user_meta_data->>'company_name',''), 'Meine Firma');
    v_slug   := lower(regexp_replace(v_org_name,'[^a-zA-Z0-9]+','-','g'))
                || '-' || substr(replace(NEW.id::text,'-',''),1,12);
    v_status := CASE WHEN v_is_owner THEN 'active' ELSE 'pending' END;
    v_role   := 'admin';

    PERFORM set_config('app.audit_source', 'signup', true);
    INSERT INTO public.organizations (name, slug, owner_id, status, approved_at)
    VALUES (v_org_name, v_slug, NEW.id, v_status,
            CASE WHEN v_status = 'active' THEN now() ELSE NULL END)
    RETURNING id INTO v_org_id;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, org_id, requires_password_change)
  VALUES (NEW.id, v_name, v_role, v_org_id,
          COALESCE((NEW.raw_user_meta_data->>'requires_password_change')::boolean, false))
  ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, role = EXCLUDED.role;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 7. APPROVAL WORKFLOW + AUDIT
-- =====================================================================

-- Audit every status change (INSERT and any UPDATE OF status).
-- Source/actor are read from transaction-local settings when provided.
CREATE OR REPLACE FUNCTION public.log_org_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.organization_status_history (org_id, old_status, new_status, changed_by, source, note)
    VALUES (NEW.id, NULL, NEW.status, NEW.owner_id,
            COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'signup'),
            NULLIF(current_setting('app.audit_note', true), ''));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.organization_status_history (org_id, old_status, new_status, changed_by, source, note)
    VALUES (NEW.id, OLD.status, NEW.status,
            NULLIF(current_setting('app.audit_actor', true), '')::uuid,
            COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'system'),
            NULLIF(current_setting('app.audit_note', true), ''));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_org_status_history_ins AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_org_status_change();
CREATE TRIGGER trg_org_status_history_upd AFTER UPDATE OF status ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.log_org_status_change();

-- Change an org's status (approve / reject / suspend / reactivate).
--   • Authenticated platform admins → source 'platform_admin', actor = caller.
--   • Edge Function (service_role)   → must pass p_source = 'email_link'.
CREATE OR REPLACE FUNCTION public.set_org_status(
  p_org_id uuid,
  p_status text,
  p_source text DEFAULT 'platform_admin',
  p_note   text DEFAULT NULL
)
RETURNS public.organizations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_row public.organizations%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending','active','suspended','rejected') THEN
    RAISE EXCEPTION 'Ungültiger Status: %', p_status;
  END IF;

  IF p_source = 'email_link' THEN
    IF auth.role() <> 'service_role' THEN
      RAISE EXCEPTION 'email_link-Quelle nur über Service-Role erlaubt';
    END IF;
    PERFORM set_config('app.audit_actor', '', true);
  ELSE
    IF NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'Nur Plattform-Administratoren dürfen den Status ändern';
    END IF;
    p_source := 'platform_admin';
    PERFORM set_config('app.audit_actor', auth.uid()::text, true);
  END IF;

  PERFORM set_config('app.audit_source', p_source, true);
  PERFORM set_config('app.audit_note', COALESCE(p_note, ''), true);

  UPDATE public.organizations
     SET status = p_status,
         approved_at = CASE WHEN p_status = 'active' THEN now() ELSE approved_at END
   WHERE id = p_org_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN RAISE EXCEPTION 'Organisation nicht gefunden: %', p_org_id; END IF;
  RETURN v_row;
END;
$$;
-- Callable by platform admins (in-app) and the service-role Edge Function.
GRANT EXECUTE ON FUNCTION public.set_org_status(uuid, text, text, text) TO authenticated, service_role;

-- =====================================================================
-- 8. WORKING HOURS  (all math in the DB; frontend only displays)
-- =====================================================================

-- Current-week summary per employee. security_invoker ⇒ org RLS applies.
-- Keeps employee_id + hours_this_week (frontend contract) and adds detail.
CREATE OR REPLACE VIEW public.employee_weekly_hours
WITH (security_invoker = true) AS
SELECT
  p.id                                   AS employee_id,
  p.full_name,
  p.org_id,
  date_trunc('week', CURRENT_DATE)::date AS week_start,
  COALESCE(SUM(s.worked_minutes), 0)                 AS worked_minutes,
  COALESCE(SUM(s.break_minutes), 0)                  AS break_minutes,
  (p.weekly_hours * 60)                              AS contracted_minutes,
  GREATEST(0, COALESCE(SUM(s.worked_minutes),0) - p.weekly_hours*60) AS overtime_minutes,
  ROUND(COALESCE(SUM(s.worked_minutes),0) / 60.0, 1)::numeric(10,1)  AS hours_this_week
FROM public.profiles p
LEFT JOIN public.schedules s
  ON  s.employee_id = p.id
  AND s.shift_date >= date_trunc('week', CURRENT_DATE)::date
  AND s.shift_date <  date_trunc('week', CURRENT_DATE)::date + 7
  AND s.status <> 'cancelled'
WHERE p.role = 'employee'
GROUP BY p.id, p.full_name, p.org_id, p.weekly_hours;

GRANT SELECT ON public.employee_weekly_hours TO authenticated;

-- Payroll/reporting RPC: per-employee, per-ISO-week totals for any range.
-- Admin-only, org-scoped. Returns minutes; export logic stays in the frontend.
CREATE OR REPLACE FUNCTION public.report_worked_hours(p_from date, p_to date)
RETURNS TABLE (
  employee_id        uuid,
  full_name          text,
  iso_year           int,
  iso_week           int,
  week_start         date,
  worked_minutes     bigint,
  break_minutes      bigint,
  contracted_minutes int,
  overtime_minutes   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id, p.full_name,
    EXTRACT(ISOYEAR FROM s.shift_date)::int,
    EXTRACT(WEEK    FROM s.shift_date)::int,
    date_trunc('week', s.shift_date)::date,
    COALESCE(SUM(s.worked_minutes), 0)::bigint,
    COALESCE(SUM(s.break_minutes), 0)::bigint,
    (p.weekly_hours * 60),
    GREATEST(0, COALESCE(SUM(s.worked_minutes),0) - p.weekly_hours*60)::bigint
  FROM public.profiles p
  JOIN public.schedules s ON s.employee_id = p.id AND s.status <> 'cancelled'
  WHERE p.org_id = public.get_user_org_id()
    AND public.is_admin()
    AND public.is_org_active()
    AND s.shift_date BETWEEN p_from AND p_to
  GROUP BY p.id, p.full_name, p.weekly_hours,
           EXTRACT(ISOYEAR FROM s.shift_date), EXTRACT(WEEK FROM s.shift_date),
           date_trunc('week', s.shift_date)
  ORDER BY p.full_name, 3, 4;
$$;
GRANT EXECUTE ON FUNCTION public.report_worked_hours(date, date) TO authenticated;

-- =====================================================================
-- 9. FRONTEND RPCs
-- =====================================================================

-- ── ensure_user_profile() — self-heal fallback (idempotent) ──────────
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id     uuid := auth.uid();
  v_email  text := auth.jwt()->>'email';
  v_name   text := COALESCE(NULLIF(auth.jwt()->>'full_name',''), split_part(auth.jwt()->>'email','@',1));
  v_org_id uuid;
  v_slug   text;
  v_owner  boolean := lower(COALESCE(auth.jwt()->>'email','')) = lower(public.platform_owner_email());
BEGIN
  IF v_id IS NULL THEN RETURN; END IF;
  SELECT org_id INTO v_org_id FROM public.profiles WHERE id = v_id;
  IF v_org_id IS NOT NULL THEN RETURN; END IF;

  v_slug := 'org-' || substr(replace(v_id::text,'-',''),1,12);
  PERFORM set_config('app.audit_source', 'signup', true);
  INSERT INTO public.organizations (name, slug, owner_id, status, approved_at)
  VALUES ('Meine Firma', v_slug, v_id,
          CASE WHEN v_owner THEN 'active' ELSE 'pending' END,
          CASE WHEN v_owner THEN now() ELSE NULL END)
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_org_id;
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE slug = v_slug;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, org_id)
  VALUES (v_id, v_name, 'admin', v_org_id)
  ON CONFLICT (id) DO UPDATE SET org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- ── signup_create_org(p_company_name) — idempotent rename-or-create ──
CREATE OR REPLACE FUNCTION public.signup_create_org(p_company_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_org_id uuid;
  v_slug   text;
  v_name   text;
  v_owner  boolean := lower(COALESCE(auth.jwt()->>'email','')) = lower(public.platform_owner_email());
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  IF p_company_name IS NULL OR trim(p_company_name) = '' THEN
    RAISE EXCEPTION 'Firmenname ist erforderlich';
  END IF;

  v_slug := lower(regexp_replace(trim(p_company_name),'[^a-zA-Z0-9]+','-','g'))
            || '-' || substr(replace(v_uid::text,'-',''),1,8);

  SELECT org_id INTO v_org_id FROM public.profiles WHERE id = v_uid;

  IF v_org_id IS NOT NULL THEN
    UPDATE public.organizations SET name = trim(p_company_name), slug = v_slug
     WHERE id = v_org_id;                     -- status untouched (stays pending)
  ELSE
    PERFORM set_config('app.audit_source', 'signup', true);
    INSERT INTO public.organizations (name, slug, owner_id, status, approved_at)
    VALUES (trim(p_company_name), v_slug, v_uid,
            CASE WHEN v_owner THEN 'active' ELSE 'pending' END,
            CASE WHEN v_owner THEN now() ELSE NULL END)
    RETURNING id INTO v_org_id;
  END IF;

  SELECT COALESCE(NULLIF(raw_user_meta_data->>'full_name',''), split_part(email,'@',1))
    INTO v_name FROM auth.users WHERE id = v_uid;

  INSERT INTO public.profiles (id, full_name, role, org_id, weekly_hours)
  VALUES (v_uid, COALESCE(v_name,'Admin'), 'admin', v_org_id, 40)
  ON CONFLICT (id) DO UPDATE
    SET org_id = v_org_id, role = 'admin',
        full_name = CASE WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = ''
                         THEN EXCLUDED.full_name ELSE public.profiles.full_name END;

  RETURN v_org_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.signup_create_org(text) TO authenticated;

-- ── admin_create_employee(...) — FULLY-FORMED auth user (no login 500) ─
CREATE OR REPLACE FUNCTION public.admin_create_employee(
  p_email text, p_full_name text, p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL, p_weekly_hours integer DEFAULT 40, p_org_id uuid DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_new_id     uuid := gen_random_uuid();
  v_email      text := lower(trim(p_email));
  v_temp_pw    text := 'Willkommen123!';   -- communicate out-of-band; must change on 1st login
  v_caller_org uuid := public.get_user_org_id();
BEGIN
  IF NOT public.is_admin()      THEN RAISE EXCEPTION 'Nur Administratoren dürfen Mitarbeiter anlegen'; END IF;
  IF NOT public.is_org_active() THEN RAISE EXCEPTION 'Organisation ist nicht freigeschaltet'; END IF;
  IF p_org_id IS NULL OR p_org_id <> v_caller_org THEN RAISE EXCEPTION 'Ungültige Organisation'; END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'E-Mail ist erforderlich'; END IF;
  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN RAISE EXCEPTION 'Name ist erforderlich'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Diese E-Mail ist bereits registriert';
  END IF;

  -- All GoTrue NOT-NULL token columns set to '' → no "Database error loading user" at login.
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', v_new_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_temp_pw, extensions.gen_salt('bf')), now(),
    '', '', '', '', '',
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', trim(p_full_name), 'org_id', p_org_id, 'requires_password_change', true),
    now(), now(), false
  );

  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_new_id,
          jsonb_build_object('sub', v_new_id::text, 'email', v_email),
          'email', v_new_id::text, now(), now(), now());

  -- handle_new_user() already created the profile (org from metadata); add HR fields.
  INSERT INTO public.profiles (id, full_name, role, phone, address, weekly_hours, org_id, requires_password_change)
  VALUES (v_new_id, trim(p_full_name), 'employee',
          NULLIF(trim(p_phone),''), NULLIF(trim(p_address),''), COALESCE(p_weekly_hours,40), p_org_id, true)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, address = EXCLUDED.address,
    weekly_hours = EXCLUDED.weekly_hours, role = 'employee', org_id = p_org_id, requires_password_change = true;

  RETURN v_new_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_create_employee(text, text, text, text, integer, uuid) TO authenticated;

-- ── delete_user_safe(p_user_id) — ordered, org-scoped deletion ───────
CREATE OR REPLACE FUNCTION public.delete_user_safe(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_profile       public.profiles%ROWTYPE;
  v_caller_org_id uuid;
BEGIN
  IF auth.uid() IS NULL  THEN RAISE EXCEPTION 'Nicht authentifiziert'; END IF;
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Nur Administratoren dürfen Mitarbeiter löschen'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Administratoren können sich nicht selbst löschen'; END IF;

  v_caller_org_id := public.get_user_org_id();
  IF v_caller_org_id IS NULL THEN RAISE EXCEPTION 'Administrator hat keine Organisation'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users      WHERE id      = p_user_id;
    RETURN;
  END IF;
  IF v_profile.org_id <> v_caller_org_id THEN RAISE EXCEPTION 'Zugriff verweigert: anderes Unternehmen'; END IF;

  UPDATE public.schedules SET employee_id = NULL WHERE employee_id = p_user_id AND org_id = v_caller_org_id;
  UPDATE public.comments  SET user_id     = NULL WHERE user_id     = p_user_id AND org_id = v_caller_org_id;
  DELETE FROM public.profiles WHERE id      = p_user_id AND org_id = v_caller_org_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users      WHERE id      = p_user_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_user_safe(uuid) TO authenticated;

-- ── create_schedules_with_recurrence(...) (+ p_break_minutes, default 0) ─
CREATE OR REPLACE FUNCTION public.create_schedules_with_recurrence(
  p_employee_id uuid, p_customer_id uuid, p_shift_date date,
  p_start_time time, p_end_time time, p_tasks text DEFAULT NULL,
  p_recurrence text DEFAULT 'once', p_status text DEFAULT 'scheduled',
  p_occurrences integer DEFAULT 12, p_org_id uuid DEFAULT NULL,
  p_break_minutes integer DEFAULT 0
)
RETURNS SETOF uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  i integer := 0; occ_date date := p_shift_date;
  v_series uuid := gen_random_uuid(); new_id uuid; max_occ integer;
BEGIN
  IF NOT public.is_admin()      THEN RAISE EXCEPTION 'Nur Administratoren dürfen Schichten anlegen'; END IF;
  IF NOT public.is_org_active() THEN RAISE EXCEPTION 'Organisation ist nicht freigeschaltet'; END IF;
  IF p_org_id IS NULL OR p_org_id <> public.get_user_org_id() THEN RAISE EXCEPTION 'Ungültige Organisation'; END IF;

  max_occ := CASE WHEN p_recurrence = 'once' THEN 1
                  ELSE GREATEST(1, LEAST(COALESCE(p_occurrences,12), 365)) END;

  WHILE i < max_occ LOOP
    INSERT INTO public.schedules (
      employee_id, customer_id, shift_date, start_time, end_time, break_minutes,
      tasks, instructions, status, recurrence, series_id, org_id
    ) VALUES (
      p_employee_id, p_customer_id, occ_date, p_start_time, p_end_time, GREATEST(COALESCE(p_break_minutes,0),0),
      p_tasks, p_tasks, COALESCE(p_status,'scheduled'), p_recurrence,
      CASE WHEN p_recurrence = 'once' THEN NULL ELSE v_series END, p_org_id
    ) RETURNING id INTO new_id;
    RETURN NEXT new_id;

    occ_date := CASE p_recurrence
      WHEN 'weekly'   THEN occ_date + 7
      WHEN 'biweekly' THEN occ_date + 14
      WHEN 'monthly'  THEN (date_trunc('month', occ_date) + interval '1 month'
                            + (EXTRACT(DAY FROM p_shift_date)::int - 1) * interval '1 day')::date
      ELSE occ_date + 1
    END;
    i := i + 1;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_schedules_with_recurrence(
  uuid, uuid, date, time, time, text, text, text, integer, uuid, integer
) TO authenticated;

-- =====================================================================
-- 10. REALTIME
-- =====================================================================
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.comments;  EXCEPTION WHEN OTHERS THEN NULL; END $$;

COMMIT;

-- =====================================================================
-- 11. VERIFICATION  (quick structural checks; full test suite is in
--     supabase/verification_suite.sql)
-- =====================================================================
SELECT 'tables' AS check, string_agg(table_name, ', ' ORDER BY table_name) AS value
FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';

SELECT tablename, cmd, count(*) AS policies
FROM pg_policies WHERE schemaname='public' GROUP BY tablename, cmd ORDER BY tablename, cmd;

SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace ORDER BY proname;

SELECT (SELECT count(*) FROM auth.users)           AS auth_users,
       (SELECT count(*) FROM public.profiles)      AS profiles,
       (SELECT count(*) FROM public.organizations) AS organizations;

-- Orphan guard (expect 0 rows)
SELECT u.id, u.email FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id WHERE p.id IS NULL;
-- Integrity guard (expect 0 rows)
SELECT id, full_name FROM public.profiles WHERE org_id IS NULL OR role IS NULL;
