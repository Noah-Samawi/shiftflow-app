import SchedulerCalendar from "../components/scheduler/SchedulerCalendar";

/**
 * Dienstplan: Admin = Sidebar + Kalender; Mitarbeiter = nur eigenes Kalender-Dashboard.
 */
export default function SchedulePage() {
  return (
    <div className="schedule-page h-full min-h-0 flex flex-col text-left overflow-hidden">
      <SchedulerCalendar />
    </div>
  );
}
