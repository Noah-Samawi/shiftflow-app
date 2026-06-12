import type { AuthError } from "@supabase/supabase-js";

/** Übersetzt Supabase-Auth-Fehler in verständliche deutsche Meldungen. */
export function toGermanAuthError(error: AuthError | Error): Error {
  const message = error.message.toLowerCase();
  const status = (error as AuthError).status;

  // ── 500: Supabase Auth server crash (hook, trigger, or DB issue) ───────────
  // Happens when a Supabase Auth Hook is configured but the target DB function
  // fails or doesn't exist. Check: Supabase Dashboard → Authentication → Hooks.
  if (status === 500 || message.includes("unexpected_failure")) {
    return new Error(
      "Der Anmelde-Dienst ist momentan nicht verfügbar (Serverfehler 500). " +
      "Bitte prüfen Sie unter Supabase → Authentication → Hooks, ob alle " +
      "konfigurierten Hooks korrekt eingerichtet sind, und versuchen Sie es erneut."
    );
  }

  // "Database error loading user" → login-time profile missing (orphaned auth user)
  // Must be checked BEFORE the broader "database error" catch below.
  if (message.includes("database error loading user")) {
    return new Error(
      "Anmeldung fehlgeschlagen. Bitte wenden Sie sich an den Administrator."
    );
  }

  // "Database error finding user" → usually a trigger/migration problem on signup
  if (
    message.includes("database error finding user") ||
    message.includes("hook") ||
    message.includes("trigger")
  ) {
    return new Error(
      "Registrierung momentan nicht möglich. Bitte prüfen Sie, ob das SQL-Skript in Supabase ausgeführt wurde (Tabellen + Trigger). Falls der Fehler weiterhin auftritt, kontaktieren Sie den Support."
    );
  }

  // Generic database errors that don't fit the above categories
  if (message.includes("database error")) {
    return new Error(
      "Ein Datenbankfehler ist aufgetreten. Bitte versuchen Sie es erneut oder kontaktieren Sie den Support."
    );
  }

  if (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("user already exists") ||
    message.includes("duplicate key")
  ) {
    return new Error(
      "Diese E-Mail-Adresse ist bereits registriert. Bitte melden Sie sich an."
    );
  }
  if (message.includes("invalid login credentials")) {
    return new Error("E-Mail oder Passwort ist falsch.");
  }
  if (message.includes("email not confirmed")) {
    return new Error(
      "Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse, bevor Sie sich anmelden."
    );
  }
  if (message.includes("password") && message.includes("least")) {
    return new Error("Das Passwort muss mindestens 6 Zeichen lang sein.");
  }

  return new Error(error.message || "Authentifizierung fehlgeschlagen.");
}
