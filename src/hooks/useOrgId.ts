import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

let cachedOrgId: string | null | undefined = undefined; // undefined = not yet loaded

/**
 * Zentraler Org-ID Hook.
 * Lädt die org_id des aktuellen Users EINMAL und cached sie.
 * Alle Data-Layer-Hooks verwenden diese Funktion.
 *
 * Cache-Regeln:
 * - undefined = noch nicht geladen (wird beim nächsten Aufruf neu abgerufen)
 * - null       = kein User / kein Profil (wird NICHT gecacht — retry möglich)
 * - uuid       = gültige org_id (gecacht bis invalidateOrgCache())
 */
export function useOrgId(): string | null {
  const [orgId, setOrgId] = useState<string | null>(
    cachedOrgId !== undefined ? cachedOrgId : null
  );

  useEffect(() => {
    if (cachedOrgId !== undefined) {
      setOrgId(cachedOrgId);
      return;
    }

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Don't cache null — user may sign in shortly
        setOrgId(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      const resolved = data?.org_id ?? null;
      // Only persist in cache if we got a real value
      if (resolved) {
        cachedOrgId = resolved;
      }
      setOrgId(resolved);
    }

    void load();
  }, []);

  return orgId;
}

/** Synchrone Cache-Invalidierung nach Logout/Login */
export function invalidateOrgCache() {
  cachedOrgId = undefined;
}

/** Asynchrone Hilfsfunktion für non-React Code */
export async function getCurrentOrgId(): Promise<string | null> {
  if (cachedOrgId !== undefined) return cachedOrgId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  const resolved = data?.org_id ?? null;
  // Only persist in cache if we got a real value
  if (resolved) {
    cachedOrgId = resolved;
  }
  return resolved;
}
