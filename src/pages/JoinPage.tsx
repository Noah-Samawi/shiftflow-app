import { useState, useEffect, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

export default function JoinPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const orgId = searchParams.get("org");
  const prefillEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(prefillEmail);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingOrg, setCheckingOrg] = useState(true);

  // Verify org exists
  useEffect(() => {
    async function verifyOrg() {
      if (!orgId) {
        setError("Ungültiger Einladungslink. Keine Organisation angegeben.");
        setCheckingOrg(false);
        return;
      }
      const { data, error: err } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", orgId)
        .single();

      if (err || !data) {
        setError("Ungültiger Einladungslink. Organisation nicht gefunden.");
      } else {
        setOrgName(data.name);
      }
      setCheckingOrg(false);
    }
    void verifyOrg();
  }, [orgId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!orgId) {
      setError("Ungültiger Einladungslink.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }

    if (password.length < 6) {
      setError("Passwort muss mindestens 6 Zeichen haben.");
      return;
    }

    if (!fullName.trim()) {
      setError("Name ist erforderlich.");
      return;
    }

    setLoading(true);
    try {
      // 1. Sign up with Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName.trim() },
        },
      });

      if (authErr) throw authErr;

      if (!authData.user) {
        throw new Error("Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.");
      }

      // 2. Update profile with org_id and phone
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({
          org_id: orgId,
          phone: phone || null,
          role: "employee",
        })
        .eq("id", authData.user.id);

      if (profileErr) {
        console.warn("Profile update warning:", profileErr.message);
        // Non-fatal: Trigger may have already set some fields
      }

      toast.success("Konto erstellt! Sie können sich jetzt anmelden.");
      navigate("/login", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registrierung fehlgeschlagen";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checkingOrg) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="app-loading">
            <div className="spinner" />
            <p>Einladung wird geprüft…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#1B4F72" />
              <path d="M10 16L14 20L22 12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="logo-text">ShiftFlow</span>
        </div>

        <h1 className="login-title">Mitarbeiter-Registrierung</h1>
        <p className="login-subtitle">
          {orgName
            ? <>Sie wurden zu <strong>{orgName}</strong> eingeladen. Erstellen Sie Ihr Konto.</>
            : "Erstellen Sie Ihr Mitarbeiter-Konto."}
        </p>

        {error && <div className="login-error">{error}</div>}

        {!orgId ? (
          <div className="login-error">
            Dieser Link ist ungültig. Bitte wenden Sie sich an Ihren Administrator.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <label htmlFor="join-email">E-Mail-Adresse</label>
              <input
                id="join-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ihre@email.de"
                required
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label htmlFor="join-name">Vollständiger Name *</label>
              <input
                id="join-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Max Mustermann"
                required
                disabled={loading}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="join-phone">Telefonnummer</label>
              <input
                id="join-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0151 23456789"
                disabled={loading}
                autoComplete="tel"
              />
            </div>

            <div className="form-group">
              <label htmlFor="join-password">Passwort</label>
              <input
                id="join-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="join-confirm">Passwort bestätigen</label>
              <input
                id="join-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                disabled={loading}
                autoComplete="new-password"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Konto wird erstellt…" : "Registrieren"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
