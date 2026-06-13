-- =====================================================================
-- ShiftFlow — VERIFICATION SUITE
-- Run AFTER 20260612000000_full_reset_v4.sql, in the Supabase SQL Editor.
--
-- Part A runs functional tests inside a transaction that is ROLLED BACK
-- at the end → it asserts behavior and leaves NO test data behind.
-- Each check RAISES NOTICE 'PASS …'; any failure aborts with the failing
-- assertion message (then the ROLLBACK still cleans up).
--
-- Part B prints the inventory: all tables, functions, and RLS policies.
--
-- Covers: auth flow · registration · approval workflow · employee login ·
--         org isolation (RLS) · working-hours calculation.
-- =====================================================================

BEGIN;

-- Clean any leftovers from a previously-aborted run (no-op on success path).
DELETE FROM auth.users WHERE email IN
  ('verif-adminA@test.local','verif-adminB@test.local', lower(public.platform_owner_email()));

-- ── Step 1: REGISTRATION + AUTH FLOW (trigger provisions org+profile) ─
DO $$
DECLARE
  v_owner uuid := gen_random_uuid();
  v_a     uuid := gen_random_uuid();
  v_b     uuid := gen_random_uuid();
  v_pw    text := extensions.crypt('Test1234!', extensions.gen_salt('bf'));
  v_orgA  uuid; v_orgB uuid;
BEGIN
  -- Helper inline: create three GoTrue-valid auth users (trigger fires).
  INSERT INTO auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_super_admin)
  VALUES
    ('00000000-0000-0000-0000-000000000000',v_owner,'authenticated','authenticated',
       lower(public.platform_owner_email()),v_pw,now(),'','','','','',
       '{"provider":"email","providers":["email"]}','{"full_name":"Platform Owner","company_name":"HQ"}',now(),now(),false),
    ('00000000-0000-0000-0000-000000000000',v_a,'authenticated','authenticated',
       'verif-adminA@test.local',v_pw,now(),'','','','','',
       '{"provider":"email","providers":["email"]}','{"full_name":"Admin A","company_name":"Firma A"}',now(),now(),false),
    ('00000000-0000-0000-0000-000000000000',v_b,'authenticated','authenticated',
       'verif-adminB@test.local',v_pw,now(),'','','','','',
       '{"provider":"email","providers":["email"]}','{"full_name":"Admin B","company_name":"Firma B"}',now(),now(),false);

  -- No orphans: every auth user must have a profile with org_id + role.
  ASSERT (SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
          WHERE p.id IS NULL AND u.email LIKE 'verif-%') = 0, 'ORPHAN: auth user without profile';
  ASSERT (SELECT count(*) FROM public.profiles WHERE org_id IS NULL) = 0, 'profile without org_id';

  SELECT org_id INTO v_orgA FROM public.profiles WHERE id=v_a;
  SELECT org_id INTO v_orgB FROM public.profiles WHERE id=v_b;

  -- New companies start pending; platform owner's own org is active.
  ASSERT (SELECT status FROM public.organizations WHERE id=v_orgA)='pending', 'Firma A should be pending';
  ASSERT (SELECT status FROM public.organizations o JOIN public.profiles p ON p.org_id=o.id
          WHERE p.id=v_owner)='active', 'Owner org should be active';
  -- Roles: company admins are admin of their org; owner bootstrapped to platform_admins.
  ASSERT (SELECT role FROM public.profiles WHERE id=v_a)='admin', 'Admin A role';
  ASSERT (SELECT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=v_owner)), 'owner not in platform_admins';
  -- Audit: signup rows recorded.
  ASSERT (SELECT count(*) FROM public.organization_status_history
          WHERE org_id IN (v_orgA,v_orgB) AND source='signup') = 2, 'signup audit rows missing';

  PERFORM set_config('app.t_owner', v_owner::text, true);
  PERFORM set_config('app.t_a',     v_a::text,     true);
  PERFORM set_config('app.t_b',     v_b::text,     true);
  PERFORM set_config('app.t_orgA',  v_orgA::text,  true);
  PERFORM set_config('app.t_orgB',  v_orgB::text,  true);
  RAISE NOTICE 'PASS: registration + auth flow (no orphans, pending state, audit)';
