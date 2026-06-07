/**
 * @deprecated Bitte useCustomers verwenden (Tabelle public.customers).
 * Wrapper für bestehende Importe bis alle Komponenten migriert sind.
 */
import { useCustomers } from "./useCustomers";
import type { Customer } from "../types/database";

export function useClients() {
  const hook = useCustomers();
  return {
    clients: hook.customers as Customer[],
    loading: hook.loading,
    error: hook.error,
    getClients: hook.getCustomers,
    upsertClient: hook.upsertCustomer,
    deleteClient: hook.deleteCustomer,
  };
}
