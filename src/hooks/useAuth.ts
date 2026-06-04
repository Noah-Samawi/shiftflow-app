import { useState, useEffect, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../types/database";

interface UseAuthReturn {
  user: User | null;
  role: Profile["role"] | null;
  loading: boolean;
  getCurrentUser: () => Promise<User | null>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Profile["role"] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    
    if (error) {
      console.error("Failed to load profile:", error.message);
    }
    
    setRole(data?.role ?? null);
  }, []);

  const getCurrentUser = useCallback(async (): Promise<User | null> => {
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    return currentUser;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
    setRole(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Get initial session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (mounted) {
          setUser(session?.user ?? null);
          if (session?.user) {
            fetchRole(session.user.id);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRole(session.user.id);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchRole]);

  return { user, role, loading, getCurrentUser, signIn, signUp, signOut };
}
