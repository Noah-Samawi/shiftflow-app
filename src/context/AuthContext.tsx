import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";
import type { User, AuthError, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../types/database";
import { toGermanAuthError } from "../utils/authErrors";
import { fetchUserRole, resolveRole } from "../lib/fetchUserRole";
import { invalidateOrgCache } from "../hooks/useOrgId";

// Debug Logging (nur in DEV, wird in Produktion ausgefiltert durch tree-shaking)
const addLog = import.meta.env.DEV ? console.log : () => {};

/** Events, bei denen die Rolle aus public.profiles neu geladen wird. */
const ROLE_REFRESH_EVENTS: ReadonlySet<AuthChangeEvent> = new Set([
  "INITIAL_SESSION",
  "SIGNED_IN",
  "TOKEN_REFRESHED",
  "USER_UPDATED",
]);

export interface UseAuthReturn {
  user: User | null;
  role: Profile["role"] | null;
  /** true wenn role === 'admin' (DB oder E-Mail-Fallback). */
  isAdmin: boolean;
  loading: boolean;
  roleLoading: boolean;
  getCurrentUser: () => Promise<User | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, companyName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<UseAuthReturn | null>(null);

/**
 * Zentraler Auth-Provider — ein globaler State für die ganze App.
 *
 * Warum die Admin-Rolle oft „nicht ankam“:
 * 1) Mehrere useAuth-Instanzen (behoben: nur dieser Provider).
 * 2) fetchRole() direkt in onAuthStateChange → Supabase-Deadlock, leere Antwort.
 * 3) RLS auf profiles mit is_admin() in derselben Policy → Rekursion / 0 Zeilen.
 * 4) Fehlende RPC get_my_role → Frontend las role nie zuverlässig aus.
 *
 * Lösung: Rolle über fetchUserRole() (RPC + Fallback), Events sauber behandeln.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Profile["role"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const roleFetchId = useRef(0);

  // ── Verhindert parallele Profil-Requests & doppelte Initialisierung ──
  const profileLoadingRef = useRef(false);
  const initDoneRef = useRef(false);

  const applyRole = useCallback(
    async (sessionUser: User) => {
      // Guard: Kein paralleler Load
      if (profileLoadingRef.current) {
        addLog("⚠️ [applyRole] Parallele Anfrage verhindert, überspringe");
        return;
      }
      profileLoadingRef.current = true;

      const fetchId = ++roleFetchId.current;
      addLog("👑 [applyRole] START für User: " + sessionUser.id + " fetchId: " + fetchId);
      setRoleLoading(true);

      try {
        addLog("👑 [applyRole] Rufe fetchUserRole auf...");
        const roleStart = performance.now();
        const loaded = await fetchUserRole(sessionUser.id, sessionUser.email);
        addLog("👑 [applyRole] fetchUserRole fertig (" + Math.round(performance.now() - roleStart) + "ms ) loaded=" + loaded);

        if (fetchId !== roleFetchId.current) {
          addLog("👑 [applyRole] Neuere Anfrage vorhanden, verwerfe Resultat");
          return;
        }

        setRole(loaded);
        setRoleLoading(false);

        if (import.meta.env.DEV) {
          console.info("[Auth] Rolle geladen:", {
            userId: sessionUser.id,
            email: sessionUser.email,
            role: loaded,
          });
        }
      } catch (err: any) {
        // 429 abfangen – nicht weiter versuchen
        if (
          err?.code === "429" ||
          err?.message?.includes("Too Many") ||
          err?.message?.includes("rate limit")
        ) {
          console.warn("Rate-Limit: Profil-Laden pausiert.");
          setRoleLoading(false);
          return;
        }
        addLog("❌ Profil laden: " + err?.message);
        setRoleLoading(false);
      } finally {
        profileLoadingRef.current = false;
      }
    },
    []
  );

  const refreshRole = useCallback(async () => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    if (currentUser) {
      await applyRole(currentUser);
    } else {
      setRole(null);
      setRoleLoading(false);
    }
  }, [applyRole]);

  const getCurrentUser = useCallback(async (): Promise<User | null> => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    return currentUser;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      // Invalidate org cache so new session gets a fresh org_id lookup
      invalidateOrgCache();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw toGermanAuthError(error as AuthError);

      if (data.user) {
        setUser(data.user);
        await applyRole(data.user);
      }
    },
    [applyRole]
  );

  const signUp = useCallback(async (email: string, password: string, companyName?: string) => {
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: normalizedEmail.split("@")[0] },
      },
    });

    if (error) throw toGermanAuthError(error as AuthError);

    if (data.user?.identities?.length === 0) {
      throw new Error(
        "Diese E-Mail-Adresse ist bereits registriert. Bitte melden Sie sich an."
      );
    }

    // Profil per Trigger sicherstellen – NICHT sofort applyRole.
    // Der Trigger ist asynchron; wir warten nach SIGNED_IN im Listener.
    if (data.user && data.session) {
      setUser(data.user);
      // Kleiner Defer: Supabase Trigger braucht Millisekunden
      try {
        await supabase.rpc("ensure_user_profile");
      } catch {
        // RPC ggf. noch nicht deployed – Trigger macht es dann
      }
      await new Promise((r) => setTimeout(r, 300));

      // Create organization for the new admin if companyName provided
      if (companyName?.trim()) {
        try {
          const { error: orgErr } = await supabase.rpc("signup_create_org", {
            p_company_name: companyName.trim(),
          });
          if (orgErr) {
            console.warn("[Auth] signup_create_org:", orgErr.message);
          }
        } catch (orgEx) {
          console.warn("[Auth] signup_create_org exception:", orgEx);
        }
      }

      await applyRole(data.user);
    } else if (data.user) {
      // E-Mail-Bestätigung erforderlich
      try {
        await supabase.rpc("ensure_user_profile");
      } catch {
        // RPC ggf. noch nicht deployed
      }
      setUser(null);
    }
  }, [applyRole]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw toGermanAuthError(error as AuthError);
    roleFetchId.current += 1;
    // Flush the org cache so the next login re-fetches the correct org_id
    invalidateOrgCache();
    setUser(null);
    setRole(null);
    setRoleLoading(false);
  }, []);

  useEffect(() => {
    // ── Nur EINMAL initialisieren ───────────────────────────
    if (initDoneRef.current) {
      addLog("ℹ️ [Auth] Init bereits durchgeführt, überspringe");
      return;
    }
    initDoneRef.current = true;

    addLog("🚀 [Auth] Bootstrap START");

    let cancelled = false;

    const bootstrap = async () => {
      try {
        addLog("🚀 [Auth] Rufe getSession() auf...");
        const sessionStart = performance.now();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        addLog("🚀 [Auth] getSession() fertig (" + Math.round(performance.now() - sessionStart) + "ms ) hasSession=" + (!!session) + " userId=" + session?.user?.id);

        if (cancelled) {
          addLog("🚀 [Auth] Effect wurde cancelled, abbrechen");
          return;
        }

        const sessionUser = session?.user ?? null;
        addLog("🚀 [Auth] Setze User: " + (sessionUser?.id ?? "null"));
        setUser(sessionUser);

        if (sessionUser) {
          addLog("🚀 [Auth] Rufe applyRole auf für User: " + sessionUser.id);
          await applyRole(sessionUser);
          addLog("🚀 [Auth] applyRole fertig");
        } else {
          addLog("🚀 [Auth] Kein User, setze Role auf null");
          setRole(null);
        }
      } catch (err: any) {
        // 429 sofort abfangen
        if (
          err?.message?.includes("429") ||
          err?.message?.includes("Too Many")
        ) {
          addLog("❌ [Auth] Rate-Limit beim Session-Init.");
        } else {
          addLog("❌ [Auth] Session-Init Fehler: " + err?.message);
        }
      } finally {
        addLog("🚀 [Auth] Bootstrap finally - setze loading auf false UNBEDINGT");
        // WICHTIG: setLoading(false) IMMER aufrufen, auch wenn cancelled!
        // In React StrictMode wird cleanup vor getSession() Completion aufgerufen
        setLoading(false);
        addLog("🚀 [Auth] ✅ Loading = false IMMER gesetzt");
      }
    };

    addLog("🚀 [Auth] Starte bootstrap async Funktion");
    bootstrap().catch((err) => {
      addLog("❌ [Auth] bootstrap() unbehandelt Promise Rejection: " + err);
    });

    addLog("🚀 [Auth] Registriere onAuthStateChange Listener");
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      addLog("🔔 [Auth] onAuthStateChange Event: " + event);
      if (cancelled) {
        addLog("🔔 [Auth] Effect ist cancelled, ignoriere Event");
        return;
      }

      const sessionUser = session?.user ?? null;
      addLog("🔔 [Auth] Setze User von Event: " + (sessionUser?.id ?? "null"));
      setUser(sessionUser);

      if (event === "SIGNED_OUT" || !sessionUser) {
        addLog("🔔 [Auth] SIGNED_OUT oder kein User - reset state");
        roleFetchId.current += 1;
        setRole(null);
        setRoleLoading(false);
        setLoading(false);
        return;
      }

      if (ROLE_REFRESH_EVENTS.has(event)) {
        addLog("🔔 [Auth] ROLE_REFRESH_EVENTS: " + event);
        // Diese Events KEINE neue Anfrage auslösen
        if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          addLog("🔔 [Auth] TOKEN_REFRESHED/INITIAL_SESSION - no-op, nur setLoading(false)");
          setLoading(false);
          return;
        }
        /**
         * Nicht synchron supabase.from() aufrufen — blockiert oft den Auth-Client.
         * Kurzer Defer + applyRole lädt Session + RPC get_my_role.
         */
        addLog("🔔 [Auth] Schedule applyRole mit window.setTimeout");
        window.setTimeout(() => {
          if (!cancelled) {
            addLog("🔔 [Auth] Deferred: rufe applyRole auf");
            void applyRole(sessionUser);
          }
        }, 0);
      }

      addLog("🔔 [Auth] Event fertig - setze loading false");
      setLoading(false);
    });

    return () => {
      addLog("🧹 [Auth] Cleanup: Effect wird aufgeräumt (cancelled=true)");
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applyRole]);

  const isAdmin = role === "admin";

  const value: UseAuthReturn = {
    user,
    role,
    isAdmin,
    loading,
    roleLoading,
    getCurrentUser,
    signIn,
    signUp,
    signOut,
    refreshRole,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): UseAuthReturn {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden.");
  }
  return ctx;
}

// Re-export für Komponenten, die nur die Hilfsfunktion brauchen
export { resolveRole };
