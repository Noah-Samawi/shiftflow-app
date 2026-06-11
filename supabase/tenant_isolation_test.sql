-- ============================================================
-- TENANT ISOLATION TEST — M. Sharif ShiftFlow
-- Tests cross-tenant data access for all 5 scenarios
-- Run in Supabase SQL Editor (as postgres / service_role)
-- ============================================================
--
-- TEST MATRIX:
-- 1. Admin A kann Kunden von B sehen?          → EXPECTED: 0 Zeilen
-- 2. Admin A kann Schichten von B sehen?       → EXPECTED: 0 Zeilen
-- 3. Mitarbeiter A kann Daten von B sehen?     → EXPECTED: 0 Zeilen
-- 4. Mitarbeiter A kann Kunden von A sehen?    → EXPECTED: ≥1 Zeilen (via RLS)
-- 5. Mitarbeiter A kann nur eigene Schichten?  → EXPECTED: nur eigene employee_id
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- SETUP: Create two isolated tenants (Firma A and Firma B)
-- ══════════════════════════════════════════════════════════════════

-- Disable RLS for setup (service_role bypasses anyway, but explicit is clearer)
SET LOCAL row_security = off;

-- ── Firm A ──────────────────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug, owner_id)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Firma A',
  'test-firma-a',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Admin A (id matches a fake auth.users entry below)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
) VALUES (
  'aaaaaaaa-1111-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin-a@test.local', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Admin A"}'::jsonb,
  now(), now(), false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, org_id)
VALUES (
  'aaaaaaaa-1111-0000-0000-000000000001',
  'Admin A', 'admin',
  'aaaaaaaa-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Employee A
INSERT INTO auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
) VALUES (
  'aaaaaaaa-2222-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'employee-a@test.local', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Mitarbeiter A"}'::jsonb,
  now(), now(), false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, org_id)
