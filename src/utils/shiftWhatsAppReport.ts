import type { Schedule } from "../types/database";
import { formatTime24 } from "./formatTime";
import { buildWhatsAppLink } from "./whatsapp";
import { supabase } from "../lib/supabaseClient";

/**
 * Datum im deutschen Langformat inkl. Wochentag.
 * Parst die ISO-Zeichenkette komponentenweise, um Zeitzonen-Verschiebungen
 * (z. B. ein Tag zurück bei UTC-Konvertierung) zu vermeiden.
 */
export function formatDateDE(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Baut die Admin-Nachricht für den automatischen Schichtenreport (WhatsApp).
 * Datenquelle: geladene Schicht inkl. Join profiles + customers.
 *
 * @param dateText optionaler vorbereiteter Datumstext (z. B. Serien-Zeitraum
 *   "von … bis …"). Ohne Angabe wird der Einzeltag dieser Schicht verwendet.
 */
export function buildShiftReportMessage(schedule: Schedule, dateText?: string): string {
  const employeeName =
    schedule.profiles?.full_name?.trim() || "Mitarbeiter/in";
  const customer = schedule.customers ?? schedule.clients;
  const customerName = customer?.name?.trim() || "—";
  const address = customer?.address?.trim();
  const tasks =
    schedule.tasks?.trim() ||
    schedule.instructions?.trim() ||
    "Keine besonderen Hinweise.";

  const dateLabel = dateText ?? `am ${formatDateDE(schedule.shift_date)}`;
  const timeFrom = formatTime24(schedule.start_time);
  const timeTo = formatTime24(schedule.end_time);

  // Zeilenumbrüche (\n) werden von encodeURIComponent zu %0A kodiert.
  const lines = [
    `Hallo ${employeeName},`,
    `du hast eine Schicht ${dateLabel} von ${timeFrom} bis ${timeTo}`,
    `beim Kunden ${customerName}.`,
  ];

  // Adresszeile nur anhängen, wenn eine Adresse hinterlegt ist.
  if (address) {
    lines.push(`Adresse: ${address}`);
  }

  lines.push(`Aufgaben: ${tasks}`);

  return lines.join("\n");
}

/**
 * Ermittelt den Datumstext für die Nachricht.
 * Gehört die Schicht zu einer Serie (series_id), wird der Gesamt-Zeitraum
 * (erster bis letzter Tag) geladen und als "von … bis …" zurückgegeben.
 * Andernfalls (Einzelschicht oder Serie mit nur einem Tag): "am …".
 */
export async function buildShiftReportDateText(schedule: Schedule): Promise<string> {
  if (schedule.series_id) {
    const { data: seriesShifts } = await supabase
      .from("schedules")
      .select("shift_date")
      .eq("series_id", schedule.series_id)
      .order("shift_date", { ascending: true });

    if (seriesShifts && seriesShifts.length > 1) {
      const firstDate = seriesShifts[0].shift_date as string;
      const lastDate = seriesShifts[seriesShifts.length - 1].shift_date as string;
      return `von ${formatDateDE(firstDate)} bis ${formatDateDE(lastDate)}`;
    }
  }
  return `am ${formatDateDE(schedule.shift_date)}`;
}

/** wa.me-Link an die Telefonnummer des zugewiesenen Mitarbeiters inkl. vorgefülltem Text (Einzeltag). */
export function buildShiftReportWhatsAppUrl(schedule: Schedule): string | null {
  const phone = schedule.profiles?.phone;
  const message = buildShiftReportMessage(schedule);
  return buildWhatsAppLink(phone, message);
}

/**
 * Serien-bewusste Variante: lädt bei Serien-Schichten den Gesamt-Zeitraum
 * und baut den wa.me-Link mit "von … bis …".
 */
export async function buildShiftReportWhatsAppUrlAsync(
  schedule: Schedule
): Promise<string | null> {
  const phone = schedule.profiles?.phone;
  const dateText = await buildShiftReportDateText(schedule);
  const message = buildShiftReportMessage(schedule, dateText);
  return buildWhatsAppLink(phone, message);
}
