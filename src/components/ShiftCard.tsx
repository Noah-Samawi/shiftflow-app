import type { Schedule } from "../types/database";
import { formatTimeRange24 } from "../utils/formatTime";

interface ShiftCardProps {
  schedule: Schedule;
  onClick: (schedule: Schedule) => void;
}

const STATUS_COLORS: Record<Schedule["status"], string> = {
  scheduled: "#F59E0B",
  confirmed: "#10B981",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

const STATUS_BG: Record<Schedule["status"], string> = {
  scheduled: "#FFFBEB",
  confirmed: "#ECFDF5",
  completed: "#F9FAFB",
  cancelled: "#FEF2F2",
};

export default function ShiftCard({ schedule, onClick }: ShiftCardProps) {
  const firstName = schedule.profiles?.full_name?.split(" ")[0] || "Nicht zugewiesen";
  const color =
    schedule.customers?.color ??
    schedule.clients?.color ??
    STATUS_COLORS[schedule.status];

  return (
    <button
      className="s-shift-card"
      style={{
        borderLeftColor: color,
        backgroundColor: STATUS_BG[schedule.status],
      }}
      onClick={() => onClick(schedule)}
      title={`${schedule.profiles?.full_name || "Nicht zugewiesen"} – ${schedule.instructions || "Keine Aufgabenbeschreibung"}`}
    >
      <div className="s-shift-card__time">
        {formatTimeRange24(schedule.start_time, schedule.end_time)}
      </div>
      <div className="s-shift-card__employee">{firstName}</div>
      {schedule.instructions && (
        <div className="s-shift-card__instructions">{schedule.instructions}</div>
      )}
      <span
        className="s-shift-card__status"
        style={{ color: STATUS_COLORS[schedule.status] }}
      >
        {schedule.status === "scheduled" && "Geplant"}
        {schedule.status === "confirmed" && "Bestätigt"}
        {schedule.status === "completed" && "Abgeschlossen"}
        {schedule.status === "cancelled" && "Abgesagt"}
      </span>
    </button>
  );
}
