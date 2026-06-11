import type { Profile } from "../../types/database";

interface EmployeeSidebarProps {
  employees: Profile[];
  selectedEmployeeId: string | null;
  onSelectEmployee: (id: string | null) => void;
  loading?: boolean;
}

/**
 * Admin-Filter für den Kalender (public.profiles, role = employee).
 * - Desktop: linke Spalte mit Mitarbeiterliste.
 * - Mobile/Tablet: kompaktes Dropdown, damit der Kalender die volle Breite nutzt.
 * null = alle Schichten; UUID = nur Schichten dieses Mitarbeiters.
 */
export default function EmployeeSidebar({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  loading = false,
}: EmployeeSidebarProps) {
  return (
    <>
      {/* Mobile/Tablet: Dropdown-Filter (touch-freundlich) */}
      <div className="employee-filter-mobile">
        <label htmlFor="employee-filter-select" className="employee-filter-mobile__label">
          Mitarbeiter
        </label>
        <select
          id="employee-filter-select"
          className="employee-filter-mobile__select"
          value={selectedEmployeeId ?? ""}
          onChange={(e) => onSelectEmployee(e.target.value || null)}
          disabled={loading && employees.length === 0}
        >
          <option value="">Alle anzeigen</option>
          {employees.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.full_name}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: vollständige Mitarbeiter-Spalte */}
      <aside className="employee-sidebar" aria-label="Mitarbeiterfilter">
        <div className="employee-sidebar__header">
          <h2 className="employee-sidebar__title">Mitarbeiter</h2>
          <p className="employee-sidebar__hint">Kalender filtern</p>
        </div>

        <nav className="employee-sidebar__list">
          <button
            type="button"
            className={`employee-sidebar__item${
              selectedEmployeeId === null ? " employee-sidebar__item--active" : ""
            }`}
            onClick={() => onSelectEmployee(null)}
          >
            <span className="employee-sidebar__avatar employee-sidebar__avatar--all">
              ★
            </span>
            <span className="employee-sidebar__name">Alle anzeigen</span>
          </button>

          {loading && employees.length === 0 && (
            <p className="employee-sidebar__empty">Laden…</p>
          )}

          {!loading && employees.length === 0 && (
            <p className="employee-sidebar__empty">Noch keine Mitarbeiter angelegt.</p>
          )}

          {employees.map((emp) => {
            const active = selectedEmployeeId === emp.id;
            return (
              <button
                key={emp.id}
                type="button"
                className={`employee-sidebar__item${
                  active ? " employee-sidebar__item--active" : ""
                }`}
                onClick={() => onSelectEmployee(emp.id)}
              >
                <span className="employee-sidebar__avatar">
                  {emp.full_name.charAt(0).toUpperCase()}
                </span>
                <span className="employee-sidebar__name">{emp.full_name}</span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
