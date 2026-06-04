import React, {
  useState, useEffect, useMemo, useCallback
} from 'react';
import {
  format, startOfWeek, endOfWeek, startOfMonth,
  endOfMonth, eachDayOfInterval, addWeeks,
  subWeeks, addMonths, subMonths, isToday,
  isSameMonth, getISOWeek, addDays, subDays
} from 'date-fns';
import { de } from 'date-fns/locale';
import { supabase } from '../../lib/supabaseClient';
import {
  getGermanHolidays,
  getHolidayForDate,
  type GermanHoliday
} from '../../utils/germanHolidays';

// ── Typen ──────────────────────────────────────────
type ViewMode = 'tag' | 'woche' | 'monat' | 'jahr';

interface Profile {
  id: string;
  full_name: string;
  avatar_url?: string;
  role: 'admin' | 'employee';
}

interface Client {
  id: string;
  name: string;
  color: string;
}

interface Schedule {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  instructions?: string;
  status: string;
  employee_id?: string;
  client_id?: string;
  profiles?: Profile | null;
  clients?: Client | null;
}

// ── Konstanten ─────────────────────────────────────
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

const STATUS_DE: Record<string, string> = {
  scheduled:  'Geplant',
  confirmed:  'Bestätigt',
  completed:  'Abgeschlossen',
  cancelled:  'Abgesagt',
};

// ── Hilfs-Hooks ────────────────────────────────────
function useCurrentProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role')
          .eq('id', user.id)
          .maybeSingle();

        if (error) console.error('Profil-Fehler:', error.message);
        if (mounted) setProfile(data ?? null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();

    const { data: listener } =
      supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { profile, loading, isAdmin: profile?.role === 'admin' };
}

// ── Schicht-Karte ──────────────────────────────────
function ShiftCard({
  schedule,
  onClick,
}: {
  schedule: Schedule;
  onClick: (s: Schedule) => void;
}) {
  const colorClass = STATUS_COLORS[schedule.status] ?? STATUS_COLORS.scheduled;
  return (
    <button
      onClick={() => onClick(schedule)}
      className={`
        w-full text-left px-2 py-1 rounded-md border text-xs
        font-medium truncate transition-all hover:opacity-80
        hover:shadow-sm mb-1 ${colorClass}
      `}
    >
      <span className="font-semibold">
        {schedule.start_time.slice(0,5)}–{schedule.end_time.slice(0,5)}
      </span>
      {' '}
      <span className="opacity-80">
        {schedule.profiles?.full_name?.split(' ')[0]}
      </span>
      {schedule.clients?.name && (
        <span
          className="ml-1 inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: schedule.clients.color ?? '#3B82F6' }}
        />
      )}
    </button>
  );
}

// ── Tag-Zelle ──────────────────────────────────────
function DayCell({
  date,
  schedules,
  holiday,
  isCurrentMonth,
  onAddShift,
  onShiftClick,
  isAdmin,
}: {
  date: Date;
  schedules: Schedule[];
  holiday: GermanHoliday | null;
  isCurrentMonth: boolean;
  onAddShift: (date: Date) => void;
  onShiftClick: (s: Schedule) => void;
  isAdmin: boolean;
}) {
  const today     = isToday(date);
  const dateStr   = format(date, 'd');
  const dimmed    = !isCurrentMonth;

  return (
    <div
      className="
        min-h-[120px] p-2 border-b border-r border-gray-100
        flex flex-col gap-1 group transition-colors relative
        ${dimmed ? 'bg-gray-50/50' : 'bg-white hover:bg-gray-50/70'}
      "
    >
      {/* Datum + Feiertag */}
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
  
        {/* + Button (nur Admin, Hover) */}
        {isAdmin && !dimmed && (
          <button
            onClick={() => onAddShift(date)}
            className="
              opacity-0 group-hover:opacity-100 transition-opacity
              w-5 h-5 rounded-full bg-blue-500 text-white
              flex items-center justify-center text-xs
              hover:bg-blue-600 flex-shrink-0
            "
            title="Schicht hinzufügen"
          >
            +
          </button>
        )}
      </div>
  
      {/* Feiertag-Badge - absolut positioniert um Grid nicht zu brechen */}
      {holiday && (
        <div className="absolute top-1 right-1 z-10">
          <span className="
            inline-flex items-center gap-1 px-1.5 py-0.5
            bg-purple-600 text-white text-[10px] font-medium
            rounded-full truncate max-w-[90px]
          ">
            <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor" className="flex-shrink-0">
              <path d="M5 0L6.5 3.5L10 4L7.5 6.5L8 10L5 8.5L2 10L2.5 6.5L0 4L3.5 3.5L5 0Z" />
            </svg>
            <span className="truncate">{holiday.shortName}</span>
          </span>
        </div>
      )}
  
      {/* Schichten */}
      <div className="flex-1 overflow-y-auto max-h-[160px]
                      scrollbar-thin scrollbar-thumb-gray-200">
        {schedules.map(s => (
          <ShiftCard
            key={s.id}
            schedule={s}
            onClick={onShiftClick}
          />
        ))}
      </div>
    </div>
  );
}

