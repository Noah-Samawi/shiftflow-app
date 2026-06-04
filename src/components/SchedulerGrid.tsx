import { useEffect, useMemo, useState, useCallback } from "react";
import { useSchedules } from "../hooks/useSchedules";
import { useClients } from "../hooks/useClients";
import { useAuth } from "../hooks/useAuth";
import type { Schedule, Client } from "../types/database";
import ShiftCard from "./ShiftCard";
import AddShiftModal from "./AddShiftModal";
import ShiftDrawer from "./ShiftDrawer";
import { getGermanHolidays, getHolidayForDate } from "../utils/germanHolidays";

const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

interface SchedulerGridProps {
  weekStart: Date;
}

export default function SchedulerGrid({ weekStart }: SchedulerGridProps) {
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const { schedules, loading, error, getWeekSchedules, createSchedule, updateSchedule, deleteSchedule } = useSchedules();
  const { clients, getClients } = useClients();

  // State for modal & drawer
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCell, setModalCell] = useState<{ clientId: string; clientName: string; date: string } | null>(null);
  const [drawerSchedule, setDrawerSchedule] = useState<Schedule | null>(null);

  // Berechne Feiertage dynamisch basierend auf dem angezeigten Jahr
  const currentYear = weekStart.getFullYear();
  const holidays = useMemo(
    () => getGermanHolidays(currentYear),
    [currentYear]
  );

  // Fetch data
  useEffect(() => {
    getWeekSchedules(weekStart);
    getClients();
  }, [weekStart, getWeekSchedules, getClients]);

  // Compute the 7 day strings for the current week
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d.toISOString().slice(0, 10);
      }),
    [weekStart]
  );

  // Prüfe ob ein Datum heute ist
  const checkIsToday = useCallback((dateStr: string) => {
    const today = new Date();
    const date = new Date(dateStr + "T00:00:00");
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }, []);

  // Extract unique clients that have schedules this week, plus all clients for the sidebar
  const gridClients = useMemo(() => {
    // Use all clients for the row list (so admins can add shifts to any client)
    return clients;
  }, [clients]);

  // Build a lookup: schedulesMap[clientId][date] = Schedule[]
  const schedulesMap = useMemo(() => {
    const map: Record<string, Record<string, Schedule[]>> = {};
    for (const c of clients) {
      map[c.id] = {};
      for (const day of weekDays) {
        map[c.id][day] = [];
      }
    }
    for (const s of schedules) {
      if (map[s.client_id]?.[s.shift_date]) {
        map[s.client_id][s.shift_date].push(s);
      }
    }
    return map;
  }, [schedules, clients, weekDays]);



  const handleCellAdd = useCallback(
    (client: Client, date: string) => {
      if (!isAdmin) return;
      setModalCell({ clientId: client.id, clientName: client.name, date });
      setModalOpen(true);
    },
    [isAdmin]
  );

  const handleShiftClick = useCallback((schedule: Schedule) => {
    setDrawerSchedule(schedule);
  }, []);

  const handleCreateSchedule = async (
    data: Omit<Schedule, "id" | "created_at" | "profiles" | "clients">
  ) => {
    await createSchedule(data);
    // Refresh after creation
    getWeekSchedules(weekStart);
  };

  const handleUpdateSchedule = async (
    id: string,
    data: Partial<Omit<Schedule, "id" | "created_at" | "profiles" | "clients">>
  ) => {
    await updateSchedule(id, data);
    getWeekSchedules(weekStart);
    // Refresh the drawer
    const updated = schedules.find((s) => s.id === id);
    if (updated) {
      setDrawerSchedule({ ...updated, ...data } as Schedule);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    await deleteSchedule(id);
    getWeekSchedules(weekStart);
  };

  return (
    <div className="scheduler-grid-wrap">
      {loading && schedules.length === 0 && (
        <div className="status-msg">Schichten werden geladen…</div>
      )}
      {error && <div className="status-msg error">{error}</div>}

      <div className="scheduler-grid-container">
        <table className="scheduler-grid">
          <thead>
            <tr>
              <th className="sg-corner-cell">Client</th>
              {weekDays.map((day, i) => {
                const holiday = getHolidayForDate(day, holidays);
                const dayIsToday = checkIsToday(day);
                return (
                  <th
                    key={day}
                    className={`sg-day-header ${dayIsToday ? "sg-day-header--today" : ""} ${holiday ? "sg-day-header--holiday" : ""}`}
                  >
                    <div className="sg-day-content">
                      <span className="sg-day-label">{WEEKDAYS_DE[i]}</span>
                      <span className="sg-day-number">
                        {new Date(day + "T12:00:00").getDate()}
                      </span>
                      {holiday && (
                        <span className="sg-holiday-badge">
                          {holiday.shortName}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {gridClients.map((client) => (
              <tr key={client.id}>
                <td className="sg-client-cell">
                  <span
                    className="sg-client-dot"
                    style={{ backgroundColor: client.color }}
                  />
                  <span className="sg-client-name">{client.name}</span>
                </td>
                {weekDays.map((day) => {
                  const holiday = getHolidayForDate(day, holidays);
                  const dayIsToday = checkIsToday(day);
                  const daySchedules = schedulesMap[client.id]?.[day] || [];
                  const hasSchedules = daySchedules.length > 0;
                  
                  return (
                    <td
                      key={day}
                      className={`sg-cell ${dayIsToday ? "sg-cell--today" : ""} ${holiday ? "sg-cell--holiday" : ""}`}
                      onClick={() => !hasSchedules && handleCellAdd(client, day)}
                    >
                      <div className="sg-cell-content">
                        {daySchedules.map((s) => (
                          <ShiftCard
                            key={s.id}
                            schedule={s}
                            onClick={handleShiftClick}
                          />
                        ))}
                        {isAdmin && !hasSchedules && !holiday && (
                          <button
                            className="sg-add-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCellAdd(client, day);
                            }}
                            title="Schicht hinzufügen"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <line x1="7" y1="2" x2="7" y2="12" />
                              <line x1="2" y1="7" x2="12" y2="7" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {gridClients.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="sg-empty-state">
                  Keine Kunden gefunden. Legen Sie zuerst Kunden an, um die Schichtplanung zu starten.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Shift Modal */}
      {modalCell && (
        <AddShiftModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setModalCell(null);
          }}
          onSave={handleCreateSchedule}
          clientId={modalCell.clientId}
          clientName={modalCell.clientName}
          date={modalCell.date}
        />
      )}

      {/* Shift Details Drawer */}
      <ShiftDrawer
        schedule={drawerSchedule}
        onClose={() => setDrawerSchedule(null)}
        onUpdate={handleUpdateSchedule}
        onDelete={handleDeleteSchedule}
        isAdmin={isAdmin}
      />
    </div>
  );
}
