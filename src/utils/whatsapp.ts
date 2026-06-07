/**
 * Bereinigt eine Telefonnummer für wa.me-Links:
 * Entfernt Leerzeichen, Sonderzeichen und führendes '+'.
 * Beispiel: "+49 176 1234567" → "491761234567"
 */
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

export function buildWhatsAppUrl(phone: string | null | undefined): string | null {
  const cleaned = formatPhoneForWhatsApp(phone);
  if (!cleaned) return null;
  return `https://wa.me/${cleaned}`;
}
