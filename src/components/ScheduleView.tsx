import { useEffect, useMemo } from "react";
import { useSchedules } from "../hooks/useSchedules";
import { useAuth } from "../hooks/useAuth";
import { formatTimeRange24 } from "../utils/formatTime";
import type { Schedule } from "../types/database";

/** Returns the Monday of the current week. */
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

const DAY_NAMES = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const STATUS_COLORS: Record<Schedule["status"], string> = {
  scheduled: "#F59E0B",
  confirmed: "#10B981",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

export default function ScheduleView() {
  const { user, role, signOut } = useAuth();
  const { schedules, loading, error, getWeekSchedules } = useSchedules();

  const monday = useMemo(() => getMonday(new Date()), []);

  useEffect(() => {
    getWeekSchedules(monday);
  }, [monday, getWeekSchedules]);

  // Group schedules by day of week
  const byDay = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      map[key] = [];
    }
    for (const s of schedules) {
      if (map[s.shift_date]) {
        map[s.shift_date].push(s);
      }
    }
    return map;
  }, [schedules, monday]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [monday]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.getDate();
  };

  return (
    <div className="schedule-view">
      {/* Header */}
      <header className="schedule-header">
        <div className="header-left">
          <h1>Wochenplan</h1>
          <span className="week-range">
            {monday.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}{" "}
            –{" "}
            {new Date(
              monday.getTime() + 6 * 86400000
            ).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
        <div className="header-right">
          <span className="user-badge">
            {role === "admin" ? "Admin" : "Employee"}
          </span>
          <span className="user-email">{user?.email}</span>
          <button className="btn-logout" onClick={signOut}>
          Abmelden
          </button>
        </div>
      </header>

      {/* Loading / Error */}
      {loading && <div className="status-msg">Schichten werden geladen…</div>}
      {error && <div className="status-msg error">{error}</div>}

      {/* Calendar Grid */}
      <div className="calendar-grid">
        {weekDays.map((day, i) => (
          <div key={day} className="calendar-day">
            <div className="day-header">
              <span className="day-name">{DAY_NAMES[i]}</span>
              <span className="day-number">{formatDate(day)}</span>
            </div>
            <div className="day-shifts">
              {byDay[day]?.length === 0 && (
                <div className="no-shifts">Keine Schichten</div>
              )}
              {byDay[day]?.map((s) => (
                <div
                  key={s.id}
                  className="shift-card"
                  style={{
                    borderLeftColor:
                      s.customers?.color ??
                        s.clients?.color ??
                        STATUS_COLORS[s.status],
                  }}
                >
                  <div className="shift-time">
                    {formatTimeRange24(s.start_time, s.end_time)}
                  </div>
                  <div className="shift-client">
                    {s.customers?.name ?? s.clients?.name ?? "Unbekannter Kunde"}
                  </div>
                  <div className="shift-employee">
                    {s.profiles?.full_name || "Nicht zugewiesen"}
                  </div>
                  <span
                    className="shift-status"
                    style={{ color: STATUS_COLORS[s.status] }}
                  >
                    {s.status === 'scheduled' ? 'Geplant' : 
                     s.status === 'confirmed' ? 'Bestätigt' : 
                     s.status === 'completed' ? 'Abgeschlossen' : 
                     s.status === 'cancelled' ? 'Storniert' : s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
