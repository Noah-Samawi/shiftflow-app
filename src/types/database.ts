import type { User } from "@supabase/supabase-js";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  avatar_url: string | null;
  weekly_hours: number;
  role: "admin" | "employee";
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
  created_at: string;
}

/** @deprecated Alias für Migration – bitte Customer verwenden */
export type Client = Customer;

export type ScheduleRecurrence = "once" | "daily_workdays" | "daily_all" | "weekly" | "biweekly";

export interface Schedule {
  id: string;
  employee_id: string | null;
  customer_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  /** Spezifische Aufgaben für diese Schicht */
  tasks: string | null;
  /** Legacy-Feld – wird aus DB mitgelesen, bevorzugt tasks */
  instructions?: string | null;
  recurrence: ScheduleRecurrence;
  series_id: string | null;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
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
