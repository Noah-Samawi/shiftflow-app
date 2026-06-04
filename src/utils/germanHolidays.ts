// Berechnet Ostersonntag nach dem Gaußschen Algorithmus
function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface GermanHoliday {
  date: string;      // Format: "YYYY-MM-DD"
  name: string;      // Deutscher Name
  shortName: string; // Kurze Anzeige im Kalender
}

export function getGermanHolidays(year: number): GermanHoliday[] {
  const easter = getEasterSunday(year);

  const holidays: GermanHoliday[] = [
    {
      date: `${year}-01-01`,
      name: "Neujahr",
      shortName: "Neujahr"
    },
    {
      date: addDays(easter, -2).toISOString().split('T')[0],
      name: "Karfreitag",
      shortName: "Karfreitag"
    },
    {
      date: addDays(easter, 1).toISOString().split('T')[0],
      name: "Ostermontag",
      shortName: "Ostermontag"
    },
    {
      date: `${year}-05-01`,
      name: "Tag der Arbeit",
      shortName: "Tag der Arbeit"
    },
    {
      date: addDays(easter, 39).toISOString().split('T')[0],
      name: "Christi Himmelfahrt",
      shortName: "Himmelfahrt"
    },
    {
      date: addDays(easter, 50).toISOString().split('T')[0],
      name: "Pfingstmontag",
      shortName: "Pfingstmontag"
    },
    {
      date: addDays(easter, 60).toISOString().split('T')[0],
      name: "Fronleichnam",
      shortName: "Fronleichnam"
    },
    {
      date: `${year}-10-03`,
      name: "Tag der Deutschen Einheit",
      shortName: "Tag d. Einheit"
    },
    {
      date: `${year}-11-01`,
      name: "Allerheiligen",
      shortName: "Allerheiligen"
    },
    {
      date: `${year}-12-25`,
      name: "1. Weihnachtstag",
      shortName: "Weihnachten"
    },
    {
      date: `${year}-12-26`,
      name: "2. Weihnachtstag",
      shortName: "Weihnachten"
    },
  ];

  return holidays;
}

// Hilfsfunktion: Gibt Feiertag für ein Datum zurück (oder null)
export function getHolidayForDate(
  dateStr: string,
  holidays: GermanHoliday[]
): GermanHoliday | null {
  return holidays.find(h => h.date === dateStr) ?? null;
}
