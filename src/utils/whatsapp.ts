/**
 * Bereinigt eine Telefonnummer für wa.me-Links:
 * - Entfernt Leerzeichen und Sonderzeichen
 * - Entfernt führendes "0" und setzt "49" vorne
 * - Entfernt führendes "+"
 * Beispiel: "0151 23456789" → "4915123456789"
 */
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;

  // Entferne alle nicht-Ziffern und nicht-Plus-Zeichen
  let cleaned = phone.replace(/\s/g, '').replace(/[^0-9+]/g, '');

  if (cleaned.startsWith('+')) {
    cleaned = cleaned.replace('+', '');
  } else if (cleaned.startsWith('0')) {
    cleaned = '49' + cleaned.slice(1);
  } else {
    cleaned = '49' + cleaned;
  }

  return cleaned.length >= 6 ? cleaned : null;
}

/**
 * Baut einen WhatsApp-Link mit vorgefüllter Nachricht.
 */
export function buildWhatsAppLink(phone: string | null | undefined, message?: string): string | null {
  const normalized = formatPhoneForWhatsApp(phone);
  if (!normalized) return null;

  let url = `https://wa.me/${normalized}`;
  if (message?.trim()) {
    url += `?text=${encodeURIComponent(message.trim())}`;
  }
  return url;
}

/** Legacy: Link ohne Nachricht */
export function buildWhatsAppUrl(phone: string | null | undefined): string | null {
  return buildWhatsAppLink(phone);
}
