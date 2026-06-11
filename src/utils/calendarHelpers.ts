/** Samstag (6) und Sonntag (0) — deutsches Kalender-Wochenende */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function weekendClass(date: Date, base = ""): string {
  return isWeekend(date) ? `${base} calendar-day--weekend`.trim() : base;
}
