# REAL SECURITY AUDIT — M. Sharif ShiftFlow

## Audit-Datum: 2026-06-11
## Auditor: Manager (Automated + Manual Review)
## Scope: SQL, RPC Functions, RLS Policies, Frontend Queries

---

## 🔴 CRITICAL RISKS

### RISK-001: `admin_create_employee` setzt KEIN org_id
**Datei:** `supabase/final_reset.sql:289-353`
**Zeile:** 340-350
**Code:**
```sql
INSERT INTO public.profiles (id, full_name, role, phone, address, weekly_hours)
VALUES (new_id, trim(p_full_name), 'employee', ...)
```
**Problem:** Die RPC `admin_create_employee` fügt Profile OHNE `org_id` ein.
**Impact:** Neu angelegte Mitarbeiter haben `org_id = NULL`. Sie sind für RLS unsichtbar und können nicht auf Daten zugreifen.
**Fix:** `org_id` Parameter hinzufügen und in INSERT setzen.

---

### RISK-002: `handle_new_user` Trigger setzt KEIN org_id
**Datei:** `supabase/final_reset.sql:152-167`
**Zeile:** 155-161
**Code:**
```sql
INSERT INTO public.profiles (id, full_name, role)
VALUES (NEW.id, COALESCE(...), CASE WHEN ... THEN 'admin' ELSE 'employee' END)
ON CONFLICT (id) DO NOTHING;
```
**Problem:** Trigger bei Auth-Registrierung setzt kein `org_id`. Alle neuen User haben `org_id = NULL`.
**Impact:** User sind für RLS unsichtbar. Login schlägt fehl oder zeigt keine Daten.
**Fix:** `org_id` aus `raw_user_meta_data` lesen oder Default-Org setzen.

---

### RISK-003: `ensure_user_profile` setzt KEIN org_id
**Datei:** `supabase/final_reset.sql:177-193`
**Zeile:** 188-191
**Code:**
```sql
INSERT INTO public.profiles (id, full_name, role)
VALUES (v_id, v_name, CASE WHEN ... THEN 'admin' ELSE 'employee' END)
ON CONFLICT (id) DO NOTHING;
```
**Problem:** `ensure_user_profile` setzt kein `org_id`.
**Impact:** Gleich wie RISK-002.
**Fix:** `org_id` aus JWT Meta-Daten lesen.

---

### RISK-004: `create_schedules_with_recurrence` (final_reset.sql) setzt KEIN org_id
**Datei:** `supabase/final_reset.sql:211-281`
**Zeile:** 263-275
**Code:**
```sql
INSERT INTO public.schedules (
  employee_id, customer_id, shift_date, start_time, end_time,
  tasks, instructions, status, recurrence, series_id
) VALUES (...)
```
**Problem:** `org_id` fehlt komplett in der INSERT-Liste.
**Impact:** Serientermine haben `org_id = NULL`. Sie sind für RLS unsichtbar.
**Fix:** `org_id` Parameter hinzufügen und in INSERT setzen.

---

### RISK-005: `create_schedules_with_recurrence` (migration_monthly_recurrence.sql) setzt KEIN org_id
**Datei:** `supabase/migration_monthly_recurrence.sql:13-83`
**Zeile:** 45-57
**Code:**
```sql
INSERT INTO public.schedules (
  employee_id, customer_id, shift_date, start_time, end_time,
  tasks, instructions, status, recurrence, series_id
) VALUES (...)
```
**Problem:** Gleich wie RISK-004, andere Datei.
**Impact:** Serientermine aus dem Kalender haben `org_id = NULL`.
**Fix:** `org_id` Parameter hinzufügen.

---

### RISK-006: `set_org_id_on_insert` Trigger ist UNSICHER
**Datei:** `supabase/migrations/20250611_multi_tenant.sql:97-105`
**Zeile:** 99-102
**Code:**
```sql
IF NEW.org_id IS NULL THEN
  NEW.org_id := (SELECT org_id FROM public.profiles WHERE id = auth.uid());
END IF;
```
**Problem:**
1. `IF NEW.org_id IS NULL` → Ein Angreifer kann `org_id` im Payload setzen und damit in eine fremde Organisation schreiben (INSERT spoofing).
2. Keine Validierung, ob `NEW.org_id` zur eigenen Organisation gehört.
**Impact:** Cross-Org Data Injection möglich.
**Fix:** IMMER überschreiben: `NEW.org_id := (SELECT org_id ...)` ohne IF-Bedingung.

