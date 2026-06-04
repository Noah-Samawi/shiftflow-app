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

export interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  color: string;
  created_at: string;
}

export interface Schedule {
  id: string;
  employee_id: string | null;
  client_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  instructions: string | null;
  status: "scheduled" | "confirmed" | "completed" | "cancelled";
  created_at: string;
  // Joined fields
  profiles?: Profile | null;
  clients?: Client | null;
}

export interface Comment {
  id: string;
  schedule_id: string;
  user_id: string | null;
  message: string;
  created_at: string;
  // Joined fields
  profiles?: Pick<Profile, "id" | "full_name" | "avatar_url"> | null;
}

export interface AuthState {
  user: User | null;
  role: Profile["role"] | null;
  loading: boolean;
}
