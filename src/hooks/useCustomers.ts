import { useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCurrentOrgId } from "./useOrgId";
import type { Customer } from "../types/database";

interface UseCustomersReturn {
  customers: Customer[];
  loading: boolean;
  error: string | null;
  getCustomers: () => Promise<void>;
  upsertCustomer: (data: Partial<Omit<Customer, "created_at">>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
}

/**
 * Kundenverwaltung (public.customers).
 * Nur Admins dürfen laut RLS schreiben; alle Authentifizierten können lesen.
 * ALLE Queries filtern strikt nach org_id.
 */
export function useCustomers(): UseCustomersReturn {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCustomers = useCallback(async () => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      setError("Keine Organisation gefunden.");
      setCustomers([]);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("customers")
      .select("*")
      .eq("org_id", orgId)
      .order("name");

    if (err) {
      setError(err.message);
    } else {
      setCustomers(data as Customer[]);
    }
    setLoading(false);
  }, []);

  const upsertCustomer = useCallback(
    async (data: Partial<Omit<Customer, "created_at">>) => {
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        throw new Error("Keine Organisation gefunden.");
      }

      setLoading(true);
      setError(null);

      const { id, ...restData } = data;
      let err: { message: string } | null = null;

      if (id) {
        const { error } = await supabase
          .from("customers")
          .update(restData)
          .eq("id", id)
          .eq("org_id", orgId);
        err = error;
      } else {
        const { error } = await supabase.from("customers").insert({
          color: "#E67E22",
          org_id: orgId,
          ...restData,
        });
        err = error;
      }

      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      await getCustomers();
      setLoading(false);
    },
    [getCustomers]
  );

  const deleteCustomer = useCallback(
    async (id: string) => {
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        throw new Error("Keine Organisation gefunden.");
      }

      setLoading(true);
      setError(null);
      const { error: err } = await supabase
        .from("customers")
        .delete()
        .eq("id", id)
        .eq("org_id", orgId);

      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setLoading(false);
    },
    []
  );

  return {
    customers,
    loading,
    error,
    getCustomers,
    upsertCustomer,
    deleteCustomer,
  };
}