---

### RISK-007: `final_reset.sql` Policies haben KEIN org_id
**Datei:** `supabase/final_reset.sql:391-427`
**Zeilen:** 392-427
**Code:**
```sql
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "customers_select_all" ON public.customers FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "schedules_select_own_or_admin" ON public.schedules FOR SELECT
  USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "comments_select_auth" ON public.comments FOR SELECT
  USING (auth.role() = 'authenticated');
```
**Problem:** KEINE dieser Policies prüft `org_id`. Ein authentifizierter User sieht ALLE Daten.
**Impact:** Kompletter Cross-Org Data Leak.
**Fix:** Alle Policies durch org_id-Varianten ersetzen.

---

### RISK-008: `auth_profiles_complete.sql` Policies haben KEIN org_id
**Datei:** `supabase/auth_profiles_complete.sql:127-142`
**Zeilen:** 127-142
**Code:**
```sql
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT USING (public.is_admin());
```
**Problem:** Kein org_id Check. Admin sieht ALLE Profile aller Organisationen.
**Impact:** Cross-Org Admin Access.
**Fix:** `AND org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())` hinzufügen.

---

### RISK-009: `fix_admin_rls.sql` Policies haben KEIN org_id
**Datei:** `supabase/fix_admin_rls.sql:98-152`
**Zeilen:** 98-152
**Code:**
```sql
CREATE POLICY "profiles: select" ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "clients: select all" ON public.clients FOR SELECT USING (true);
CREATE POLICY "schedules: select" ON public.schedules FOR SELECT USING (employee_id = auth.uid() OR public.is_admin());
CREATE POLICY "comments: select authenticated" ON public.comments FOR SELECT USING (auth.role() = 'authenticated');
```
**Problem:** `clients: select all` erlaubt SELECT für ALLE authentifizierten User. Kein org_id.
**Impact:** Jeder User sieht alle Kunden aller Organisationen.
**Fix:** Durch org_id-Varianten ersetzen.

---

### RISK-010: Frontend `useSchedules.ts` RPC call ohne org_id Validation
**Datei:** `src/hooks/useSchedules.ts:170`
**Zeile:** 170
**Code:**
```typescript
const { error: err } = await supabase.rpc("create_schedules_with_recurrence", {
  p_employee_id: input.employee_id,
  ...
  p_org_id: orgId,
});
```
**Problem:** `p_org_id` wird gesendet, aber die RPC-Funktion in `final_reset.sql` akzeptiert diesen Parameter NICHT.
**Impact:** TypeScript-Build wird fehlschlagen oder `p_org_id` wird ignoriert.
**Fix:** RPC-Funktion in SQL muss `p_org_id` Parameter akzeptieren.

---

### RISK-011: Frontend `useProfiles.ts` RPC call mit `p_org_id`, aber SQL akzeptiert nicht
**Datei:** `src/hooks/useProfiles.ts:68`
**Zeile:** 68
**Code:**
```typescript
const { data, error: err } = await supabase.rpc("admin_create_employee", {
  p_email: input.email.trim().toLowerCase(),
  ...
  p_org_id: orgId,
});
```
**Problem:** `admin_create_employee` in `final_reset.sql:289` hat KEINEN `p_org_id` Parameter.
**Impact:** Supabase wird einen Fehler werfen: "function admin_create_employee does not accept p_org_id".
**Fix:** SQL-Funktion um `p_org_id` erweitern.

---

### RISK-012: `comments` Tabelle hat KEIN org_id
**Datei:** `supabase/final_reset.sql:64-70`
**Zeile:** 64-70
**Code:**
```sql
CREATE TABLE IF NOT EXISTS public.comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL,
  user_id     uuid,
  message     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
```
**Problem:** `comments` hat keine `org_id` Spalte. Frontend `useComments.ts` versucht `org_id` zu setzen.
**Impact:** INSERT auf comments schlägt fehl, weil Spalte nicht existiert.
**Fix:** `org_id uuid` Spalte zu comments hinzufügen.