END $$;

-- ── Step 2: APPROVAL GATE (pending = blocked) for Firma B ────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_b'), 'role','authenticated','email','verif-adminB@test.local')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.customers (name) VALUES ('Should Fail');  -- org pending → must be denied
  EXCEPTION WHEN OTHERS THEN v_blocked := true;
  END;
  ASSERT v_blocked, 'APPROVAL GATE FAILED: pending org could create a customer';
  RAISE NOTICE 'PASS: pending org is blocked from creating data';
END $$;
RESET ROLE;

-- ── Step 2b: APPROVE Firma A and Firma B as the platform owner ───────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_owner'),'role','authenticated','email', lower(public.platform_owner_email()))::text, true);
SET LOCAL ROLE authenticated;
SELECT public.set_org_status(current_setting('app.t_orgA')::uuid, 'active');
SELECT public.set_org_status(current_setting('app.t_orgB')::uuid, 'active');
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT status FROM public.organizations WHERE id=current_setting('app.t_orgA')::uuid)='active', 'A not active';
  ASSERT (SELECT approved_at IS NOT NULL FROM public.organizations WHERE id=current_setting('app.t_orgA')::uuid), 'approved_at not set';
  ASSERT (SELECT count(*) FROM public.organization_status_history
          WHERE org_id=current_setting('app.t_orgA')::uuid AND source='platform_admin'
            AND new_status='active' AND changed_by=current_setting('app.t_owner')::uuid)=1,
         'approval audit (who/when) missing';
  RAISE NOTICE 'PASS: approval workflow (status active, approved_at, auditable who/when)';
END $$;

-- ── Step 2c: after approval, Firma B can create data ─────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_b'),'role','authenticated','email','verif-adminB@test.local')::text, true);
SET LOCAL ROLE authenticated;
INSERT INTO public.customers (name) VALUES ('CustB');
RESET ROLE;

-- ── Step 3: EMPLOYEE CREATION + LOGIN VIABILITY (Firma A) ────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_a'),'role','authenticated','email','verif-adminA@test.local')::text, true);
SET LOCAL ROLE authenticated;
SELECT set_config('app.t_emp',
  public.admin_create_employee('verif-empA@test.local','Mitarbeiter A', NULL, NULL, 10,
                               current_setting('app.t_orgA')::uuid)::text, true);
INSERT INTO public.customers (name) VALUES ('CustA');   -- A's own customer (for isolation test)
RESET ROLE;

DO $$
DECLARE v_emp uuid := current_setting('app.t_emp')::uuid;
BEGIN
  -- Auth row is fully formed → login will NOT throw "Database error loading user".
  ASSERT (SELECT encrypted_password IS NOT NULL FROM auth.users WHERE id=v_emp), 'employee has no password';
  ASSERT (SELECT confirmation_token = '' FROM auth.users WHERE id=v_emp), 'confirmation_token is NULL (would 500)';
  ASSERT (SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id=v_emp), 'employee email not confirmed';
  -- Password actually verifies (proves the employee can authenticate).
  ASSERT (SELECT encrypted_password = extensions.crypt('Willkommen123!', encrypted_password)
          FROM auth.users WHERE id=v_emp), 'temp password does not verify';
  ASSERT (SELECT role='employee' AND org_id=current_setting('app.t_orgA')::uuid AND requires_password_change
          FROM public.profiles WHERE id=v_emp), 'employee profile wrong';
  RAISE NOTICE 'PASS: employee login viability (password set, tokens non-null, profile correct)';
END $$;

-- ── Step 4: ORGANIZATION ISOLATION (RLS) ─────────────────────────────
-- Admin A must see only Firma A data; never Firma B's.
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_a'),'role','authenticated','email','verif-adminA@test.local')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.customers WHERE name='CustB')=0, 'RLS LEAK: A sees B customers';
  ASSERT (SELECT count(*) FROM public.customers WHERE name='CustA')=1, 'A cannot see own customer';
  ASSERT (SELECT count(*) FROM public.profiles WHERE org_id=current_setting('app.t_orgB')::uuid)=0, 'RLS LEAK: A sees B profiles';
  RAISE NOTICE 'PASS: org isolation — Admin A sees only Firma A';
