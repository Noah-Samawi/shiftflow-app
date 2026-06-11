import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../hooks/useAuth";

export default function ChangePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Mindestens 6 Zeichen");
      return;
    }
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein");
      return;
    }
    setLoading(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password,
      });
      if (updateErr) throw updateErr;
      // requires_password_change zurücksetzen
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("profiles")
          .update({ requires_password_change: false })
          .eq("id", user.id);
      }
      await signOut();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Neues Passwort setzen</h1>
        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}
          <div className="form-group">
            <label>Neues Passwort</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
          </div>
          <div className="form-group">
            <label>Passwort bestätigen</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Speichern…" : "Passwort speichern"}
          </button>
        </form>
      </div>
    </div>
  );
}