---

### RISK-013: `employee_weekly_hours` View hat KEIN org_id Filter
**Datei:** `supabase/migration_monthly_recurrence.sql:89-104`
**Zeile:** 89-104
**Code:**
```sql
CREATE OR REPLACE VIEW public.employee_weekly_hours AS
SELECT p.id AS employee_id, p.full_name, ...
FROM public.profiles p
LEFT JOIN public.schedules s ON s.employee_id = p.id
WHERE p.role = 'employee'
GROUP BY p.id, p.full_name;
```
**Problem:** View filtert nicht nach `org_id`. Jeder sieht Wochenstunden ALLER Mitarbeiter.
**Impact:** Cross-Org Datenleck.
**Fix:** `AND p.org_id = (SELECT org_id FROM profiles WHERE id = auth.uid())` hinzufügen.

---

### RISK-014: `core_features_migration.sql` — Unbekannte RPCs
**Datei:** `supabase/core_features_migration.sql`
**Befund:** Enthält weitere RPCs, die geprüft werden müssen.
**Aktion:** Manuelle Prüfung erforderlich.

---

## 🟡 MEDIUM RISKS

### RISK-015: `organizations` Tabelle hat keine RLS für INSERT/UPDATE/DELETE
**Datei:** `supabase/migrations/20250611_multi_tenant.sql:50-59`
**Problem:** Nur SELECT Policy existiert. Jeder authentifizierte User kann Organisationen erstellen/ändern/löschen.
**Fix:** INSERT/UPDATE/DELETE Policies hinzufügen.

---

### RISK-016: `profiles_select_own` in `auth_profiles_complete.sql` erlaubt eigenes Profil ohne org_id
**Datei:** `supabase/auth_profiles_complete.sql:127`
**Code:** `USING (id = auth.uid())`
**Problem:** User kann sein eigenes Profil sehen, auch wenn `org_id = NULL`. Das ist für Auth OK, aber für Multi-Tenant problematisch.
**Fix:** `AND org_id IS NOT NULL` hinzufügen oder sicherstellen, dass org_id immer gesetzt ist.

---

## 📋 ZUSAMMENFASSUNG DER FIXES

| # | Datei | Zeile | Fix |
|---|-------|-------|-----|
| 001 | `final_reset.sql` | 289-353 | `p_org_id` Parameter hinzufügen, in INSERT setzen |
| 002 | `final_reset.sql` | 152-167 | `org_id` aus `raw_user_meta_data` lesen |
| 003 | `final_reset.sql` | 177-193 | `org_id` aus JWT Meta-Daten lesen |
| 004 | `final_reset.sql` | 211-281 | `p_org_id` Parameter, in INSERT setzen |
| 005 | `migration_monthly_recurrence.sql` | 13-83 | `p_org_id` Parameter, in INSERT setzen |
| 006 | `20250611_multi_tenant.sql` | 97-105 | Trigger IMMER überschreiben, nicht nur wenn NULL |
| 007 | `final_reset.sql` | 391-427 | Alle Policies durch org_id-Varianten ersetzen |
| 008 | `auth_profiles_complete.sql` | 127-142 | org_id zu Policies hinzufügen |
| 009 | `fix_admin_rls.sql` | 98-152 | org_id zu Policies hinzufügen |
| 010 | `final_reset.sql` | 211-281 | `p_org_id` Parameter akzeptieren |
| 011 | `final_reset.sql` | 289-353 | `p_org_id` Parameter akzeptieren |
| 012 | `final_reset.sql` | 64-70 | `org_id` Spalte zu comments hinzufügen |
| 013 | `migration_monthly_recurrence.sql` | 89-104 | org_id Filter in View |
| 015 | `20250611_multi_tenant.sql` | 50-59 | INSERT/UPDATE/DELETE Policies für organizations |

---

## 🚨 EMPFEHLUNG

**NICHT deployen** bevor alle CRITICAL Risks gefixt sind. Die aktuelle SQL-Struktur ist für Multi-Tenant UNBRauchbar.