// ── Haupt-Export ───────────────────────────────────
export default function SchedulerCalendar() {
  const { profile, isAdmin } = useCurrentProfile();

  const [viewMode,    setViewMode]    = useState<ViewMode>('monat');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules,   setSchedules]   = useState<Schedule[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [selectedShift, setSelectedShift] = useState<Schedule | null>(null);
  const [showAddModal,  setShowAddModal]  = useState(false);
  const [addDate,       setAddDate]       = useState<Date | null>(null);

  // Feiertage für das angezeigte Jahr
  const holidays = useMemo(
    () => getGermanHolidays(currentDate.getFullYear()),
    [currentDate.getFullYear()]
  );

  // Datumsbereich je nach Ansicht
  const { rangeStart, rangeEnd, displayDays } = useMemo(() => {
    let start: Date, end: Date;

    if (viewMode === 'tag') {
      start = currentDate;
      end   = currentDate;
    } else if (viewMode === 'woche') {
      start = startOfWeek(currentDate, { weekStartsOn: 1 });
      end   = endOfWeek(currentDate,   { weekStartsOn: 1 });
    } else if (viewMode === 'monat') {
      const ms = startOfMonth(currentDate);
      const me = endOfMonth(currentDate);
      start = startOfWeek(ms, { weekStartsOn: 1 });
      end   = endOfWeek(me,   { weekStartsOn: 1 });
    } else {
      // Jahr: zeige aktuellen Monat als Überblick
      start = startOfMonth(currentDate);
      end   = endOfMonth(currentDate);
    }

    return {
      rangeStart: start,
      rangeEnd:   end,
      displayDays: eachDayOfInterval({ start, end }),
    };
  }, [viewMode, currentDate]);

  // Schichten laden
  const loadSchedules = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('schedules')
        .select(`
          id, shift_date, start_time, end_time,
          instructions, status, employee_id, client_id,
          profiles ( id, full_name, avatar_url, role ),
          clients  ( id, name, color )
        `)
        .gte('shift_date', format(rangeStart, 'yyyy-MM-dd'))
        .lte('shift_date', format(rangeEnd,   'yyyy-MM-dd'))
        .order('start_time', { ascending: true });

      // Employee sieht nur eigene Schichten
      if (!isAdmin && profile?.id) {
        query = query.eq('employee_id', profile.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setSchedules((data as any[] ?? []).map(s => ({
        ...s,
        profiles: Array.isArray(s.profiles) ? s.profiles[0] : s.profiles,
        clients: Array.isArray(s.clients) ? s.clients[0] : s.clients,
      })) as Schedule[]);
    } catch (err: any) {
      console.error('Fehler beim Laden der Schichten:', err.message);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd, isAdmin, profile?.id]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // Schichten pro Tag gruppieren
  const schedulesByDate = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      if (!map[s.shift_date]) map[s.shift_date] = [];
      map[s.shift_date].push(s);
    }
    return map;
  }, [schedules]);

  // Navigation
  const navigate = (dir: number) => {
    if (viewMode === 'tag') {
      setCurrentDate(dir > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    } else if (viewMode === 'woche') {
      setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    } else if (viewMode === 'monat') {
      setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else {
      setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  // Handler
  const handleAddShift = (date: Date) => {
    setAddDate(date);
    setShowAddModal(true);
  };

  const handleShiftClick = (schedule: Schedule) => {
    setSelectedShift(schedule);
    // TODO: Open drawer/modal for shift details
    console.log('Selected shift:', schedule);
  };

  // Header Titel
  const headerTitle = useMemo(() => {
    if (viewMode === 'tag') {
      return format(currentDate, 'EEEE, d. MMMM yyyy', { locale: de });
    } else if (viewMode === 'woche') {
      const weekNum = getISOWeek(currentDate);
      return `KW ${weekNum} – ${format(rangeStart, 'd. MMM')} bis ${format(rangeEnd, 'd. MMMM yyyy')}`;
    } else if (viewMode === 'monat') {
      return `${MONTHS_DE[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else {
      return `${currentDate.getFullYear()}`;
    }
  }, [viewMode, currentDate, rangeStart, rangeEnd]);

  // Grid-Spalten für Monatsansicht
  const weeksInMonth = useMemo(() => {
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    
    for (const day of displayDays) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }
    
    return weeks;
  }, [displayDays]);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ───────────────────────────────── */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="12,4 6,10 12,16" />
              </svg>
            </button>
            
            <h2 className="text-xl font-semibold text-gray-900 min-w-[280px] text-center">
              {headerTitle}
            </h2>
            
            <button
              onClick={() => navigate(1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="8,4 14,10 8,16" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Heute
            </button>

            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['tag', 'woche', 'monat'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`
                    px-3 py-1.5 text-sm font-medium rounded-md transition-all
                    ${viewMode === mode
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                    }
                  `}
                >
                  {mode === 'tag' && 'Tag'}
                  {mode === 'woche' && 'Woche'}
                  {mode === 'monat' && 'Monat'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Wochentage-Header für Monatsansicht */}
        {viewMode === 'monat' && (
          <div className="grid grid-cols-7 gap-0 mt-4">
            {WEEKDAYS.map(day => (
              <div
                key={day}
                className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide py-2"
              >
                {day}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Calendar Grid ────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {loading && schedules.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            Schichten werden geladen…
          </div>
        ) : viewMode === 'monat' ? (
          <div className="grid grid-cols-7 gap-0 border-l border-t border-gray-200">
            {weeksInMonth.map((week, weekIdx) => (
              <React.Fragment key={weekIdx}>
                {week.map(day => {
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
                      onAddShift={handleAddShift}
                      onShiftClick={handleShiftClick}
                      isAdmin={isAdmin}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            {viewMode === 'tag' && 'Tagesansicht kommt bald…'}
            {viewMode === 'woche' && 'Wochenansicht kommt bald…'}
            {viewMode === 'jahr' && 'Jahresansicht kommt bald…'}
          </div>
        )}
      </div>

      {/* ── Add Shift Modal (Placeholder) ────────── */}
      {showAddModal && addDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Schicht hinzufügen – {format(addDate, 'd. MMMM yyyy', { locale: de })}
            </h3>
            <p className="text-gray-600 mb-4">
              Modal-Integration mit AddShiftModal kommt bald…
            </p>
            <button
              onClick={() => setShowAddModal(false)}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Schließen
            </button>
          </div>
        </div>
      )}

      {/* ── Shift Details (Placeholder) ──────────── */}
      {selectedShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Schichtdetails
            </h3>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Datum:</span> {selectedShift.shift_date}</p>
              <p><span className="font-medium">Zeit:</span> {selectedShift.start_time.slice(0,5)} – {selectedShift.end_time.slice(0,5)}</p>
              <p><span className="font-medium">Mitarbeiter:</span> {selectedShift.profiles?.full_name || 'Nicht zugewiesen'}</p>
              <p><span className="font-medium">Kunde:</span> {selectedShift.clients?.name || '—'}</p>
              <p><span className="font-medium">Status:</span> {STATUS_DE[selectedShift.status] || selectedShift.status}</p>
              {selectedShift.instructions && (
                <p><span className="font-medium">Aufgaben:</span> {selectedShift.instructions}</p>
              )}
            </div>
            <button
              onClick={() => setSelectedShift(null)}
              className="w-full mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Schließen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
