import type { User } from "@supabase/supabase-js";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  weekly_hours: number;
  role: "admin" | "employee";
  org_id: string | null;
  created_at: string;
}

/** Kunde (public.customers) – nur vom Admin verwaltet */
export interface Customer {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  color: string;
  org_id: string | null;
  created_at: string;
}

/** @deprecated Alias für Migration – bitte Customer verwenden */
export type Client = Customer;

export type ScheduleRecurrence = "once" | "weekly" | "biweekly" | "monthly";

export interface Schedule {
  id: string;
  employee_id: string | null;
  customer_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  /** Pause in Minuten (wird von worked_minutes abgezogen; DB-Default 0) */
  break_minutes?: number;
  /** Netto-Arbeitsminuten — von der DB berechnet (generated column, read-only) */
  worked_minutes?: number;
  /** Spezifische Aufgaben für diese Schicht */
  tasks: string | null;
  /** Legacy-Feld – wird aus DB mitgelesen, bevorzugt tasks */
  instructions?: string | null;
  recurrence: ScheduleRecurrence;
  series_id: string | null;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  org_id: string | null;
  created_at: string;
  profiles?: Profile | null;
  customers?: Customer | null;
  /** @deprecated – alter Join-Name */
  clients?: Customer | null;
}

export interface Comment {
  id: string;
  schedule_id: string;
  user_id: string | null;
  message: string;
  created_at: string;
  profiles?: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export interface AuthState {
  user: User | null;
  role: Profile["role"] | null;
  loading: boolean;
}
