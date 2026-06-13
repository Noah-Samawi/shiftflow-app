import { useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [requiresChange, setRequiresChange] = useState(false);
  const [orgStatus, setOrgStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }

    if (location.pathname === "/change-password") {
      setChecking(false);
      return;
    }

    const check = async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("requires_password_change, organizations(status)")
          .eq("id", user.id)
          .single();

        // organizations is a to-one embed; handle object or array defensively
        const org = Array.isArray(data?.organizations)
          ? data?.organizations[0]
          : data?.organizations;
        setOrgStatus((org as { status?: string } | null)?.status ?? null);

        if (data?.requires_password_change) {
          setRequiresChange(true);
          navigate("/change-password", { replace: true });
        }
      } catch {
        // ignore
      } finally {
        setChecking(false);
      }
    };
    void check();
  }, [user, location.pathname, navigate]);

  if (loading || checking) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Wird geladen…</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiresChange) {
    return <Navigate to="/change-password" replace />;
  }

  // Organization not yet approved → block the app and explain why.
  // (The DB also enforces this via is_org_active(); this is the UX layer.)
  if (orgStatus && orgStatus !== "active") {
    const rejected = orgStatus === "rejected";
    return (
      <div className="login-page">
        <div className="login-card">
          <h1 className="login-title">
            {rejected ? "Registrierung abgelehnt" : "Freischaltung ausstehend"}
          </h1>
          <p className="login-subtitle">
            {rejected
              ? "Ihre Firmenregistrierung wurde abgelehnt. Bitte wenden Sie sich an den Support."
              : "Ihre Firma wurde erfolgreich registriert und wartet auf die Freischaltung durch unser Team. Sie erhalten Zugriff, sobald die Prüfung abgeschlossen ist."}
          </p>
          <button
            className="btn-secondary"
            onClick={async () => {
              await signOut();
              navigate("/login", { replace: true });
            }}
          >
            Abmelden
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
