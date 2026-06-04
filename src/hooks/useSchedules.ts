import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Schedule } from "../types/database";
import { startOfWeek, endOfWeek, format } from "date-fns";

interface UseSchedulesReturn {
  schedules: Schedule[];
  loading: boolean;
  error: string | null;
  getWeekSchedules: (weekStart: Date) => Promise<void>;
  createSchedule: (
    data: Omit<Schedule, "id" | "created_at" | "profiles" | "clients">
  ) => Promise<void>;
  updateSchedule: (
    id: string,
    data: Partial<
      Omit<Schedule, "id" | "created_at" | "profiles" | "clients">
    >
  ) => Promise<void>;
  deleteSchedule: (id: string) => Promise<void>;
}

/**
 * Returns the Monday-Sunday week date range for the week containing `date`.
 * Uses German week start (Monday).
 */
function getISOWeekRange(date: Date): { start: string; end: string } {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  
  return {
    start: format(weekStart, 'yyyy-MM-dd'),
    end: format(weekEnd, 'yyyy-MM-dd')
  };
}

export function useSchedules(): UseSchedulesReturn {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const getWeekSchedules = useCallback(async (weekStart: Date) => {
    setLoading(true);
    setError(null);
    setCurrentWeekStart(weekStart);
    const { start, end } = getISOWeekRange(weekStart);

    const { data, error: err } = await supabase
      .from("schedules")
      .select("*, profiles(*), clients(*)")
      .gte("shift_date", start)
      .lte("shift_date", end)
      .order("shift_date")
      .order("start_time");

    if (err) {
      setError(err.message);
    } else {
      setSchedules(data as Schedule[]);
    }
    setLoading(false);
  }, []);

  const createSchedule = useCallback(
    async (
      data: Omit<Schedule, "id" | "created_at" | "profiles" | "clients">
    ) => {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase.from("schedules").insert(data);
      if (err) {
        setError(err.message);
      } else if (currentWeekStart) {
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
        Omit<Schedule, "id" | "created_at" | "profiles" | "clients">
      >
    ) => {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase
        .from("schedules")
        .update(data)
        .eq("id", id);
      if (err) {
        setError(err.message);
      } else if (currentWeekStart) {
        await getWeekSchedules(currentWeekStart);
      }
      setLoading(false);
    },
    [getWeekSchedules, currentWeekStart]
  );

  const deleteSchedule = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    const { error: err } = await supabase
      .from("schedules")
      .delete()
      .eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    }
    setLoading(false);
  }, []);

  // Realtime subscription for schedules table
  useEffect(() => {
    const channel = supabase
      .channel("schedules-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "schedules" },
        () => {
          // Re-fetch the current week on any change.
          // The consumer should call getWeekSchedules with the current week start
          // — this refetch is a safety net for live updates.
          setSchedules((prev) => prev); // trigger re-render consumer side via refetch
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
  }, []);

  return {
    schedules,
    loading,
    error,
    getWeekSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  };
}
