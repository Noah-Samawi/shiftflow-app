import { useAuth } from "../hooks/useAuth";

export default function DashboardPage() {
  const { user, role } = useAuth();

  return (
    <div className="dashboard-page">
      <div className="dashboard-welcome">
        <h2>Willkommen zurück, {user?.email}</h2>
        <p>
          {role === "admin"
            ? "Verwalten Sie Ihr Team und Kunden assignments."
            : "Sehen Sie Ihre bevorstehenden Schichten und Kundendetails."}
        </p>
      </div>

      <div className="dashboard-grid">
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
            <span className="dash-card-value">—</span>
            <span className="dash-card-label">Schichten diese Woche</span>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-icon dash-card-icon--green">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="7" r="4" />
              <path d="M3 18c0-3.3 3.1-6 7-6s7 2.7 7 6" />
            </svg>
          </div>
          <div className="dash-card-content">
            <span className="dash-card-value">—</span>
            <span className="dash-card-label">Aktive Kunden</span>
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-icon dash-card-icon--purple">
            <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="3" />
              <circle cx="14" cy="7" r="3" />
              <path d="M1 17c0-2.8 2.7-5 6-5" />
              <path d="M13 12c3.3 0 6 2.2 6 5" />
            </svg>
          </div>
          <div className="dash-card-content">
            <span className="dash-card-value">—</span>
            <span className="dash-card-label">Teammitglieder</span>
          </div>
        </div>
      </div>
    </div>
  );
}
