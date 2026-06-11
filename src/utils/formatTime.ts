/**
 * Formatiert DB-Zeitstrings (HH:mm:ss oder HH:mm) als deutsches 24-Stunden-Format.
 * Kein AM/PM — konsistent für Kalender, Karten und Drawer.
 */
export function formatTime24(time: string): string {
  if (!time) return "";
  const parts = time.trim().split(":");
  const hours = parts[0]?.padStart(2, "0") ?? "00";
  const minutes = (parts[1] ?? "00").padStart(2, "0").slice(0, 2);
  return `${hours}:${minutes}`;
}

export function formatTimeRange24(start: string, end: string): string {
  return `${formatTime24(start)}–${formatTime24(end)}`;
}
