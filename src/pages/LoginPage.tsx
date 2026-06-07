import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function LoginPage() {
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already logged in (stable dependencies to prevent render loop)
  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading]);

  // Show loading indicator while auth state is being determined
  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Wird geladen…</p>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (isSignUp && password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
        setSuccess(
          "Konto erstellt! Überprüfen Sie Ihre E-Mail zur Bestätigung, dann melden Sie sich an."
        );
        setIsSignUp(false);
        setPassword("");
        setConfirmPassword("");
      } else {
        await signIn(email, password);
        // Navigation will be handled by useEffect when user state updates
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentifizierung fehlgeschlagen");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (signUpMode: boolean) => {
    setIsSignUp(signUpMode);
    setError(null);
    setSuccess(null);
    setConfirmPassword("");
  };

  const isLoading = authLoading || submitting;

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
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
          <span className="logo-text">Nachbarschaftshilfe</span>
        </div>

        <h1 className="login-title">
          {isSignUp ? "Konto erstellen" : "Bei Ihrem Konto anmelden"}
        </h1>
        <p className="login-subtitle">
          {isSignUp
            ? "Registrieren Sie sich, um Schichten und Kunden zu verwalten"
            : "Geben Sie Ihre Zugangsdaten ein, um auf das Portal zuzugreifen"}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}
          {success && <div className="login-success">{success}</div>}

          <div className="form-group">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ihre@email.de"
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              disabled={isLoading}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>

          {isSignUp && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Passwort bestätigen</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={isLoading}
                autoComplete="new-password"
              />
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading
              ? isSignUp
                ? "Konto wird erstellt…"
                : "Anmelden…"
              : isSignUp
                ? "Registrieren"
                : "Anmelden"}
          </button>

          <div className="login-switch">
            {isSignUp ? (
              <>
                Bereits ein Konto?{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => switchMode(false)}
                >
                  Anmelden
                </button>
              </>
            ) : (
              <>
                Noch kein Konto?{" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => switchMode(true)}
                >
                  Registrieren
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
