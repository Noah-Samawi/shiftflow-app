import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabaseClient";
import { getCurrentOrgId } from "../hooks/useOrgId";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { de } from "date-fns/locale";
import type { Profile } from "../types/database";

interface DashSchedule {
  id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  status: string;
  employee_name: string;
  customer_name: string;
  customer_color: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Geplant",
  confirmed: "Bestätigt",
  completed: "Abgeschlossen",
  cancelled: "Abgesagt",
};

const STATUS_DOT: Record<string, string> = {
  scheduled: "#F59E0B",
  confirmed: "#10B981",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

export default function DashboardPage() {
  const { role } = useAuth();

  const [metrics, setMetrics] = useState({
    thisWeekCount: 0,
    openCount: 0,
    confirmedCount: 0,
    employeeCount: 0,
  });
  const [upcoming, setUpcoming] = useState<DashSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const loadDashboard = useCallback(async () => {
    const orgId = await getCurrentOrgId();
    if (!orgId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
      const future = format(addDays(new Date(), 7), "yyyy-MM-dd");

      // Schichten diese Woche
      const { count: thisWeekCount } = await supabase
        .from("schedules")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("shift_date", weekStart)
        .lte("shift_date", weekEnd);

      // Offene Schichten (kein Mitarbeiter zugewiesen)
      const { count: openCount } = await supabase
        .from("schedules")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .is("employee_id", null)
        .neq("status", "cancelled");

      // Bestätigte Schichten
      const { count: confirmedCount } = await supabase
        .from("schedules")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "confirmed");

      // Aktive Mitarbeiter
      const { count: employeeCount } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("role", "employee");

      setMetrics({
        thisWeekCount: thisWeekCount ?? 0,
        openCount: openCount ?? 0,
        confirmedCount: confirmedCount ?? 0,
        employeeCount: employeeCount ?? 0,
      });

      // Nächste 5 Schichten (Timeline)
      const { data: nextData } = await supabase
        .from("schedules")
        .select(`
          id, shift_date, start_time, end_time, status,
          profiles ( full_name ),
          customers ( name, color )
        `)
        .eq("org_id", orgId)
        .gte("shift_date", today)
        .lte("shift_date", future)
        .neq("status", "cancelled")
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(5);

      const mapped = (nextData ?? []).map((row: Record<string, unknown>) => {
        const profiles = Array.isArray(row.profiles)
          ? row.profiles[0]
          : row.profiles;
        const customers = Array.isArray(row.customers)
          ? row.customers[0]
          : row.customers;
        return {
          id: row.id as string,
          shift_date: row.shift_date as string,
          start_time: row.start_time as string,
          end_time: row.end_time as string,
          status: row.status as string,
          employee_name: (profiles as Profile | null)?.full_name ?? "—",
          customer_name: (customers as { name: string } | null)?.name ?? "—",
          customer_color:
            (customers as { color: string } | null)?.color ?? null,
        };
      });
      setUpcoming(mapped);
    } catch {
      // silently ignore dashboard errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-welcome">
        <h2>Nachbarschaftshilfe — M. Sharif</h2>
        <p>
          {role === "admin"
            ? "Verwalten Sie Ihr Team und Kunden-Assignments."
            : "Sehen Sie Ihre bevorstehenden Schichten und Kundendetails."}
        </p>
      </div>

      <div className="dashboard-grid">
        {/* Schichten diese Woche */}
        <div className="dash-card">
          <div className="dash-card-icon dash-card-icon--blue">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="16" height="15" rx="2" />
              <line x1="2" y1="8" x2="18" y2="8" />
              <line x1="6" y1="1" x2="6" y2="5" />
              <line x1="14" y1="1" x2="14" y2="5" />
            </svg>
          </div>
          <div className="dash-card-content">
            <span className="dash-card-value">
              {loading ? "—" : metrics.thisWeekCount}
            </span>
            <span className="dash-card-label">Schichten diese Woche</span>
          </div>
        </div>

        {/* Offene Schichten */}
        <div className="dash-card">
          <div className="dash-card-icon dash-card-icon--orange">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="dash-card-content">
            <span className="dash-card-value">
              {loading ? "—" : metrics.openCount}
            </span>
            <span className="dash-card-label">Offene Schichten</span>
          </div>
        </div>

        {/* Bestätigte Schichten */}
        <div className="dash-card">
          <div className="dash-card-icon dash-card-icon--green">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10l4 4 8-8" />
            </svg>
          </div>
          <div className="dash-card-content">
            <span className="dash-card-value">
              {loading ? "—" : metrics.confirmedCount}
            </span>
            <span className="dash-card-label">Bestätigte Schichten</span>
          </div>
        </div>

        {/* Aktive Mitarbeiter */}
        <div className="dash-card">
          <div className="dash-card-icon dash-card-icon--navy">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="3" />
              <circle cx="14" cy="7" r="3" />
              <path d="M1 17c0-2.8 2.7-5 6-5" />
              <path d="M13 12c3.3 0 6 2.2 6 5" />
            </svg>
          </div>
          <div className="dash-card-content">
            <span className="dash-card-value">
              {loading ? "—" : metrics.employeeCount}
            </span>
            <span className="dash-card-label">Aktive Mitarbeiter</span>
          </div>
        </div>
      </div>

      {/* Timeline: Nächste 5 Schichten */}
      <div className="dashboard-table-section">
        <h3 style={{ marginTop: 32, marginBottom: 16, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text)' }}>
          Nächste 5 Schichten
        </h3>

        {loading ? (
          <div className="dash-skeleton">
            <div className="dash-skeleton-row" />
            <div className="dash-skeleton-row" />
            <div className="dash-skeleton-row" />
          </div>
        ) : upcoming.length === 0 ? (
          <div className="status-msg">Keine bevorstehenden Schichten.</div>
        ) : (
          <div className="dash-table-wrap" style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Mitarbeiter</th>
                  <th>Kunde</th>
                  <th>Zeit</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => {
                  const d = new Date(s.shift_date + 'T12:00:00');
                  const dateLabel = format(d, 'EE, dd.MM.', { locale: de });
                  const isToday = s.shift_date === todayStr;
                  return (
                    <tr key={s.id} className={isToday ? 'dash-table-today' : ''}>
                      <td>
                        {isToday && <span className="dash-today-badge">Heute</span>}
                        {dateLabel}
                      </td>
                      <td>{s.employee_name}</td>
                      <td>
                        <span
                          className="dash-dot"
                          style={{ backgroundColor: s.customer_color ?? '#3B82F6' }}
                        />
                        {s.customer_name}
                      </td>
                      <td>{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</td>
                      <td>
                        <span
                          className="dash-status-pill"
                          style={{
                            backgroundColor: STATUS_DOT[s.status] + '20',
                            color: STATUS_DOT[s.status],
                          }}
                        >
                          {STATUS_LABELS[s.status] ?? s.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
