import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { getCurrentOrgId } from "./useOrgId";
import type { Schedule, ScheduleRecurrence } from "../types/database";
import { startOfWeek, endOfWeek, format, addDays } from "date-fns";

interface UseSchedulesReturn {
  schedules: Schedule[];
  loading: boolean;
  error: string | null;
  getWeekSchedules: (weekStart: Date) => Promise<void>;
  createSchedule: (
    data: Omit<Schedule, "id" | "created_at" | "profiles" | "customers" | "clients" | "series_id">
  ) => Promise<void>;
  createScheduleWithRecurrence: (input: {
    employee_id: string | null;
    customer_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    tasks: string | null;
    recurrence: ScheduleRecurrence;
    status?: Schedule["status"];
    occurrences?: number;
    break_minutes?: number;
  }) => Promise<void>;
  updateSchedule: (
    id: string,
    data: Partial<
      Omit<Schedule, "id" | "created_at" | "profiles" | "customers" | "clients">
    >
  ) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
}

/** Normalisiert Supabase-Joins (Array → Objekt) und tasks/instructions */
function normalizeSchedule(row: Record<string, unknown>): Schedule {
  const profiles = Array.isArray(row.profiles)
    ? row.profiles[0]
    : row.profiles;
  const customers = Array.isArray(row.customers)
    ? row.customers[0]
    : row.customers ?? (Array.isArray(row.clients) ? row.clients[0] : row.clients);

  const tasks =
    (row.tasks as string | null) ??
    (row.instructions as string | null) ??
    null;

  return {
    ...(row as unknown as Schedule),
    tasks,
    recurrence: (row.recurrence as ScheduleRecurrence) ?? "once",
    series_id: (row.series_id as string | null) ?? null,
    profiles: profiles as Schedule["profiles"],
    customers: customers as Schedule["customers"],
    clients: customers as Schedule["clients"],
  };
}

function getISOWeekRange(date: Date): { start: string; end: string } {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });

  return {
    start: format(weekStart, "yyyy-MM-dd"),
    end: format(weekEnd, "yyyy-MM-dd"),
  };
}

const SCHEDULE_SELECT = `
  *,
  profiles ( id, full_name, phone, role, avatar_url ),
  customers ( id, name, color, phone, address, notes )
`;

export function useSchedules(): UseSchedulesReturn {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const fetchGeneration = useRef(0);

  const getWeekSchedules = useCallback(async (weekStart: Date) => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      setError("Keine Organisation gefunden.");
      setSchedules([]);
      setLoading(false);
      return;
    }

    const gen = ++fetchGeneration.current;
    setLoading(true);
    setError(null);
    setCurrentWeekStart(weekStart);
    const { start, end } = getISOWeekRange(weekStart);

    const { data, error: err } = await supabase
      .from("schedules")
      .select(SCHEDULE_SELECT)
      .eq("org_id", orgId)
      .gte("shift_date", start)
      .lte("shift_date", end)
      .order("shift_date")
      .order("start_time");

    if (gen !== fetchGeneration.current) return;

    if (err) {
      setError(err.message);
      setSchedules([]);
    } else {
      setSchedules((data ?? []).map((row) => normalizeSchedule(row as Record<string, unknown>)));
    }
    setLoading(false);
  }, []);

  const createSchedule = useCallback(
    async (
      data: Omit<Schedule, "id" | "created_at" | "profiles" | "customers" | "clients" | "series_id">
    ) => {
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        throw new Error("Keine Organisation gefunden.");
      }

      setLoading(true);
      setError(null);
      const payload = {
        ...data,
        org_id: orgId,
        instructions: data.tasks,
        recurrence: data.recurrence ?? "once",
      };
      const { error: err } = await supabase.from("schedules").insert(payload);
      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      if (currentWeekStart) {
        await getWeekSchedules(currentWeekStart);
      }
      setLoading(false);
    },
    [getWeekSchedules, currentWeekStart]
  );

  /** Atomare Serienanlage per RPC (keine Race Conditions bei Wiederholungen) */
  const createScheduleWithRecurrence = useCallback(
    async (input: {
      employee_id: string | null;
      customer_id: string;
      shift_date: string;
      start_time: string;
      end_time: string;
      tasks: string | null;
      recurrence: ScheduleRecurrence;
      status?: Schedule["status"];
      occurrences?: number;
      break_minutes?: number;
    }) => {
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        throw new Error("Keine Organisation gefunden.");
      }

      setLoading(true);
      setError(null);

      const { error: err } = await supabase.rpc("create_schedules_with_recurrence", {
        p_employee_id: input.employee_id,
        p_customer_id: input.customer_id,
        p_shift_date: input.shift_date,
        p_start_time: input.start_time,
        p_end_time: input.end_time,
        p_tasks: input.tasks,
        p_recurrence: input.recurrence,
        p_status: input.status ?? "scheduled",
        p_occurrences: input.occurrences ?? 12,
        p_org_id: orgId,
        p_break_minutes: input.break_minutes ?? 0,
      });

      if (err) {
        setError(err.message);
        setLoading(false);
        throw new Error(err.message);
      }

      if (currentWeekStart) {
        await getWeekSchedules(currentWeekStart);
      }
      setLoading(false);
    },
    [getWeekSchedules, currentWeekStart]
  );

  const updateSchedule = useCallback(
    async (
      id: string,
      data: Partial<
        Omit<Schedule, "id" | "created_at" | "profiles" | "customers" | "clients">
      >
    ) => {
      const orgId = await getCurrentOrgId();
      if (!orgId) {
        throw new Error("Keine Organisation gefunden.");
      }

      setLoading(true);
      setError(null);
      const payload = {
        ...data,
        ...(data.tasks !== undefined
          ? { instructions: data.tasks }
          : {}),
      };
      const { error: err } = await supabase
        .from("schedules")
        .update(payload)
        .eq("id", id)
        .eq("org_id", orgId);
      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      if (currentWeekStart) {
        await getWeekSchedules(currentWeekStart);
      }
      setLoading(false);
    },
    [getWeekSchedules, currentWeekStart]
  );

  const deleteSchedule = useCallback(async (id: string) => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      throw new Error("Keine Organisation gefunden.");
    }

    setLoading(true);
    setError(null);
    const { error: err } = await supabase
      .from("schedules")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);
    if (err) {
      setError(err.message);
      throw new Error(err.message);
    }
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    setLoading(false);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("schedules-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => {
          if (currentWeekStart) {
            void getWeekSchedules(currentWeekStart);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentWeekStart, getWeekSchedules]);

  return {
    schedules,
    loading,
    error,
    getWeekSchedules,
    createSchedule,
    createScheduleWithRecurrence,
    updateSchedule,
    deleteSchedule,
  };
}

/** Hilfsfunktion: Datum-Spanne für Kalenderansicht */
export function getCalendarDateRange(
  rangeStart: Date,
  rangeEnd: Date
): { start: string; end: string } {
  return {
    start: format(rangeStart, "yyyy-MM-dd"),
    end: format(rangeEnd, "yyyy-MM-dd"),
  };
}

/** Fallback: Serientermine clientseitig (nur wenn RPC noch nicht migriert) */
export function buildRecurrenceDates(
  startDate: string,
  recurrence: ScheduleRecurrence,
  count = 12
): string[] {
  if (recurrence === "once") return [startDate];
  const step = recurrence === "weekly" ? 7 : 14;
  const base = new Date(startDate + "T12:00:00");
  return Array.from({ length: count }, (_, i) =>
    format(addDays(base, i * step), "yyyy-MM-dd")
  );
}
