import { useState, useEffect, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { invalidateOrgCache } from "../hooks/useOrgId";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
// Attempts older than this window are ignored (counter resets automatically)
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_KEY = "login_attempts";
const LOCKOUT_KEY = "login_lockout_until";

interface RateLimit {
  attempts: number;
  lastAttempt: number;
}

function getRateLimit(): RateLimit {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RateLimit;
      // Reset counter if last attempt was outside the rolling window
      if (Date.now() - parsed.lastAttempt > ATTEMPT_WINDOW_MS) {
        localStorage.removeItem(RATE_LIMIT_KEY);
        return { attempts: 0, lastAttempt: 0 };
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return { attempts: 0, lastAttempt: 0 };
}

function setRateLimit(data: RateLimit) {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
}

function getLockoutUntil(): number {
  const raw = localStorage.getItem(LOCKOUT_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

function setLockoutUntil(timestamp: number) {
  localStorage.setItem(LOCKOUT_KEY, String(timestamp));
}

function clearRateLimit() {
  localStorage.removeItem(RATE_LIMIT_KEY);
  localStorage.removeItem(LOCKOUT_KEY);
}

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
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // On mount: clear any stale lockout/attempts that were stored before the
  // 30-minute rolling window was introduced (one-time migration).
  useEffect(() => {
    // If there's a lockout but the attempt counter is now expired, wipe both.
    const limit = getRateLimit(); // already handles window expiry internally
    if (limit.attempts === 0) {
      clearRateLimit();
    }
  }, []);

  // Check lockout timer
  useEffect(() => {
    const interval = setInterval(() => {
      const until = getLockoutUntil();
      const now = Date.now();
      if (until > now) {
        setLockoutRemaining(Math.ceil((until - now) / 1000));
      } else {
        if (lockoutRemaining > 0) setLockoutRemaining(0);
        if (until > 0 && now >= until) {
          localStorage.removeItem(LOCKOUT_KEY);
          setError(null);
        }
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      // Clear org cache on login so fresh org_id is loaded
      invalidateOrgCache();
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Wird geladen…</p>
      </div>
    );
  }

  const isLockedOut = lockoutRemaining > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Check lockout
    const until = getLockoutUntil();
    if (until > Date.now()) {
      const mins = Math.ceil((until - Date.now()) / 60000);
      setError(
        `Zu oft falsch eingegeben. Bitte wenden Sie sich an den Administrator oder warten Sie ${mins} Minute(n).`
      );
      return;
    }

    if (isSignUp && password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein");
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
        clearRateLimit();
      } else {
        await signIn(email, password);
        clearRateLimit();
        // Navigation via useEffect
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentifizierung fehlgeschlagen";

      // Rate limiting on failure
      const limit = getRateLimit();
      limit.attempts += 1;
      limit.lastAttempt = Date.now();
      setRateLimit(limit);

      if (limit.attempts >= MAX_ATTEMPTS) {
        const lockoutUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
        setLockoutUntil(lockoutUntil);
        setLockoutRemaining(LOCKOUT_MINUTES * 60);
        setError(
          "Zu oft falsch eingegeben. Bitte wenden Sie sich an den Administrator."
        );
      } else {
        setError(msg);
      }

      // Artificial delay to prevent brute force
      await new Promise((r) => setTimeout(r, Math.min(limit.attempts * 500, 2000)));
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

  const remainingAttempts = Math.max(0, MAX_ATTEMPTS - getRateLimit().attempts);

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

          {!isSignUp && !isLockedOut && remainingAttempts < MAX_ATTEMPTS && (
            <p className="text-xs text-amber-600 mb-2">
              Noch {remainingAttempts} Versuch{remainingAttempts !== 1 ? "e" : ""} verbleibend.
            </p>
          )}

          {isLockedOut && (
            <p className="text-xs text-red-600 mb-2">
              Account gesperrt. Wartezeit: {Math.ceil(lockoutRemaining / 60)}:{String(lockoutRemaining % 60).padStart(2, "0")}
            </p>
          )}

          <div className="form-group">
            <label htmlFor="email">E-Mail-Adresse</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ihre@email.de"
              required
              disabled={isLoading || isLockedOut}
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
              disabled={isLoading || isLockedOut}
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

          <button
            type="submit"
            className="btn-primary"
            disabled={isLoading || isLockedOut}
          >
            {isLoading
              ? isSignUp
                ? "Konto wird erstellt…"
                : "Anmelden…"
              : isSignUp
                ? "Registrieren"
                : "Anmelden"}
          </button>

          {!isSignUp && (
            <div className="text-center mt-2">
              <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                Passwort vergessen?
              </Link>
            </div>
          )}

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
