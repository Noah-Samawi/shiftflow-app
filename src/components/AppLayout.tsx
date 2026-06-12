import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getCurrentOrgId } from "../hooks/useOrgId";
import { supabase } from "../lib/supabaseClient";
import { type ReactNode, useState, useEffect } from "react";
import { getISOWeek } from "date-fns";

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  {
    label: "Übersicht",
    path: "/dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="7" height="7" rx="1.5" />
        <rect x="11" y="2" width="7" height="7" rx="1.5" />
        <rect x="2" y="11" width="7" height="7" rx="1.5" />
        <rect x="11" y="11" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    label: "Dienstplan",
    path: "/schedule",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="16" height="15" rx="2" />
        <line x1="2" y1="8" x2="18" y2="8" />
        <line x1="6" y1="1" x2="6" y2="5" />
        <line x1="14" y1="1" x2="14" y2="5" />
      </svg>
    ),
  },
  {
    label: "Kunden",
    path: "/customers",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21l1-4h14l1 4" />
        <path d="M6 17V9a4 4 0 018 0v8" />
        <line x1="10" y1="1" x2="10" y2="5" />
        <line x1="6" y1="5" x2="14" y2="5" />
      </svg>
    ),
  },
  {
    label: "Mitarbeiter",
    path: "/employees",
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="3" />
        <circle cx="14" cy="7" r="3" />
        <path d="M1 17c0-2.8 2.7-5 6-5" />
        <path d="M13 12c3.3 0 6 2.2 6 5" />
      </svg>
    ),
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Übersicht",
  "/schedule": "Dienstplan",
  "/customers": "Kunden",
  "/employees": "Mitarbeiter",
};

export default function AppLayout() {
  const { user, isAdmin, roleLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [orgName, setOrgName] = useState<string>("ShiftFlow");

  // Load live organization name from DB
  useEffect(() => {
    async function loadOrgName() {
      const orgId = await getCurrentOrgId();
      if (!orgId) return;
      const { data } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();
      if (data?.name) setOrgName(data.name);
    }
    void loadOrgName();
  }, []);

  const roleLabel =
    roleLoading && user
      ? "Wird geladen…"
      : isAdmin
        ? "Administrator"
        : "Mitarbeiter";

  const pageTitle = PAGE_TITLES[location.pathname] || "Dashboard";
  const isSchedulePage = location.pathname === "/schedule";

  const handleSignOut = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  // Determine current week for schedule page topbar
  const weekOffset = 0;
  const today = new Date();
  const monday = new Date(today);
  const day = today.getDay();
  monday.setDate(today.getDate() + weekOffset * 7 + (day === 0 ? -6 : 1 - day));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("de-DE", { month: "short", day: "numeric" });

  return (
    <div className="app-layout">
      {/* ─── Desktop Sidebar (≥768px) ─── */}
      <aside className="sidebar">
        <div className="sidebar-top">
          {/* Logo */}
          <div className="sidebar-logo">
            <div className="logo-icon-sm">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#1B4F72" />
                <path
                  d="M10 16L14 20L22 12"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="sidebar-logo-text">
              <span className="logo-text">ShiftFlow</span>
              <span className="logo-org-name" title={orgName}>{orgName}</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="sidebar-nav">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "nav-link--active" : ""}`
                }
                title={item.label}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Bottom: User section */}
        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">
              {user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="user-info">
              <span className="user-name">{user?.email}</span>
              <span className="user-role">{roleLabel}</span>
            </div>
            <button
              className="btn-signout"
              onClick={handleSignOut}
              title="Abmelden"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 2H3a1 1 0 00-1 1v12a1 1 0 001 1h4" />
                <path d="M11 13l4-4-4-4" />
                <line x1="5" y1="9" x2="15" y2="9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main content ─── */}
      <div className="main-area">
        {/* Top bar (desktop) */}
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">{pageTitle}</h1>
            {isSchedulePage && (
              <div className="week-nav">
                <span className="week-range-label">
                  KW {getISOWeek(monday)} · {fmt(monday)} – {fmt(sunday)}
                  <span className="week-badge">Diese Woche</span>
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="content-area">
          <Outlet />
        </main>
      </div>

      {/* ─── Mobile Bottom Navigation (<768px) ─── */}
      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `bottom-nav__item ${isActive ? "bottom-nav__item--active" : ""}`
            }
          >
            <span className="bottom-nav__icon">{item.icon}</span>
            <span className="bottom-nav__label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
