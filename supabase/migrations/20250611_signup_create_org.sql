-- ══════════════════════════════════════════════════════════════════
-- Migration: signup_create_org RPC
-- Purpose:   Called immediately after a new admin completes signup.
--            Creates a new Organization row and assigns the caller
--            as its owner + admin profile — atomically.
--
-- Caller:    The newly authenticated user (anon key, PKCE session).
-- Security:  SECURITY DEFINER runs as migration owner so it can
--            write to public.profiles and public.organizations even
--            before any RLS policy grants the user access.
-- ══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.signup_create_org(p_company_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_org_id  uuid := gen_random_uuid();
  v_slug    text;
  v_email   text;
  v_name    text;
BEGIN
  -- ── Guard: must be an authenticated session ──────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert';
  END IF;

  IF trim(p_company_name) = '' OR p_company_name IS NULL THEN
    RAISE EXCEPTION 'Firmenname ist erforderlich';
  END IF;

  -- ── Build a URL-safe slug ─────────────────────────────────────────
  v_slug := lower(regexp_replace(trim(p_company_name), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substr(v_org_id::text, 1, 8);

  -- ── Resolve caller email for full_name fallback ───────────────────
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  v_name := COALESCE(
    (SELECT raw_user_meta_data->>'full_name'
     FROM auth.users WHERE id = auth.uid()),
    split_part(v_email, '@', 1)
  );

  -- ── Create the organization ───────────────────────────────────────
  INSERT INTO public.organizations (id, name, slug, owner_id)
  VALUES (v_org_id, trim(p_company_name), v_slug, auth.uid());

  -- ── Create / update the admin profile ────────────────────────────
  -- ON CONFLICT handles the case where the trigger already created a
  -- skeleton profile row before this RPC is called.
  INSERT INTO public.profiles (id, full_name, role, org_id, weekly_hours)
  VALUES (auth.uid(), v_name, 'admin', v_org_id, 40)
  ON CONFLICT (id) DO UPDATE
    SET org_id       = EXCLUDED.org_id,
        role         = 'admin',
        full_name    = CASE
                         WHEN profiles.full_name IS NULL OR profiles.full_name = ''
                         THEN EXCLUDED.full_name
                         ELSE profiles.full_name
                       END;

  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_create_org(text) TO authenticated;
