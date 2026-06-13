import {
  useState, useEffect, useMemo, useCallback, useRef
} from 'react';
import {
  format, startOfWeek, endOfWeek, startOfMonth,
  endOfMonth, eachDayOfInterval, addWeeks,
  subWeeks, addMonths, subMonths, isToday,
  isSameMonth, getISOWeek, addDays, subDays
} from 'date-fns';
import { de } from 'date-fns/locale';
import toast from "react-hot-toast";
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/useAuth';
import { useProfiles } from '../../hooks/useProfiles';
import { formatTimeRange24 } from '../../utils/formatTime';
import {
  getGermanHolidays,
  getHolidayForDate,
  type GermanHoliday
} from '../../utils/germanHolidays';
import ShiftDrawer, { type ShiftDrawerMode } from '../ShiftDrawer';
import ShiftWhatsAppReportButton from './ShiftWhatsAppReportButton';
import { getCurrentOrgId } from '../../hooks/useOrgId';
import { isWeekend } from '../../utils/calendarHelpers';
import type { Schedule, ScheduleRecurrence } from '../../types/database';

type ViewMode = 'tag' | 'woche' | 'zwei_wochen' | 'monat' | 'jahr';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const MONTHS_DE = [
  'Januar','Februar','März','April','Mai','Juni',
  'Juli','August','September','Oktober','November','Dezember'
];

const STATUS_COLORS: Record<string, string> = {
  scheduled:  'bg-blue-100  text-blue-800  border-blue-200',
  confirmed:  'bg-green-100 text-green-800 border-green-200',
  completed:  'bg-gray-100  text-gray-600  border-gray-200',
  cancelled:  'bg-red-100   text-red-600   border-red-200  line-through',
};

/** Wenn kein Mitarbeiter zugewiesen → Warnfarbe (Orange), sonst Statusfarbe */
function getShiftCardClass(s: Schedule): string {
  const hasEmployee = Boolean(
    s.employee_id && s.profiles?.full_name
  );
  if (!hasEmployee) {
    return 'bg-orange-50 border-orange-300 text-orange-900';
  }
  return STATUS_COLORS[s.status] ?? STATUS_COLORS.scheduled;
}

const recurrenceLabel: Record<string, string> = {
  once: 'Einmalig',
  weekly: 'Wöchentlich',
  biweekly: '2-wöchig',
  monthly: 'Monatlich',
};

/** Supabase-Join: verschachtelte profiles/customers normalisieren */
function normalizeScheduleRow(row: Record<string, unknown>): Schedule {
  const profiles = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
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
    recurrence: (row.recurrence as ScheduleRecurrence) ?? 'once',
    series_id: (row.series_id as string | null) ?? null,
    profiles: profiles as Schedule['profiles'],
    customers: customers as Schedule['customers'],
    clients: customers as Schedule['clients'],
  };
}

const SCHEDULE_SELECT = `
  id, shift_date, start_time, end_time,
  tasks, instructions, status, employee_id, customer_id,
  recurrence, series_id,
  profiles ( id, full_name, phone, avatar_url, role ),
  customers ( id, name, color, address, phone )
`;

function ShiftCard({
  schedule,
  onClick,
  onDoubleClick,
  showWhatsApp,
}: {
  schedule: Schedule;
  onClick: (s: Schedule) => void;
  onDoubleClick?: (s: Schedule) => void;
  showWhatsApp: boolean;
}) {
  const customer = schedule.customers ?? schedule.clients;

  return (
    <div className="shift-card-row">
      <button
        type="button"
        onClick={() => onClick(schedule)}
        onDoubleClick={() => onDoubleClick?.(schedule)}
        className="
          shift-card-btn w-full text-left px-2 py-1.5 rounded-lg
          border-l-4 text-xs font-medium mb-1
          bg-white shadow-sm hover:shadow-md
          transition-all cursor-pointer
        "
        style={{ borderLeftColor: customer?.color ?? '#3B82F6' }}
      >
        <p className="font-bold text-gray-800 text-xs">
          {schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}
        </p>
        <p className="text-gray-600 truncate">
          {schedule.profiles?.full_name?.split(' ')[0] ?? '—'}
        </p>
        <p className="text-gray-400 truncate text-xs">
          {customer?.name}
        </p>
        {schedule.recurrence !== 'once' && (
          <span className="
            inline-block mt-0.5 px-1 py-0.5 rounded text-xs
            bg-blue-50 text-blue-600
          ">
            {recurrenceLabel[schedule.recurrence]}
          </span>
        )}
      </button>
      {showWhatsApp && (
        <ShiftWhatsAppReportButton schedule={schedule} variant="icon" />
      )}
    </div>
  );
}

