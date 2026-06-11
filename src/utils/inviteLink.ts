/**
 * Generiert einen Einladungslink für Mitarbeiter-Self-Registration.
 */
export function generateInviteLink(orgId: string, email: string): string {
  const base = window.location.origin;
  const params = new URLSearchParams({
    org: orgId,
    email: email,
  });
  return `${base}/join?${params.toString()}`;
}

/**
 * Baut eine WhatsApp-Einladungsnachricht.
 */
export function buildInviteMessage(orgName: string, inviteLink: string): string {
  return (
    `Hallo! 👋\n` +
    `Du wurdest als Mitarbeiter bei ${orgName} eingeladen.\n` +
    `Bitte registriere dich hier:\n` +
    `${inviteLink}\n\n` +
    `M. Sharif Nachbarschaftshilfe`
  );
}
