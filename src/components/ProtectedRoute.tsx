import { useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [requiresChange, setRequiresChange] = useState(false);

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
          .select("requires_password_change")
          .eq("id", user.id)
          .single();

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

  return <>{children}</>;
}