function DayCell({
  date,
  schedules,
  holiday,
  isCurrentMonth,
  onAddShift,
  onShiftClick,
  onShiftDoubleClick,
  isAdmin,
}: {
  date: Date;
  schedules: Schedule[];
  holiday: GermanHoliday | null;
  isCurrentMonth: boolean;
  onAddShift: (date: Date) => void;
  onShiftClick: (s: Schedule) => void;
  onShiftDoubleClick?: (s: Schedule) => void;
  isAdmin: boolean;
}) {
  const today = isToday(date);
  const dateStr = format(date, 'd');
  const dimmed = !isCurrentMonth;
  const weekend = isWeekend(date);

  return (
    <div
      className={`
        calendar-day min-h-[140px] min-w-0 p-2 border-b border-r border-gray-100
        flex flex-col gap-1 group transition-colors relative
        ${dimmed ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50/70'}
        ${weekend ? 'calendar-day--weekend' : ''}
      `}
    >
      <div className="flex items-start justify-between mb-1">
        <span
          className={`
            w-7 h-7 flex items-center justify-center
            rounded-full text-sm font-semibold select-none
            ${today
              ? 'bg-red-500 text-white shadow-sm'
              : dimmed
                ? 'text-gray-300'
                : 'text-gray-800 hover:bg-gray-100'
            }
          `}
        >
          {dateStr}
        </span>

        {isAdmin && !dimmed && (
          <button
            type="button"
            onClick={() => onAddShift(date)}
            className="
              opacity-0 group-hover:opacity-100 transition-opacity
              w-5 h-5 rounded-full bg-blue-500 text-white
              flex items-center justify-center text-xs
              hover:bg-blue-600 shrink-0
            "
            title="Schicht hinzufügen"
          >
            +
          </button>
        )}
      </div>

      {holiday && (
        <div className="absolute top-1 right-1 z-10">
          <span className="
            inline-flex items-center gap-1 px-1.5 py-0.5
            bg-purple-600 text-white text-[10px] font-medium
            rounded-full truncate max-w-[90px]
          ">
            {holiday.shortName}
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto max-h-[220px] flex flex-col gap-0.5">
        {schedules.map(s => (
          <ShiftCard
            key={s.id}
            schedule={s}
            onClick={onShiftClick}
            onDoubleClick={onShiftDoubleClick}
            showWhatsApp={isAdmin}
          />
        ))}
      </div>
    </div>
  );
}

/** Kompakte Schichtliste für die Tagesansicht */
function DayViewList({
  date,
  schedules,
  holiday,
  isAdmin,
  loading,
  onAddShift,
  onShiftClick,
}: {
  date: Date;
  schedules: Schedule[];
  holiday: GermanHoliday | null;
  isAdmin: boolean;
  loading: boolean;
  onAddShift: (date: Date) => void;
  onShiftClick: (s: Schedule) => void;
}) {
  const weekend = isWeekend(date);
  const dateLabel = format(date, 'EEEE, d. MMMM yyyy', { locale: de });

  return (
    <div className={`day-view${weekend ? ' day-view--weekend' : ''}`}>
      <div className="day-view__header">
        <div>
          <h3 className="day-view__title">{dateLabel}</h3>
          {holiday && (
            <span className="day-view__holiday">{holiday.shortName}</span>
          )}
          {weekend && <span className="day-view__weekend-badge">Wochenende</span>}
        </div>
        {isAdmin && (
          <button
            type="button"
            className="btn-primary btn-primary--sm"
            onClick={() => onAddShift(date)}
          >
            + Schicht hinzufügen
          </button>
        )}
      </div>

      {loading && schedules.length === 0 ? (
        <div className="day-view__empty">Schichten werden geladen…</div>
      ) : schedules.length === 0 ? (
        <div className="day-view__empty">Keine Schichten an diesem Tag.</div>
      ) : (
        <ul className="day-view__list">
          {schedules.map((s) => {
            const customer = s.customers ?? s.clients;
            const colorClass = getShiftCardClass(s);
            return (
              <li key={s.id} className="day-view__item">
                <button
                  type="button"
                  className={`day-view__card ${colorClass}`}
                  onClick={() => onShiftClick(s)}
                >
                  <div className="day-view__card-time">
                    {formatTimeRange24(s.start_time, s.end_time)}
                  </div>
                  <div className="day-view__card-meta">
                    <span>{s.profiles?.full_name ?? 'Nicht zugewiesen'}</span>
                    <span className="day-view__card-dot" style={{ background: customer?.color ?? '#94a3b8' }} />
                    <span>{customer?.name ?? '—'}</span>
                  </div>
                  {(s.tasks || s.instructions) && (
                    <p className="day-view__card-tasks">
                      {s.tasks || s.instructions}
                    </p>
                  )}
                </button>
                {isAdmin && (
                  <ShiftWhatsAppReportButton schedule={s} variant="icon" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function SchedulerCalendar() {
  const { user, isAdmin } = useAuth();
  const profileId = user?.id;
  const { profiles, loading: profilesLoading, getProfiles } = useProfiles();

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (window.innerWidth < 768 ? 'woche' : 'monat')
  );
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);

  /** Admin-Filter: null = alle Schichten, sonst nur dieser Mitarbeiter */
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<ShiftDrawerMode>('view');
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [createDate, setCreateDate] = useState<string | null>(null);

  const fetchGeneration = useRef(0);

  // Admin: Mitarbeiterliste für linke Spalte (role = employee)
  const activeEmployees = useMemo(
    () => profiles.filter((p) => p.role === 'employee'),
    [profiles]
  );

  useEffect(() => {
    if (isAdmin) {
      void getProfiles();
    }
  }, [isAdmin, getProfiles]);

  const { rangeStart, rangeEnd, displayDays } = useMemo(() => {
    let start: Date, end: Date;

    if (viewMode === 'tag') {
      start = currentDate;
      end = currentDate;
    } else if (viewMode === 'woche') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end = endOfWeek(currentDate, { weekStartsOn: 1 });
    } else if (viewMode === 'zwei_wochen') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      start = weekStart;
      end = endOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 1 });
    } else if (viewMode === 'monat') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      start = startOfWeek(ms, { weekStartsOn: 1 });
      end = endOfWeek(me, { weekStartsOn: 1 });
    } else {
      start = startOfMonth(currentDate);
      end = endOfMonth(currentDate);
    }

    return {
      rangeStart: start,
      rangeEnd: end,
      displayDays: eachDayOfInterval({ start, end }),
    };
  }, [viewMode, currentDate]);

  const holidays = useMemo(() => {
    const years = new Set<number>([
      currentDate.getFullYear(),
      rangeStart.getFullYear(),
      rangeEnd.getFullYear(),
    ]);
    return Array.from(years).flatMap((y) => getGermanHolidays(y));
  }, [currentDate, rangeStart, rangeEnd]);

  /**
   * Schichten laden:
   * - Mitarbeiter: RLS + employee_id = eigene ID
   * - Admin ohne Filter: alle Schichten
   * - Admin mit Sidebar-Auswahl: nur gewählter Mitarbeiter
   */
  const loadSchedules = useCallback(async () => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      setLoading(false);
      setSchedules([]);
      return;
    }

    const gen = ++fetchGeneration.current;
    setLoading(true);
    try {
      let query = supabase
        .from('schedules')
        .select(SCHEDULE_SELECT)
        .eq('org_id', orgId)
        .gte('shift_date', format(rangeStart, 'yyyy-MM-dd'))
        .lte('shift_date', format(rangeEnd, 'yyyy-MM-dd'))
        .order('start_time', { ascending: true });

      if (!isAdmin && profileId) {
        query = query.eq('employee_id', profileId);
      } else if (isAdmin && filterEmployeeId) {
        query = query.eq('employee_id', filterEmployeeId);
      }

      const { data, error } = await query;
      if (gen !== fetchGeneration.current) return;
      if (error) throw error;

      setSchedules(
        (data ?? []).map((row) =>
          normalizeScheduleRow(row as Record<string, unknown>)
        )
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      console.error('Fehler beim Laden der Schichten:', message);
      setSchedules([]);
    } finally {
      if (gen === fetchGeneration.current) {
        setLoading(false);
      }
    }
  }, [rangeStart, rangeEnd, isAdmin, profileId, filterEmployeeId]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  useEffect(() => {
    const channel = supabase
      .channel('scheduler-calendar-schedules')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules' },
        () => {
          void loadSchedules();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSchedules]);

  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      if (!map[s.shift_date]) map[s.shift_date] = [];
      map[s.shift_date].push(s);
    }
    return map;
  }, [schedules]);

  const navigate = (dir: number) => {
    setCurrentDate((prev) => {
      if (viewMode === 'tag') {
        return dir > 0 ? addDays(prev, 1) : subDays(prev, 1);
      }
      if (viewMode === 'woche') {
        return dir > 0 ? addWeeks(prev, 1) : subWeeks(prev, 1);
      }
      if (viewMode === 'zwei_wochen') {
        return dir > 0 ? addWeeks(prev, 2) : subWeeks(prev, 2);
      }
      return dir > 0 ? addMonths(prev, 1) : subMonths(prev, 1);
    });
  };

  const goToToday = () => setCurrentDate(new Date());

  const openCreateDrawer = (date: Date) => {
    if (!isAdmin) return;
    setDrawerMode('create');
    setSelectedSchedule(null);
    setCreateDate(format(date, 'yyyy-MM-dd'));
    setDrawerOpen(true);
  };

  const openViewDrawer = (schedule: Schedule) => {
    setDrawerMode('view');
    setSelectedSchedule(schedule);
    setCreateDate(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedSchedule(null);
    setCreateDate(null);
  };

  const handleShiftDoubleClick = (schedule: Schedule) => {
    if (!isAdmin) return;
    openViewDrawer(schedule);
    window.setTimeout(() => {
      setDrawerMode('edit');
    }, 0);
  };

  const handleSaveShift = async (input: {
    employee_id: string | null;
    customer_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    tasks: string | null;
    recurrence: ScheduleRecurrence;
    occurrences: number;
    status: Schedule['status'];
  }) => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      throw new Error('Keine Organisation gefunden.');
    }

    // Bei Wiederholungen (weekly/biweekly etc.) → RPC
    if (input.recurrence !== 'once') {
      const { error } = await supabase.rpc('create_schedules_with_recurrence', {
        p_employee_id: input.employee_id,
        p_customer_id: input.customer_id,
        p_shift_date: input.shift_date,
        p_start_time: input.start_time,
        p_end_time: input.end_time,
        p_tasks: input.tasks,
        p_recurrence: input.recurrence,
        p_status: input.status,
        p_occurrences: input.occurrences,
        p_org_id: orgId,
        p_break_minutes: input.break_minutes,
      });
      if (error) throw new Error(error.message);
      toast.success('Serientermin gespeichert!');
      await loadSchedules();
      return;
    }

    // Einzeltermin → direkter Insert (schneller, kein RPC-Overhead)
    const payload = {
      employee_id: input.employee_id,
      customer_id: input.customer_id,
      shift_date: input.shift_date,
      start_time: input.start_time,
      end_time: input.end_time,
      break_minutes: input.break_minutes,
      tasks: input.tasks,
      instructions: input.tasks,
      status: input.status,
      recurrence: 'once' as const,
      org_id: orgId,
    };
    const { error } = await supabase.from('schedules').insert(payload);
    if (error) throw new Error(error.message);
    toast.success('Schicht gespeichert!');
    await loadSchedules();
  };

  const handleUpdateShift = async (
    id: string,
    data: Partial<
      Omit<Schedule, 'id' | 'created_at' | 'profiles' | 'customers' | 'clients'>
    >
  ) => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      throw new Error('Keine Organisation gefunden.');
    }

    const payload = {
      ...data,
      ...(data.tasks !== undefined ? { instructions: data.tasks } : {}),
    };
    const { error } = await supabase.from('schedules').update(payload).eq('id', id).eq('org_id', orgId);
    if (error) throw new Error(error.message);
    toast.success("Schicht aktualisiert!");
    await loadSchedules();
  };

  const handleDeleteShift = async (id: string) => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      throw new Error('Keine Organisation gefunden.');
    }

    const { error } = await supabase.from('schedules').delete().eq('id', id).eq('org_id', orgId);
    if (error) throw new Error(error.message);
    toast.success("Schicht gelöscht.");
    await loadSchedules();
  };

  const headerTitle = useMemo(() => {
    if (viewMode === 'tag') {
      return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
    }
    if (viewMode === 'woche') {
      const weekNum = getISOWeek(currentDate);
      return `KW ${weekNum} – ${format(rangeStart, 'd. MMM')} bis ${format(rangeEnd, 'd. MMMM yyyy')}`;
    }
    if (viewMode === 'zwei_wochen') {
      return `2 Wochen – ${format(rangeStart, 'd. MMM')} bis ${format(rangeEnd, 'd. MMM yyyy')}`;
    }
    if (viewMode === 'monat') {
      return `${MONTHS_DE[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    return `${currentDate.getFullYear()}`;
  }, [viewMode, currentDate, rangeStart, rangeEnd]);

  const calendarPanel = (
    <div className="scheduler-calendar flex flex-col h-full min-h-0 bg-white">
      <header className="scheduler-calendar__header">
        <div className="scheduler-calendar__nav">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="scheduler-calendar__nav-btn"
            aria-label="Vorheriger Zeitraum"
          >
            ‹
          </button>

          <p className="scheduler-calendar__title" role="heading" aria-level={2}>
            {headerTitle}
            {loading && (
              <span className="scheduler-calendar__loading-hint"> · lädt…</span>
            )}
          </p>

          <button
            type="button"
            onClick={() => navigate(1)}
            className="scheduler-calendar__nav-btn"
            aria-label="Nächster Zeitraum"
          >
            ›
          </button>

          {/* Employee filter dropdown (admin only) */}
          {isAdmin && (
            <div className="scheduler-calendar__filter-dropdown">
              <select
                className="scheduler-calendar__filter-select"
                value={filterEmployeeId ?? ''}
                onChange={(e) => setFilterEmployeeId(e.target.value || null)}
                disabled={profilesLoading}
                aria-label="Mitarbeiter filtern"
              >
                <option value="">Alle Mitarbeiter</option>
                {activeEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="scheduler-calendar__actions">
          <button type="button" onClick={goToToday} className="scheduler-calendar__btn-today">
            Heute
          </button>

          <div className="scheduler-calendar__view-tabs" role="tablist" aria-label="Kalenderansicht">
            {(['tag', 'woche', 'zwei_wochen', 'monat'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`scheduler-calendar__view-tab${viewMode === mode ? ' scheduler-calendar__view-tab--active' : ''}`}
              >
                {mode === 'tag' && 'Tag'}
                {mode === 'woche' && 'Woche'}
                {mode === 'zwei_wochen' && '2 Wochen'}
                {mode === 'monat' && 'Monat'}
              </button>
            ))}
          </div>
        </div>

        {(viewMode === 'monat' || viewMode === 'woche' || viewMode === 'zwei_wochen') && (
          <div className="scheduler-calendar__weekdays w-full basis-full">
            {WEEKDAYS.map((label, index) => (
              <div
                key={label}
                className={`scheduler-calendar__weekday${
                  index >= 5 ? ' scheduler-calendar__weekday--weekend' : ''
                }`}
              >
                {label}
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-auto min-h-0">
        {viewMode === 'tag' && (
          <DayViewList
            date={currentDate}
            schedules={schedulesByDate[format(currentDate, 'yyyy-MM-dd')] || []}
            holiday={getHolidayForDate(format(currentDate, 'yyyy-MM-dd'), holidays)}
            isAdmin={isAdmin}
            loading={loading}
            onAddShift={openCreateDrawer}
            onShiftClick={openViewDrawer}
          />
        )}

        {viewMode === 'woche' && (
          <div
            className="week-view-grid grid grid-cols-7 gap-0 w-full border-l border-t border-gray-200"
            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
            role="grid"
            aria-label="Wochenkalender"
          >
            {loading && schedules.length === 0 ? (
              Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={`week-skel-${i}`}
                  className="calendar-day min-h-[200px] p-2 border-b border-r border-gray-100 bg-gray-50/30 animate-pulse"
                />
              ))
            ) : (
              displayDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const daySchedules = schedulesByDate[dateStr] || [];
                const holiday = getHolidayForDate(dateStr, holidays);

                return (
                  <DayCell
                    key={dateStr}
                    date={day}
                    schedules={daySchedules}
                    holiday={holiday}
                    isCurrentMonth
                    onAddShift={openCreateDrawer}
                    onShiftClick={openViewDrawer}
                    onShiftDoubleClick={handleShiftDoubleClick}
                    isAdmin={isAdmin}
                  />
                );
              })
            )}
          </div>
        )}

        {viewMode === 'zwei_wochen' && (
          <div
            className="week-view-grid grid grid-cols-7 gap-0 w-full border-l border-t border-gray-200"
            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
            role="grid"
            aria-label="2-Wochenkalender"
          >
            {loading && schedules.length === 0 ? (
              Array.from({ length: 14 }).map((_, i) => (
                <div
                  key={`2w-skel-${i}`}
                  className="calendar-day min-h-[200px] p-2 border-b border-r border-gray-100 bg-gray-50/30 animate-pulse"
                />
              ))
            ) : (
              displayDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const daySchedules = schedulesByDate[dateStr] || [];
                const holiday = getHolidayForDate(dateStr, holidays);

                return (
                  <DayCell
                    key={dateStr}
                    date={day}
                    schedules={daySchedules}
                    holiday={holiday}
                    isCurrentMonth
                    onAddShift={openCreateDrawer}
                    onShiftClick={openViewDrawer}
                    onShiftDoubleClick={handleShiftDoubleClick}
                    isAdmin={isAdmin}
                  />
                );
              })
            )}
          </div>
        )}

        {viewMode === 'monat' && (
          <div
            className="month-view-grid grid grid-cols-7 gap-0 w-full border-l border-t border-gray-200"
            style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
            role="grid"
            aria-label="Monatskalender"
          >
            {loading && schedules.length === 0 ? (
              Array.from({ length: displayDays.length || 42 }).map((_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className={`calendar-day min-h-[120px] min-w-0 p-2 border-b border-r border-gray-100 bg-gray-50/30 animate-pulse${
                    i % 7 >= 5 ? ' calendar-day--weekend' : ''
                  }`}
                />
              ))
            ) : (
              displayDays.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const daySchedules = schedulesByDate[dateStr] || [];
                const holiday = getHolidayForDate(dateStr, holidays);
                const isCurrent = isSameMonth(day, currentDate);

                return (
                  <DayCell
                    key={dateStr}
                    date={day}
                    schedules={daySchedules}
                    holiday={holiday}
                    isCurrentMonth={isCurrent}
                    onAddShift={openCreateDrawer}
                    onShiftClick={openViewDrawer}
                    isAdmin={isAdmin}
                  />
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="schedule-workspace">
      {!isAdmin && (
        <p className="schedule-workspace__employee-hint">
          Ihre geplanten Einsätze — nur zur Ansicht.
        </p>
      )}
      {calendarPanel}

      {drawerOpen && (
        <ShiftDrawer
          mode={drawerMode}
          schedule={selectedSchedule}
          defaultDate={createDate ?? undefined}
          defaultEmployeeId={filterEmployeeId ?? undefined}
          onClose={closeDrawer}
          onSave={isAdmin ? handleSaveShift : undefined}
          onUpdate={isAdmin ? handleUpdateShift : undefined}
          onDelete={isAdmin ? handleDeleteShift : undefined}
          onRequestEdit={
            isAdmin && selectedSchedule
              ? () => setDrawerMode('edit')
              : undefined
          }
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