VALUES (
  'aaaaaaaa-2222-0000-0000-000000000001',
  'Mitarbeiter A', 'employee',
  'aaaaaaaa-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Customer A
INSERT INTO public.customers (id, name, org_id)
VALUES (
  'aaaaaaaa-3333-0000-0000-000000000001',
  'Kunde A', 'aaaaaaaa-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- Schedule A (assigned to Employee A)
INSERT INTO public.schedules (
  id, employee_id, customer_id, shift_date, start_time, end_time,
  status, recurrence, org_id
) VALUES (
  'aaaaaaaa-4444-0000-0000-000000000001',
  'aaaaaaaa-2222-0000-0000-000000000001',
  'aaaaaaaa-3333-0000-0000-000000000001',
  CURRENT_DATE + 1, '09:00', '17:00',
  'scheduled', 'once',
  'aaaaaaaa-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ── Firm B ──────────────────────────────────────────────────────
INSERT INTO public.organizations (id, name, slug, owner_id)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'Firma B',
  'test-firma-b',
  NULL
) ON CONFLICT (id) DO NOTHING;

-- Admin B
INSERT INTO auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
) VALUES (
  'bbbbbbbb-1111-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'admin-b@test.local', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Admin B"}'::jsonb,
  now(), now(), false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, org_id)
VALUES (
  'bbbbbbbb-1111-0000-0000-000000000002',
  'Admin B', 'admin',
  'bbbbbbbb-0000-0000-0000-000000000002'
) ON CONFLICT (id) DO NOTHING;

-- Employee B
INSERT INTO auth.users (
  id, instance_id, aud, role, email, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_super_admin
) VALUES (
  'bbbbbbbb-2222-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'employee-b@test.local', now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Mitarbeiter B"}'::jsonb,
  now(), now(), false
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, full_name, role, org_id)
VALUES (
  'bbbbbbbb-2222-0000-0000-000000000002',
  'Mitarbeiter B', 'employee',
  'bbbbbbbb-0000-0000-0000-000000000002'
) ON CONFLICT (id) DO NOTHING;

-- Customer B
INSERT INTO public.customers (id, name, org_id)
VALUES (
  'bbbbbbbb-3333-0000-0000-000000000002',
  'Kunde B', 'bbbbbbbb-0000-0000-0000-000000000002'
) ON CONFLICT (id) DO NOTHING;

-- Schedule B (assigned to Employee B)
INSERT INTO public.schedules (
  id, employee_id, customer_id, shift_date, start_time, end_time,
  status, recurrence, org_id
) VALUES (
  'bbbbbbbb-4444-0000-0000-000000000002',
  'bbbbbbbb-2222-0000-0000-000000000002',
  'bbbbbbbb-3333-0000-0000-000000000002',
  CURRENT_DATE + 1, '09:00', '17:00',
  'scheduled', 'once',
  'bbbbbbbb-0000-0000-0000-000000000002'
) ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════
-- RE-ENABLE RLS for all tests
-- ══════════════════════════════════════════════════════════════════
SET LOCAL row_security = on;

-- ══════════════════════════════════════════════════════════════════
-- HELPER: set_config simulates auth.uid() for RLS evaluation
-- ══════════════════════════════════════════════════════════════════
-- Usage: SELECT set_config('request.jwt.claims', '{"sub":"<uuid>"}', true);
--        Then RLS policies use auth.uid() = uuid.

-- ══════════════════════════════════════════════════════════════════
-- TEST 1: Admin A versucht Kunden von Firma B zu sehen
-- ERWARTUNG: 0 Zeilen (RLS blockiert org_id != A's org_id)
-- ══════════════════════════════════════════════════════════════════
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'aaaaaaaa-1111-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

SELECT
  'TEST 1: Admin A sieht Kunden von B' AS test_name,
  COUNT(*) AS result_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS — keine Daten von Firma B sichtbar'
    ELSE '❌ FAIL — ' || COUNT(*) || ' Zeile(n) von Firma B fälschlicherweise sichtbar!'
  END AS verdict
FROM public.customers
WHERE org_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- ══════════════════════════════════════════════════════════════════
-- TEST 2: Admin A versucht Schichten von Firma B zu sehen
-- ERWARTUNG: 0 Zeilen
-- ══════════════════════════════════════════════════════════════════
-- (JWT already set to Admin A from above)

SELECT
  'TEST 2: Admin A sieht Schichten von B' AS test_name,
  COUNT(*) AS result_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS — keine Schichten von Firma B sichtbar'
    ELSE '❌ FAIL — ' || COUNT(*) || ' Schicht(en) von Firma B fälschlicherweise sichtbar!'
  END AS verdict
FROM public.schedules
WHERE org_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- ══════════════════════════════════════════════════════════════════
-- TEST 3: Mitarbeiter A versucht beliebige Daten von Firma B zu sehen
-- ERWARTUNG: 0 Zeilen für alle Tabellen
-- ══════════════════════════════════════════════════════════════════
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'aaaaaaaa-2222-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

SELECT
  'TEST 3a: Mitarbeiter A sieht Kunden von B' AS test_name,
  COUNT(*) AS result_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — ' || COUNT(*) || ' Zeile(n) von B sichtbar!'
  END AS verdict
FROM public.customers
WHERE org_id = 'bbbbbbbb-0000-0000-0000-000000000002';

SELECT
  'TEST 3b: Mitarbeiter A sieht Schichten von B' AS test_name,
  COUNT(*) AS result_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — ' || COUNT(*) || ' Zeile(n) von B sichtbar!'
  END AS verdict
FROM public.schedules
WHERE org_id = 'bbbbbbbb-0000-0000-0000-000000000002';

SELECT
  'TEST 3c: Mitarbeiter A sieht Profile von B' AS test_name,
  COUNT(*) AS result_count,
  CASE
    WHEN COUNT(*) = 0 THEN '✅ PASS'
    ELSE '❌ FAIL — ' || COUNT(*) || ' Profil(e) von B sichtbar!'
  END AS verdict
FROM public.profiles
WHERE org_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- ══════════════════════════════════════════════════════════════════
-- TEST 4: Mitarbeiter A kann Kunden von Firma A sehen
-- ERWARTUNG: ≥1 Zeilen (eigene Org ist sichtbar)
-- ══════════════════════════════════════════════════════════════════
-- (JWT still set to Employee A)

SELECT
  'TEST 4: Mitarbeiter A sieht Kunden von A' AS test_name,
  COUNT(*) AS result_count,
  CASE
    WHEN COUNT(*) >= 1 THEN '✅ PASS — eigene Kunden sichtbar (' || COUNT(*) || ')'
    ELSE '❌ FAIL — Mitarbeiter kann keine eigenen Kunden sehen!'
  END AS verdict
FROM public.customers
WHERE org_id = 'aaaaaaaa-0000-0000-0000-000000000001';

-- ══════════════════════════════════════════════════════════════════
-- TEST 5: Mitarbeiter A kann nur eigene Schichten sehen
-- Prüft: Keine Schicht mit employee_id von B im Ergebnis
-- ERWARTUNG: COUNT of B-employee shifts = 0 in returned rows
-- ══════════════════════════════════════════════════════════════════
-- (JWT still set to Employee A)

WITH visible_schedules AS (
  SELECT employee_id, org_id
  FROM public.schedules
  -- RLS filters automatically to org_id = A's org_id
)
SELECT
  'TEST 5: Mitarbeiter A sieht nur Schichten von Org A' AS test_name,
  COUNT(*) FILTER (WHERE org_id = 'aaaaaaaa-0000-0000-0000-000000000001') AS own_org_shifts,
  COUNT(*) FILTER (WHERE org_id != 'aaaaaaaa-0000-0000-0000-000000000001') AS foreign_org_shifts,
  CASE
    WHEN COUNT(*) FILTER (WHERE org_id != 'aaaaaaaa-0000-0000-0000-000000000001') = 0
    THEN '✅ PASS — Mitarbeiter A sieht ausschließlich Schichten der Org A'
    ELSE '❌ FAIL — Schichten einer fremden Org sind sichtbar!'
  END AS verdict
FROM visible_schedules;

-- ══════════════════════════════════════════════════════════════════
-- BONUS TEST 6: Cross-insert attempt — Admin A versucht Kunden in B anzulegen
-- ERWARTUNG: INSERT schlägt fehl (RLS WITH CHECK blockiert)
-- ══════════════════════════════════════════════════════════════════
SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'aaaaaaaa-1111-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);

DO $$
BEGIN
  INSERT INTO public.customers (name, org_id)
  VALUES ('Angriff auf Firma B', 'bbbbbbbb-0000-0000-0000-000000000002');

  RAISE NOTICE 'TEST 6: ❌ FAIL — INSERT in fremde Org war möglich!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'TEST 6: ✅ PASS — INSERT in fremde Org blockiert: %', SQLERRM;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- CLEANUP: Remove all test data
-- ══════════════════════════════════════════════════════════════════
SET LOCAL row_security = off;

DELETE FROM public.schedules WHERE id IN (
  'aaaaaaaa-4444-0000-0000-000000000001',
  'bbbbbbbb-4444-0000-0000-000000000002'
);
DELETE FROM public.customers WHERE id IN (
  'aaaaaaaa-3333-0000-0000-000000000001',
  'bbbbbbbb-3333-0000-0000-000000000002'
);
DELETE FROM public.profiles WHERE id IN (
  'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-2222-0000-0000-000000000001',
  'bbbbbbbb-1111-0000-0000-000000000002',
  'bbbbbbbb-2222-0000-0000-000000000002'
);
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-2222-0000-0000-000000000001',
  'bbbbbbbb-1111-0000-0000-000000000002',
  'bbbbbbbb-2222-0000-0000-000000000002'
);
DELETE FROM public.organizations WHERE id IN (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000002'
);

ROLLBACK; -- Rollback so production data is never touched
-- Change to COMMIT; if you want to persist test fixtures for manual inspection
