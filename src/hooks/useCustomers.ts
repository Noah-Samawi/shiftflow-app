import { useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
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
 */
export function useCustomers(): UseCustomersReturn {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("customers")
      .select("*")
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
      setLoading(true);
      setError(null);

      const { id, ...restData } = data;
      let err: { message: string } | null = null;

      if (id) {
        const { error } = await supabase
          .from("customers")
          .update(restData)
          .eq("id", id);
        err = error;
      } else {
        const { error } = await supabase.from("customers").insert({
          color: "#E67E22",
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
      setLoading(true);
      setError(null);
      const { error: err } = await supabase
        .from("customers")
        .delete()
        .eq("id", id);

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
