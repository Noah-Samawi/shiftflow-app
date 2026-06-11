import type { AuthError } from "@supabase/supabase-js";

/** Übersetzt Supabase-Auth-Fehler in verständliche deutsche Meldungen. */
export function toGermanAuthError(error: AuthError | Error): Error {
  const message = error.message.toLowerCase();

  // Supabase Auth: "Database error finding user" → meist Trigger-Problem
  if (
    message.includes("database error finding user") ||
    message.includes("database error") ||
    message.includes("hook") ||
    message.includes("trigger")
  ) {
    return new Error(
      "Registrierung momentan nicht möglich. Bitte prüfen Sie, ob das SQL-Skript in Supabase ausgeführt wurde (Tabellen + Trigger). Falls der Fehler weiterhin auftritt, kontaktieren Sie den Support."
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
