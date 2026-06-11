/**
 * Datum lokal formatieren ohne UTC-Bug.
 * `toISOString()` verschiebt um Zeitzone – daher `.getFullYear()` etc. verwenden.
 */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Datumsbereich generieren (inklusiv).
 */
export function getDateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const fin = new Date(end);
  fin.setHours(0, 0, 0, 0);
  while (cur <= fin) {
    dates.push(toLocalDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/**
 * Deutsches Datumsformat: "Di, 16.06.2026"
 */
export function formatDateDE(
  dateStr: string,
  options: { showWeekday?: boolean } = { showWeekday: true }
): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("de-DE", {
    weekday: options.showWeekday ? "short" : undefined,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Datumsbereich als String: "Di, 16.06. – Fr, 19.06.2026"
 */
export function formatDateRangeDE(
  startStr: string,
  endStr?: string
): string {
  if (!endStr || startStr === endStr) {
    return formatDateDE(startStr);
  }
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  const sStr = s.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const eStr = e.toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${sStr} – ${eStr}`;
}

/**
 * Stunden zwischen zwei Zeitstrings berechnen: "08:00" - "16:00" = 8
 */
export function calcHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, (eh * 60 + em - sh * 60 - sm) / 60);
}

/**
 * Stunden zwischen zwei `time` Spalten (SQL time als "HH:MM:SS" oder "HH:MM")
 */
export function calcHoursFromTimes(
  startTime: string,
  endTime: string
): number {
  const s = startTime.slice(0, 5);
  const e = endTime.slice(0, 5);
  return calcHours(s, e);
}
