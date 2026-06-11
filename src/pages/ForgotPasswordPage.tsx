import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== "undefined"
        ? `${window.location.origin}/change-password`
        : undefined,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Passwort zurücksetzen</h1>
        <p className="login-subtitle">
          Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten einen Link zum Zurücksetzen.
        </p>
        {sent ? (
          <div className="login-success">
            Link wurde versendet! Prüfen Sie Ihr Postfach.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <div className="form-group">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ihre@email.de"
                required
                disabled={loading}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Wird gesendet…" : "Link senden"}
            </button>
            <div className="login-switch">
              <Link to="/login" className="link-btn">Zurück zur Anmeldung</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
