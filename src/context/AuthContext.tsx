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
  signUp: (email: string, password: string) => Promise<void>;
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
      if (profileLoadingRef.current) return;
      profileLoadingRef.current = true;

      const fetchId = ++roleFetchId.current;
      setRoleLoading(true);

      try {
        const loaded = await fetchUserRole(sessionUser.id, sessionUser.email);

        if (fetchId !== roleFetchId.current) return;

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
        console.error("Profil laden:", err?.message);
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

  const signUp = useCallback(async (email: string, password: string) => {
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
    setUser(null);
    setRole(null);
    setRoleLoading(false);
  }, []);

  useEffect(() => {
    // ── Nur EINMAL initialisieren ───────────────────────────
    if (initDoneRef.current) return;
    initDoneRef.current = true;

    let mounted = true;

    const bootstrap = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (sessionUser) {
          await applyRole(sessionUser);
        } else {
          setRole(null);
        }
      } catch (err: any) {
        // 429 sofort abfangen
        if (
          err?.message?.includes("429") ||
          err?.message?.includes("Too Many")
        ) {
          console.warn("Rate-Limit beim Session-Init.");
        } else {
          console.error("Session-Init:", err?.message);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (event === "SIGNED_OUT" || !sessionUser) {
        roleFetchId.current += 1;
        setRole(null);
        setRoleLoading(false);
        setLoading(false);
        return;
      }

      if (ROLE_REFRESH_EVENTS.has(event)) {
        // Diese Events KEINE neue Anfrage auslösen
        if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
          return;
        }
        /**
         * Nicht synchron supabase.from() aufrufen — blockiert oft den Auth-Client.
         * Kurzer Defer + applyRole lädt Session + RPC get_my_role.
         */
        window.setTimeout(() => {
          if (mounted) void applyRole(sessionUser);
        }, 0);
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
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
