import { useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../types/database";

interface CreateEmployeeInput {
  email: string;
  full_name: string;
  phone?: string | null;
  address?: string | null;
  weekly_hours?: number;
}

interface UseProfilesReturn {
  profiles: Profile[];
  loading: boolean;
  error: string | null;
  getProfiles: () => Promise<void>;
  /** Admin: Mitarbeiter per E-Mail in auth.users + public.profiles anlegen */
  createEmployeeByEmail: (input: CreateEmployeeInput) => Promise<string>;
  insertProfile: (data: Omit<Profile, "id" | "created_at">) => Promise<void>;
  updateProfile: (
    id: string,
    data: Partial<Omit<Profile, "id" | "created_at">>
  ) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .order("full_name");

    if (err) {
      setError(err.message);
    } else {
      setProfiles(data as Profile[]);
    }
    setLoading(false);
  }, []);

  const createEmployeeByEmail = useCallback(
    async (input: CreateEmployeeInput) => {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase.rpc("admin_create_employee", {
        p_email: input.email.trim().toLowerCase(),
        p_full_name: input.full_name.trim(),
        p_phone: input.phone ?? null,
        p_address: input.address ?? null,
        p_weekly_hours: input.weekly_hours ?? 40,
      });

      if (err) {
        setError(err.message);
        setLoading(false);
        throw new Error(err.message);
      }

      await getProfiles();
      setLoading(false);
      return data as string;
    },
    [getProfiles]
  );

  const insertProfile = useCallback(
    async (data: Omit<Profile, "id" | "created_at">) => {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase.from("profiles").insert(data);
      if (err) {
        setError(err.message);
      } else {
        await getProfiles();
      }
      setLoading(false);
    },
    [getProfiles]
  );

  const updateProfile = useCallback(
    async (
      id: string,
      data: Partial<Omit<Profile, "id" | "created_at">>
    ) => {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase
        .from("profiles")
        .update(data)
        .eq("id", id);

      if (err) {
        setError(err.message);
      } else {
        await getProfiles();
      }
      setLoading(false);
    },
    [getProfiles]
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase
        .from("profiles")
        .delete()
        .eq("id", id);

      if (err) {
        setError(err.message);
      } else {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
      }
      setLoading(false);
    },
    []
  );

  return {
    profiles,
    loading,
    error,
    getProfiles,
    createEmployeeByEmail,
    insertProfile,
    updateProfile,
    deleteProfile,
  };
}
