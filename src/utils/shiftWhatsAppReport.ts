import type { Schedule } from "../types/database";
import { formatTime24 } from "./formatTime";
import { buildWhatsAppLink } from "./whatsapp";

/**
 * Baut die Admin-Nachricht für den automatischen Schichtenreport (WhatsApp).
 * Datenquelle: geladene Schicht inkl. Join profiles + customers.
 */
export function buildShiftReportMessage(schedule: Schedule): string {
  const employeeName =
    schedule.profiles?.full_name?.trim() || "Mitarbeiter/in";
  const customer = schedule.customers ?? schedule.clients;
  const customerName = customer?.name?.trim() || "—";
  const tasks =
    schedule.tasks?.trim() ||
    schedule.instructions?.trim() ||
    "Keine besonderen Hinweise.";

  const dateLabel = new Date(schedule.shift_date + "T12:00:00").toLocaleDateString(
    "de-DE",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );
  const timeFrom = formatTime24(schedule.start_time);
  const timeTo = formatTime24(schedule.end_time);

  return (
    `Hallo ${employeeName}, du hast eine Schicht am ${dateLabel} ` +
    `von ${timeFrom} bis ${timeTo} beim Kunden ${customerName}. ` +
    `Aufgaben: ${tasks}`
  );
}

/** wa.me-Link an die Telefonnummer des zugewiesenen Mitarbeiters inkl. vorgefülltem Text */
export function buildShiftReportWhatsAppUrl(schedule: Schedule): string | null {
  const phone = schedule.profiles?.phone;
  const message = buildShiftReportMessage(schedule);
  return buildWhatsAppLink(phone, message);
}
