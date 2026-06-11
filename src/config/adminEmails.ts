/** E-Mails mit garantiertem Admin-Zugriff (Fallback, falls Profil-Query verzögert fehlschlägt). */
export const ADMIN_EMAILS = [
  "noahalsamawi688@gmail.com",
] as const;

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}
