-- ============================================================
-- M. Sharif ShiftFlow — Multi-Tenant Migration
-- Version: 3.0 — Organization Isolation
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- 1. ORGANIZATIONS TABLE
-- ══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text UNIQUE NOT NULL,
  owner_id   uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON public.organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);

-- ══════════════════════════════════════════════════════════════════
-- 2. ADD org_id TO EXISTING TABLES
-- ══════════════════════════════════════════════════════════════════

-- Profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_profiles_org_id ON public.profiles(org_id);

-- Customers
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_customers_org_id ON public.customers(org_id);

-- Schedules
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_schedules_org_id ON public.schedules(org_id);

-- ══════════════════════════════════════════════════════════════════
-- 3. RLS: ORG ISOLATION POLICIES (NEW — do NOT drop existing)
-- ══════════════════════════════════════════════════════════════════

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization policies
DROP POLICY IF EXISTS "org_members_read" ON public.organizations;
CREATE POLICY "org_members_read"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Profiles org isolation (supplements existing policies)
DROP POLICY IF EXISTS "org_isolation_profiles" ON public.profiles;
CREATE POLICY "org_isolation_profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (
    org_id IS NULL
    OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    OR auth.uid() = id
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Customers org isolation
DROP POLICY IF EXISTS "org_isolation_customers" ON public.customers;
CREATE POLICY "org_isolation_customers"
  ON public.customers FOR ALL TO authenticated
  USING (
    org_id IS NULL
    OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- Schedules org isolation
DROP POLICY IF EXISTS "org_isolation_schedules" ON public.schedules;
CREATE POLICY "org_isolation_schedules"
  ON public.schedules FOR ALL TO authenticated
  USING (
    org_id IS NULL
    OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    org_id IS NULL
    OR org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════════
-- 4. FUNCTION: Auto-set org_id on insert
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_org_id_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := (SELECT org_id FROM public.profiles WHERE id = auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-set org_id for customers
DROP TRIGGER IF EXISTS trg_customers_set_org_id ON public.customers;
CREATE TRIGGER trg_customers_set_org_id
  BEFORE INSERT ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_on_insert();

-- Auto-set org_id for schedules
DROP TRIGGER IF EXISTS trg_schedules_set_org_id ON public.schedules;
CREATE TRIGGER trg_schedules_set_org_id
  BEFORE INSERT ON public.schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_on_insert();

-- ══════════════════════════════════════════════════════════════════
-- 5. BACKFILL: Set org_id for existing data (single-tenant → multi-tenant)
-- ══════════════════════════════════════════════════════════════════

-- Create a default organization for existing admin
DO $$
DECLARE
  v_admin_id uuid;
  v_org_id uuid;
BEGIN
  -- Find first admin
  SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    -- Create default organization
    INSERT INTO public.organizations (name, slug, owner_id)
    VALUES ('Meine Firma', 'meine-firma', v_admin_id)
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_org_id;

    -- If org already existed, get its id
    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'meine-firma';
    END IF;

    -- Link all profiles to this org
    UPDATE public.profiles SET org_id = v_org_id WHERE org_id IS NULL;

    -- Link all customers to this org
    UPDATE public.customers SET org_id = v_org_id WHERE org_id IS NULL;

    -- Link all schedules to this org
    UPDATE public.schedules SET org_id = v_org_id WHERE org_id IS NULL;
  END IF;
END $$;

COMMIT;

-- ══════════════════════════════════════════════════════════════════
-- ZUSAMMENFASSUNG
-- ══════════════════════════════════════════════════════════════════
-- Neue Tabelle: organizations
-- Neue Spalten: profiles.org_id, customers.org_id, schedules.org_id
-- Neue Policies: org_members_read, org_isolation_profiles/customers/schedules
-- Neue Trigger: trg_customers_set_org_id, trg_schedules_set_org_id
-- Backfill: Bestehende Daten werden einer Default-Organisation zugewiesen
