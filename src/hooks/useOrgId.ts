import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

let cachedOrgId: string | null = null;

/**
 * Zentraler Org-ID Hook.
 * Lädt die org_id des aktuellen Users EINMAL und cached sie.
 * Alle Data-Layer-Hooks verwenden diese Funktion.
 */
export function useOrgId(): string | null {
  const [orgId, setOrgId] = useState<string | null>(cachedOrgId);

  useEffect(() => {
    if (cachedOrgId) {
      setOrgId(cachedOrgId);
      return;
    }

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        cachedOrgId = null;
        setOrgId(null);
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();

      cachedOrgId = data?.org_id ?? null;
      setOrgId(cachedOrgId);
    }

    void load();
  }, []);

  return orgId;
}

/** Synchrone Cache-Invalidierung nach Logout/Login */
export function invalidateOrgCache() {
  cachedOrgId = null;
}

/** Asynchrone Hilfsfunktion für non-React Code */
export async function getCurrentOrgId(): Promise<string | null> {
  if (cachedOrgId) return cachedOrgId;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  cachedOrgId = data?.org_id ?? null;
  return cachedOrgId;
}
