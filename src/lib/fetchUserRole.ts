import { supabase } from "./supabaseClient";
import type { Profile } from "../types/database";
import { isAdminEmail } from "../config/adminEmails";

/**
 * Normalisiert den Wert aus public.profiles.role (Spaltenname: „role“, Werte: admin | employee).
 * Kein is_admin / role_id in diesem Projekt — siehe types/database.ts.
 */
export function normalizeRole(
  raw: string | null | undefined
): Profile["role"] | null {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (r === "admin" || r === "administrator") return "admin";
  if (r === "employee" || r === "mitarbeiter") return "employee";
  return null;
}

/** Endgültige Rolle: DB → E-Mail-Fallback → null (wird als Mitarbeiter angezeigt). */
export function resolveRole(
  dbRole: string | null | undefined,
  email: string | undefined | null
): Profile["role"] | null {
  const fromDb = normalizeRole(dbRole);
  if (fromDb) return fromDb;
  if (isAdminEmail(email)) return "admin";
  return null;
}

/**
 * Lädt die Rolle des eingeloggten Users zuverlässig:
 * 1) JWT/Session aktivieren
 * 2) RPC get_my_role (SECURITY DEFINER, kein RLS-Deadlock)
 * 3) Fallback: direkte profiles-Abfrage
 * 4) Fehlt ein Profil: RPC ensure_user_profile + erneuter Versuch
 */
export async function fetchUserRole(
  userId: string,
  email?: string | null
): Promise<Profile["role"] | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return resolveRole(null, email);
  }

  // RPC: umgeht typische RLS-/is_admin()-Recursion-Probleme beim eigenen Profil
  const { data: rpcRole, error: rpcError } = await supabase.rpc("get_my_role");

  if (!rpcError && rpcRole != null && rpcRole !== "") {
    const resolved = resolveRole(String(rpcRole), email);
    if (resolved) return resolved;
  }

  if (rpcError) {
    console.warn(
      "[Auth] RPC get_my_role fehlgeschlagen (Migration ausführen?):",
      rpcError.message
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!profileError && profile?.role) {
    return resolveRole(profile.role, email);
  }

  if (profileError) {
    console.error("[Auth] profiles-Abfrage fehlgeschlagen:", profileError.message);
  }

  // Kein Profilzeile → Trigger hat gefehlt; serverseitig anlegen
  if (!profileError && !profile) {
    const { error: ensureError } = await supabase.rpc("ensure_user_profile");
    if (ensureError) {
      console.warn("[Auth] ensure_user_profile:", ensureError.message);
    } else {
      const { data: retryRole } = await supabase.rpc("get_my_role");
      if (retryRole) {
        return resolveRole(String(retryRole), email);
      }
      const { data: retryProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      if (retryProfile?.role) {
        return resolveRole(retryProfile.role, email);
      }
    }
  }

  return resolveRole(null, email);
}

export function roleToLabel(role: Profile["role"] | null): string {
  if (role === "admin") return "Administrator";
  return "Mitarbeiter";
}
