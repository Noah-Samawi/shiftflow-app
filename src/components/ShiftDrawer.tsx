import { useState, useEffect, useRef, type FormEvent } from "react";
import toast from "react-hot-toast";
import { useComments } from "../hooks/useComments";
import { useAuth } from "../hooks/useAuth";
import { useProfiles } from "../hooks/useProfiles";
import { useCustomers } from "../hooks/useCustomers";
import { supabase } from "../lib/supabaseClient";
import ShiftWhatsAppReportButton from "./scheduler/ShiftWhatsAppReportButton";
import type { Schedule, ScheduleRecurrence } from "../types/database";

export type ShiftDrawerMode = "view" | "create" | "edit";

interface ShiftDrawerProps {
  mode: ShiftDrawerMode;
  schedule: Schedule | null;
  /** Pflicht bei mode === 'create' */
  defaultDate?: string;
  /** Admin: vorausgewählter Mitarbeiter aus der Sidebar */
  defaultEmployeeId?: string;
  onClose: () => void;
  onSave?: (input: {
    employee_id: string | null;
    customer_id: string;
    shift_date: string;
    start_time: string;
    end_time: string;
    tasks: string | null;
    recurrence: ScheduleRecurrence;
    /** Nur bei weekly/biweekly — RPC legt Serientermine an */
    occurrences: number;
    status: Schedule["status"];
  }) => Promise<void>;
  onUpdate?: (
    id: string,
    data: Partial<
      Omit<Schedule, "id" | "created_at" | "profiles" | "customers" | "clients">
    >
  ) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** Admin: von Ansicht in Bearbeitungsmodus wechseln */
  onRequestEdit?: () => void;
  isAdmin: boolean;
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

const RECURRENCE_OPTIONS: { value: ScheduleRecurrence; label: string }[] = [
  { value: "once", label: "Einmalig" },
  { value: "daily_workdays", label: "Mo–Fr (Arbeitstage)" },
  { value: "daily_all", label: "Mo–So (ganze Woche)" },
  { value: "weekly", label: "Wöchentlich" },
  { value: "biweekly", label: "Alle 2 Wochen" },
];

export default function ShiftDrawer({
  mode,
  schedule,
  defaultDate,
  defaultEmployeeId,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  onRequestEdit,
  isAdmin,
}: ShiftDrawerProps) {
  const { user } = useAuth();
  const { profiles, getProfiles } = useProfiles();
  const { customers, getCustomers, loading: loadingCustomers } = useCustomers();
  const { comments, loading: commentsLoading, getComments, addComment } = useComments();
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [tasks, setTasks] = useState("");
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>("once");
  const [occurrences, setOccurrences] = useState(1);
  const [status, setStatus] = useState<Schedule["status"]>("scheduled");
  const [unavailableEmployeeIds, setUnavailableEmployeeIds] = useState<Set<string>>(new Set());
  const [loadingAvailability, setLoadingAvailability] = useState(false);

  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [visible, setVisible] = useState(false);

  const isFormMode = isAdmin && (mode === "create" || mode === "edit");
  const displaySchedule = schedule;

  // Occurrences automatisch setzen wenn Wiederholung wechselt
  useEffect(() => {
    if (mode !== "create") return;
    const defaults: Record<string, number> = {
      once: 1,
      daily_workdays: 5,
      daily_all: 7,
      weekly: 4,
      biweekly: 4,
    };
    setOccurrences(defaults[recurrence] ?? 1);
  }, [recurrence, mode]);

  useEffect(() => {
    if (mode !== "view" || schedule) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [mode, schedule]);

  useEffect(() => {
    if (isFormMode) {
      void getProfiles();
      void getCustomers();
    }
  }, [isFormMode, getProfiles, getCustomers]);

  useEffect(() => {
    if (mode === "create") {
      const initialDate = defaultDate ?? formatToday();
      setSelectedEmployeeIds(defaultEmployeeId ? [defaultEmployeeId] : []);
      setCustomerId("");
      setDateFrom(initialDate);
      setDateTo(initialDate);
      setStartTime("08:00");
      setEndTime("16:00");
      setTasks("");
      setRecurrence("once");
      setOccurrences(1);
      setStatus("scheduled");
      setFormError(null);
      setUnavailableEmployeeIds(new Set());
    } else if (schedule) {
      setSelectedEmployeeIds(schedule.employee_id ? [schedule.employee_id] : []);
      setCustomerId(schedule.customer_id);
      setDateFrom(schedule.shift_date);
      setDateTo(schedule.shift_date);
      setStartTime(normalizeTimeInput(schedule.start_time));
      setEndTime(normalizeTimeInput(schedule.end_time));
      setTasks(schedule.tasks || schedule.instructions || "");
      setRecurrence(schedule.recurrence ?? "once");
      setStatus(schedule.status);
      setFormError(null);
      setUnavailableEmployeeIds(new Set());
    }
  }, [mode, schedule, defaultDate, defaultEmployeeId]);

  const prevScheduleIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (schedule && mode === "view" && schedule.id !== prevScheduleIdRef.current) {
      prevScheduleIdRef.current = schedule.id;
      void getComments(schedule.id);
    }
  }, [schedule, mode, getComments]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (visible) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible]);

  if (mode === "view" && !schedule) return null;
  if ((mode === "create" || mode === "edit") && !isAdmin) return null;

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 220);
  };

  const getDateRange = (from: string, to: string) => {
    const start = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    const result: string[] = [];
    for (
      let current = new Date(start);
      current <= end;
      current.setDate(current.getDate() + 1)
    ) {
      result.push(toLocalDateString(current));
    }
    return result;
  };

  const loadAvailability = async () => {
    if (!dateFrom || !dateTo || !startTime || !endTime) {
      setUnavailableEmployeeIds(new Set());
      return;
    }

    setLoadingAvailability(true);
    const { data, error } = await supabase
      .from("schedules")
      .select("id, employee_id, shift_date, start_time, end_time")
      .gte("shift_date", dateFrom)
      .lte("shift_date", dateTo)
      .order("shift_date");

    if (error) {
      setUnavailableEmployeeIds(new Set());
      setLoadingAvailability(false);
      return;
    }

    const unavailable = new Set<string>();
    const selectedStart = startTime + ":00";
    const selectedEnd = endTime + ":00";
    const excludeId = schedule?.id;

    (data ?? []).forEach((row) => {
      const entry = row as { id: string; employee_id: string | null; shift_date: string; start_time: string; end_time: string };
      if (!entry.employee_id || entry.id === excludeId) return;
      const overlaps = selectedStart < entry.end_time && entry.start_time < selectedEnd;
      if (overlaps) {
        unavailable.add(entry.employee_id);
      }
    });

    setUnavailableEmployeeIds(unavailable);
    setLoadingAvailability(false);
  };

  useEffect(() => {
    void loadAvailability();
  }, [dateFrom, dateTo, startTime, endTime, schedule?.id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isFormMode) return;

    if (!customerId || !dateFrom || !dateTo || selectedEmployeeIds.length === 0) {
      setFormError("Bitte alle Pflichtfelder ausfüllen.");
      toast.error("Bitte Kunde, Datum und Mitarbeiter auswählen.");
      return;
    }
    if (dateFrom > dateTo) {
      setFormError("Das Enddatum muss gleich oder später als das Startdatum sein.");
      return;
    }
    if (startTime >= endTime) {
      setFormError("Endzeit muss nach der Startzeit liegen.");
      return;
    }
    const conflict = selectedEmployeeIds.some((id) => unavailableEmployeeIds.has(id));
    if (conflict) {
      setFormError("Mindestens ein ausgewählter Mitarbeiter ist nicht verfügbar.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const occ =
      recurrence === "once"
        ? 1
        : Math.min(52, Math.max(1, occurrences));

    try {
      const dates = getDateRange(dateFrom, dateTo);
      if (mode === "create" && onSave) {
        for (const employeeId of selectedEmployeeIds) {
          for (const shiftDateValue of dates) {
            await onSave({
              employee_id: employeeId,
              customer_id: customerId,
              shift_date: shiftDateValue,
              start_time: startTime + ":00",
              end_time: endTime + ":00",
              tasks: tasks.trim() || null,
              recurrence,
              occurrences: occ,
              status,
            });
          }
        }

        try {
          const latest = await supabase
            .from("schedules")
            .select("id, employee_id")
            .eq("customer_id", customerId)
            .eq("shift_date", dateFrom)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (latest.data) {
            void supabase.functions.invoke("notify-employee", {
              body: { scheduleId: latest.data.id },
            }).catch(() => {/* Edge Function ggf. nicht deployed */});

            const emp = profiles.find((p) => p.id === latest.data.employee_id);
            if (emp?.phone) {
              const cst = customers.find((c) => c.id === customerId);
              const datum = new Date(dateFrom).toLocaleDateString("de-DE", {
                weekday: "long", day: "2-digit", month: "long", year: "numeric"
              });
              const waMessage =
                `Hallo ${emp.full_name}! ✅\n` +
                `Neue Schicht am ${datum}\n` +
                `🕐 ${startTime} – ${endTime} Uhr\n` +
                `👤 Kunde: ${cst?.name ?? ""}\n` +
                `📋 ${tasks.trim() || "Keine weiteren Hinweise"}\n\n` +
                `M. Sharif Nachbarschaftshilfe`;
              void supabase.functions.invoke("notify-whatsapp", {
                body: {
                  phoneNumber: emp.phone,
                  message: waMessage,
                },
              }).catch(() => {/* Edge Function ggf. nicht deployed */});
            }
          }
        } catch {
          // Benachrichtigungen sind optional - nicht blockieren
        }

        toast.success("Schicht gespeichert!");
        handleClose();
      } else if (mode === "edit" && onUpdate && schedule) {
        const employeeId = selectedEmployeeIds[0] ?? null;
        await onUpdate(schedule.id, {
          employee_id: employeeId,
          customer_id: customerId,
          shift_date: dateFrom,
          start_time: startTime + ":00",
          end_time: endTime + ":00",
          tasks: tasks.trim() || null,
          status,
        });

        if (selectedEmployeeIds.length > 1 && onSave) {
          for (const extraEmployeeId of selectedEmployeeIds.slice(1)) {
            for (const shiftDateValue of dates) {
              await onSave({
                employee_id: extraEmployeeId,
                customer_id: customerId,
                shift_date: shiftDateValue,
                start_time: startTime + ":00",
                end_time: endTime + ":00",
                tasks: tasks.trim() || null,
                recurrence: "once",
                occurrences: 1,
                status,
              });
            }
          }
        }

        toast.success("Schicht aktualisiert!");
        handleClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Fehler beim Speichern";
      setFormError(msg);
      toast.error("Fehler: " + msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!schedule || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(schedule.id);
      handleClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!schedule || !newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await addComment(schedule.id, newComment.trim());
      setNewComment("");
    } finally {
      setSubmittingComment(false);
    }
  };

  const customer =
    displaySchedule?.customers ??
    displaySchedule?.clients ??
    customers.find((c) => c.id === customerId);

  const employee = displaySchedule?.employee_id
    ? profiles.find((p) => p.id === displaySchedule.employee_id)
    : null;

  const formatTime = (t: string) => {
    const [h, m] = t.split(":");
    return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0").slice(0, 2)}`;
  };

  const formatDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("de-DE", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  };

  const isOwnComment = (commentUserId: string | null) =>
    user?.id && commentUserId === user.id;

  const drawerTitle =
    mode === "create"
      ? "Neue Schicht"
      : mode === "edit"
        ? "Schicht bearbeiten"
        : "Schichtdetails";

  return (
    <>
      <div
        className={`drawer-backdrop ${visible ? "drawer-backdrop--visible" : ""}`}
        onClick={handleClose}
      />

      <aside className={`drawer ${visible ? "drawer--open" : ""}`}>
        <div className="drawer-header">
          <h2>{drawerTitle}</h2>
          <button className="drawer-close-btn" onClick={handleClose} type="button">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" />
              <line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        <div className="drawer-body">
          {isFormMode ? (
            <form onSubmit={handleSubmit} className="drawer-form">
              {formError && <div className="modal-error">{formError}</div>}

              <div className="form-group">
                <label htmlFor="drawer-customer">Kunde *</label>
                <select
                  id="drawer-customer"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                  disabled={saving || loadingCustomers}
                >
                  <option value="">
                    {loadingCustomers
                      ? "Wird geladen..."
                      : customers.length === 0
                        ? "Keine Kunden vorhanden"
                        : "— Kunde wählen —"}
                  </option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {customers.length === 0 && !loadingCustomers && (
                  <p className="text-xs text-amber-600 mt-1">
                    Keine Kunden gefunden. Bitte zuerst einen Kunden anlegen.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="drawer-date-from">Datum von *</label>
                <input
                  id="drawer-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="drawer-date-to">Datum bis *</label>
                <input
                  id="drawer-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  required
                  disabled={saving}
                />
              </div>

              <div className="modal-row">
                <div className="form-group">
                  <label htmlFor="drawer-start">Von (Uhrzeit) *</label>
                  <input
                    id="drawer-start"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="drawer-end">Bis (Uhrzeit) *</label>
                  <input
                    id="drawer-end"
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Mitarbeiter *</label>
                <div className="employee-checkbox-grid">
                  {profiles
                    .filter((p) => p.role === "employee")
                    .map((profile) => {
                      const isDisabled = unavailableEmployeeIds.has(profile.id);
                      const isChecked = selectedEmployeeIds.includes(profile.id);

                      return (
                        <label
                          key={profile.id}
                          className={`checkbox-card ${isDisabled ? "checkbox-card--disabled" : ""}`}
                        >
                          <input
                            type="checkbox"
                            disabled={saving || isDisabled}
                            checked={isChecked}
                            onChange={() => {
                              setSelectedEmployeeIds((current) => {
                                if (current.includes(profile.id)) {
                                  return current.filter((id) => id !== profile.id);
                                }
                                return [...current, profile.id];
                              });
                            }}
                          />
                          <span>{profile.full_name}</span>
                          {isDisabled && (
                            <small className="text-xs text-gray-500">
                              belegt
                            </small>
                          )}
                        </label>
                      );
                    })}
                </div>
                {loadingAvailability && (
                  <p className="text-sm text-gray-500 mt-2">
                    Verfügbare Mitarbeiter werden geprüft…
                  </p>
                )}
                {!loadingAvailability && unavailableEmployeeIds.size > 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Ausgewählte Zeiten sind für einige Mitarbeiter nicht verfügbar.
                  </p>
                )}
              </div>

              <div className="form-group form-group--tasks">
                <label htmlFor="drawer-tasks">
                  Aufgaben / Hinweise
                </label>
                <textarea
                  id="drawer-tasks"
                  className="drawer-tasks-field"
                  value={tasks}
                  onChange={(e) => setTasks(e.target.value)}
                  placeholder="Was muss erledigt werden..."
                  rows={3}
                  disabled={saving}
                />
              </div>

              <div className="form-group">
                <label htmlFor="drawer-status">Status</label>
                <select
                  id="drawer-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Schedule["status"])}
                  disabled={saving}
                >
                  <option value="scheduled">Geplant</option>
                  <option value="confirmed">Bestätigt</option>
                  <option value="completed">Abgeschlossen</option>
                  <option value="cancelled">Abgesagt</option>
                </select>
              </div>

              {mode === "create" && (
                <>
                  <div className="form-group">
                    <label htmlFor="drawer-recurrence">Wiederholung</label>
                    <select
                      id="drawer-recurrence"
                      value={recurrence}
                      onChange={(e) =>
                        setRecurrence(e.target.value as ScheduleRecurrence)
                      }
                      disabled={saving}
                    >
                      {RECURRENCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {recurrence !== "once" && (
                    <div className="form-group">
                      <label htmlFor="drawer-occurrences">
                        Anzahl der Wiederholungen
                      </label>
                      <input
                        id="drawer-occurrences"
                        type="number"
                        min={1}
                        max={52}
                        value={occurrences}
                        onChange={(e) =>
                          setOccurrences(
                            Math.min(
                              52,
                              Math.max(1, parseInt(e.target.value, 10) || 1)
                            )
                          )
                        }
                        disabled={saving}
                      />
                      <p className="form-hint form-hint--inline">
                        Serientermine werden per Datenbank-RPC für die nächsten
                        Wochen angelegt (z. B. 12 = drei Monate wöchentlich).
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="drawer-form-actions">
                {mode === "edit" && onDelete && (
                  <button
                    type="button"
                    className="btn-danger-solid"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={saving}
                  >
                    Löschen
                  </button>
                )}
                <div className="drawer-form-actions__right">
                  <button type="button" className="btn-secondary" onClick={handleClose}>
                    Abbrechen
                  </button>
                  <button type="submit" className="btn-primary" disabled={saving}>
                    {saving ? "Speichern…" : mode === "create" ? "Schicht anlegen" : "Speichern"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            displaySchedule && (
              <>
                <div
                  className="drawer-client-badge"
                  style={{ backgroundColor: customer?.color || "#E67E22" }}
                >
                  {customer?.name || "Unbekannter Kunde"}
                </div>

                <div className="drawer-info-grid">
                  <div className="drawer-info-item">
                    <div className="drawer-info-avatar">
                      {employee?.full_name?.charAt(0).toUpperCase() || "?"}
                    </div>
                    <div>
                      <div className="drawer-info-label">Mitarbeiter</div>
                      <div className="drawer-info-value">
                        {employee?.full_name || "Nicht zugewiesen"}
                      </div>
                    </div>
                  </div>
                  <div className="drawer-info-item">
                    <div>
                      <div className="drawer-info-label">Datum</div>
                      <div className="drawer-info-value">
                        {formatDate(displaySchedule.shift_date)}
                      </div>
                    </div>
                  </div>
                  <div className="drawer-info-item">
                    <div>
                      <div className="drawer-info-label">Uhrzeit</div>
                      <div className="drawer-info-value">
                        {formatTime(displaySchedule.start_time)} –{" "}
                        {formatTime(displaySchedule.end_time)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="drawer-status-row">
                  <span
                    className="drawer-status-badge"
                    style={{
                      color: STATUS_COLORS[displaySchedule.status],
                      backgroundColor: STATUS_BG[displaySchedule.status],
                      borderColor: STATUS_COLORS[displaySchedule.status],
                    }}
                  >
                    {displaySchedule.status === "scheduled" && "Geplant"}
                    {displaySchedule.status === "confirmed" && "Bestätigt"}
                    {displaySchedule.status === "completed" && "Abgeschlossen"}
                    {displaySchedule.status === "cancelled" && "Abgesagt"}
                  </span>
                  <div className="drawer-status-row__actions">
                    {isAdmin && onRequestEdit && (
                      <button
                        type="button"
                        className="drawer-action-btn"
                        onClick={onRequestEdit}
                        title="Schicht bearbeiten"
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                <div className="drawer-instructions-card">
                  <div className="drawer-instructions-label">
                    Bericht / Aufgaben für den Mitarbeiter
                  </div>
                  <div className="drawer-instructions-text">
                    {displaySchedule.tasks ||
                      displaySchedule.instructions ||
                      (isAdmin
                        ? "Noch kein Bericht hinterlegt."
                        : "Für diesen Einsatz wurden keine Aufgaben hinterlegt.")}
                  </div>
                </div>

                {isAdmin && (
                  <ShiftWhatsAppReportButton schedule={displaySchedule} variant="full" />
                )}

                {displaySchedule.recurrence && displaySchedule.recurrence !== "once" && (
                  <p className="drawer-recurrence-hint">
                    Serientermin:{" "}
                    {displaySchedule.recurrence === "weekly" ? "Jede Woche" : "Alle 2 Wochen"}
                  </p>
                )}

                {/* Admin: Kommentar-Thread; Mitarbeiter: reines Lesedashboard ohne Chat */}
                {isAdmin && (
                  <>
                    <div className="drawer-divider" />
                    <div className="drawer-comments-header">
                      <span>Updates &amp; Notizen</span>
                    </div>
                    <div className="drawer-comments-list">
                      {commentsLoading && comments.length === 0 && (
                        <div className="drawer-comments-empty">Wird geladen…</div>
                      )}
                      {!commentsLoading && comments.length === 0 && (
                        <div className="drawer-comments-empty">Noch keine Updates</div>
                      )}
                      {comments.map((c) => {
                        const own = isOwnComment(c.user_id);
                        const initials =
                          c.profiles?.full_name
                            ?.split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2) || "?";
                        return (
                          <div
                            key={c.id}
                            className={`drawer-chat-msg ${own ? "drawer-chat-msg--own" : ""}`}
                          >
                            {!own && <div className="drawer-chat-avatar">{initials}</div>}
                            <div className="drawer-chat-bubble">
                              <div className="drawer-chat-meta">
                                <span className="drawer-chat-name">
                                  {c.profiles?.full_name || "Unbekannt"}
                                </span>
                                <span className="drawer-chat-time">
                                  {new Date(c.created_at).toLocaleString("de-DE", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                              <div className="drawer-chat-text">{c.message}</div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={commentsEndRef} />
                    </div>
                  </>
                )}
              </>
            )
          )}

          {showDeleteConfirm && (
            <div className="drawer-delete-confirm">
              <p>Diese Schicht endgültig löschen?</p>
              <div className="drawer-delete-confirm__actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn-danger-solid"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Löschen…" : "Löschen"}
                </button>
              </div>
            </div>
          )}
        </div>

        {mode === "view" && schedule && isAdmin && (
          <form onSubmit={handleAddComment} className="drawer-chat-input">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Kommentar schreiben..."
              disabled={submittingComment}
            />
            <button
              type="submit"
              className="drawer-chat-send"
              disabled={submittingComment || !newComment.trim()}
            >
              Senden
            </button>
          </form>
        )}
      </aside>
    </>
  );
}

function formatToday(): string {
  return toLocalDateString(new Date());
}

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeTimeInput(t: string): string {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${(m ?? "00").padStart(2, "0").slice(0, 2)}`;
}
