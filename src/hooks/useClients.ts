import { useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Client } from "../types/database";

interface UseClientsReturn {
  clients: Client[];
  loading: boolean;
  error: string | null;
  getClients: () => Promise<void>;
  upsertClient: (data: Partial<Omit<Client, "created_at">>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
}

export function useClients(): UseClientsReturn {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("clients")
      .select("*")
      .order("name");

    if (err) {
      setError(err.message);
    } else {
      setClients(data as Client[]);
    }
    setLoading(false);
  }, []);

  const upsertClient = useCallback(
    async (data: Partial<Omit<Client, "created_at">>) => {
      setLoading(true);
      setError(null);
      
      const { id, ...restData } = data;
      let error: { message: string } | null = null;

      // If id exists, UPDATE; otherwise INSERT (without id)
      if (id) {
        const { error: err } = await supabase
          .from("clients")
          .update(restData)
          .eq("id", id);
        error = err;
      } else {
        const { error: err } = await supabase
          .from("clients")
          .insert(restData);
        error = err;
      }

      if (error) {
        setError(error.message);
      } else {
        await getClients();
      }
      setLoading(false);
    },
    [getClients]
  );

  const deleteClient = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase
        .from("clients")
        .delete()
        .eq("id", id);

      if (err) {
        setError(err.message);
      } else {
        setClients((prev) => prev.filter((c) => c.id !== id));
      }
      setLoading(false);
    },
    []
  );

  return { clients, loading, error, getClients, upsertClient, deleteClient };
}