END $$;
RESET ROLE;

-- ── Step 5: WORKING-HOURS CALCULATION (DB-computed) ──────────────────
-- Insert shifts for the employee as Admin A (trigger sets org_id).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_a'),'role','authenticated','email','verif-adminA@test.local')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_emp  uuid := current_setting('app.t_emp')::uuid;
  v_cust uuid;
  v_mon  date := date_trunc('week', CURRENT_DATE)::date;   -- ISO Monday
BEGIN
  SELECT id INTO v_cust FROM public.customers WHERE name='CustA';
  -- Day shift: 08:00–16:00, 60 min break  → 420 worked
  INSERT INTO public.schedules (employee_id, customer_id, shift_date, start_time, end_time, break_minutes)
    VALUES (v_emp, v_cust, v_mon,     '08:00', '16:00', 60);
  -- Overnight: 22:00–06:00, 30 min break  → 450 worked
  INSERT INTO public.schedules (employee_id, customer_id, shift_date, start_time, end_time, break_minutes)
    VALUES (v_emp, v_cust, v_mon + 1, '22:00', '06:00', 30);
END $$;
RESET ROLE;

DO $$
DECLARE v_emp uuid := current_setting('app.t_emp')::uuid;
BEGIN
  -- Generated column correctness (incl. overnight + break).
  ASSERT (SELECT worked_minutes FROM public.schedules WHERE employee_id=v_emp AND start_time='08:00')=420, 'day shift worked_minutes != 420';
  ASSERT (SELECT worked_minutes FROM public.schedules WHERE employee_id=v_emp AND start_time='22:00')=450, 'overnight worked_minutes != 450';
  RAISE NOTICE 'PASS: worked_minutes computed in DB (day=420, overnight=450)';
END $$;

-- Report RPC + weekly overtime (employee contracted 10h = 600 min; worked 870 → OT 270).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', current_setting('app.t_a'),'role','authenticated','email','verif-adminA@test.local')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_w bigint; v_ot bigint;
BEGIN
  SELECT worked_minutes, overtime_minutes INTO v_w, v_ot
  FROM public.report_worked_hours(date_trunc('week',CURRENT_DATE)::date,
                                  date_trunc('week',CURRENT_DATE)::date + 6)
  WHERE employee_id = current_setting('app.t_emp')::uuid LIMIT 1;
  ASSERT v_w = 870,  'report worked_minutes != 870 (got '||COALESCE(v_w,-1)||')';
  ASSERT v_ot = 270, 'report overtime_minutes != 270 (got '||COALESCE(v_ot,-1)||')';
  RAISE NOTICE 'PASS: report_worked_hours (worked=870, weekly overtime=270)';
END $$;
RESET ROLE;

DO $$ BEGIN
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'ALL FUNCTIONAL CHECKS PASSED ✅  (rolling back test data)';
  RAISE NOTICE '──────────────────────────────────────────────';
END $$;

ROLLBACK;

-- =====================================================================
-- PART B — INVENTORY  (tables · functions · RLS policies)
-- =====================================================================

-- All tables
SELECT '— TABLES —' AS section;
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public' AND table_type='BASE TABLE'
ORDER BY table_name;

-- All functions (with argument signatures)
SELECT '— FUNCTIONS —' AS section;
SELECT p.proname AS function,
       pg_get_function_identity_arguments(p.oid) AS args,
       CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'invoker' END AS security
FROM pg_proc p
WHERE p.pronamespace='public'::regnamespace
ORDER BY p.proname;

-- All RLS policies (one per table/command expected; no duplicates)
SELECT '— RLS POLICIES —' AS section;
SELECT tablename, policyname, cmd, roles::text AS roles
FROM pg_policies
WHERE schemaname='public'
ORDER BY tablename, cmd, policyname;

-- Policy count per table/command (each should be exactly 1)
SELECT '— POLICY UNIQUENESS (count must be 1) —' AS section;
SELECT tablename, cmd, count(*) AS policies
FROM pg_policies WHERE schemaname='public'
GROUP BY tablename, cmd
ORDER BY tablename, cmd;
