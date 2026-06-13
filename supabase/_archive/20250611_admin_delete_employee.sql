-- ══════════════════════════════════════════════════════════════════
-- Migration: admin_delete_employee RPC
-- Purpose:   Safe, ordered deletion of an employee + all their data.
--
-- DELETE ORDER (avoids RLS breaks and FK violations):
--   1. Load profile first → verify org_id ownership before any writes
--   2. SET NULL on schedules.employee_id  (FK is ON DELETE SET NULL)
--   3. SET NULL on comments.user_id       (FK is ON DELETE SET NULL)
--   4. DELETE public.profiles             (cascades nothing extra)
--   5. DELETE auth.identities             (required before auth.users)
--   6. DELETE auth.users                  (last — triggers no further RLS reads)
--
-- Security:
--   SECURITY DEFINER → runs as migration owner, bypasses client RLS
--   Caller must be admin in same org as the target profile
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_delete_employee(
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_profile        public.profiles%ROWTYPE;
  v_caller_org_id  uuid;
BEGIN
  -- ── Guard 1: Caller must be authenticated admin ──────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Administratoren dürfen Mitarbeiter löschen';
  END IF;

  -- ── Guard 2: Load caller org_id before any delete ────────────────
  v_caller_org_id := public.get_user_org_id();
  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'Administrator hat keine Organisation';
  END IF;

  -- ── Guard 3: Load target profile FIRST (needed for org check) ────
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    -- Orphaned auth user (profile already deleted or never created).
    -- Still clean up auth records to unblock the system.
    RAISE WARNING 'User ohne Profil erkannt (id: %): bereinige auth-Einträge', p_user_id;

    DELETE FROM auth.identities WHERE user_id = p_user_id;
    DELETE FROM auth.users      WHERE id      = p_user_id;
    RETURN;
  END IF;

  -- ── Guard 4: Org isolation — prevent cross-tenant deletes ────────
  IF v_profile.org_id IS NULL THEN
    RAISE EXCEPTION 'Zielprofil hat keine Organisation (id: %)', p_user_id;
  END IF;

  IF v_profile.org_id != v_caller_org_id THEN
    RAISE EXCEPTION 'Zugriff verweigert: anderes Unternehmen';
  END IF;

  -- ── Guard 5: Admin cannot delete themselves ───────────────────────
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Administratoren können sich nicht selbst löschen';
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- STEP 1: Detach employee from schedules (SET NULL, keep shifts)
  -- (FK is already ON DELETE SET NULL — but we do it explicitly here
  --  before profile deletion to avoid any trigger timing issues)
  -- ══════════════════════════════════════════════════════════════════
  UPDATE public.schedules
  SET employee_id = NULL
  WHERE employee_id = p_user_id
    AND org_id = v_caller_org_id;

  -- ══════════════════════════════════════════════════════════════════
  -- STEP 2: Detach user from comments (SET NULL, keep comment text)
  -- ══════════════════════════════════════════════════════════════════
  UPDATE public.comments
  SET user_id = NULL
  WHERE user_id = p_user_id
    AND org_id = v_caller_org_id;

  -- ══════════════════════════════════════════════════════════════════
  -- STEP 3: Delete the profile row
  -- ══════════════════════════════════════════════════════════════════
  DELETE FROM public.profiles
  WHERE id     = p_user_id
    AND org_id = v_caller_org_id;

  -- ══════════════════════════════════════════════════════════════════
  -- STEP 4: Delete auth identity (must precede auth.users delete)
  -- ══════════════════════════════════════════════════════════════════
  DELETE FROM auth.identities
  WHERE user_id = p_user_id;

  -- ══════════════════════════════════════════════════════════════════
  -- STEP 5: Delete the auth user — LAST, after all profile reads done
  -- No RLS-dependent reads happen after this point.
  -- ══════════════════════════════════════════════════════════════════
  DELETE FROM auth.users
  WHERE id = p_user_id;

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_employee(uuid) TO authenticated;
