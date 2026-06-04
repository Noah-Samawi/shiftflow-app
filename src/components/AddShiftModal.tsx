import { useState, useEffect, type FormEvent } from "react";
import type { Profile, Schedule } from "../types/database";
import { useProfiles } from "../hooks/useProfiles";

interface AddShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<Schedule, "id" | "created_at" | "profiles" | "clients">) => Promise<void>;
  onUpdate?: (id: string, data: Partial<Omit<Schedule, "id" | "created_at" | "profiles" | "clients">>) => Promise<void>;
  clientId: string;
  clientName: string;
  date: string;
  /** Pass a schedule to edit it instead of creating new */
  editSchedule?: Schedule | null;
}

export default function AddShiftModal({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  clientId,
  clientName,
  date,
  editSchedule,
}: AddShiftModalProps) {
  const { profiles, getProfiles } = useProfiles();
  const isEditing = !!editSchedule;

  const [employeeId, setEmployeeId] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("16:00");
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState<Schedule["status"]>("scheduled");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      getProfiles();
      setError(null);
      if (editSchedule) {
        setEmployeeId(editSchedule.employee_id || "");
        setStartTime(editSchedule.start_time);
        setEndTime(editSchedule.end_time);
        setInstructions(editSchedule.instructions || "");
        setStatus(editSchedule.status);
      } else {
        setEmployeeId("");
        setStartTime("08:00");
        setEndTime("16:00");
        setInstructions("");
        setStatus("scheduled");
      }
    }
  }, [isOpen, editSchedule, getProfiles]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEditing && onUpdate && editSchedule) {
        await onUpdate(editSchedule.id, {
          employee_id: employeeId || null,
          start_time: startTime,
          end_time: endTime,
          instructions: instructions || null,
          status,
        });
      } else {
        await onSave({
          employee_id: employeeId || null,
          client_id: clientId,
          shift_date: date,
          start_time: startTime,
          end_time: endTime,
          instructions: instructions || null,
          status: "scheduled",
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern der Schicht");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("de-DE", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? "Schicht bearbeiten" : "Schicht hinzufügen"}</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" />
              <line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="modal-error">{error}</div>}

          <div className="modal-row">
            <div className="form-group">
              <label>Kunde</label>
              <input type="text" value={clientName} disabled />
            </div>
            <div className="form-group">
              <label>Datum</label>
              <input type="text" value={formatDate(date)} disabled />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="employee">Mitarbeiter</label>
            <select
              id="employee"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={saving}
            >
              <option value="">— Nicht zugewiesen —</option>
              {profiles.map((p: Profile) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-row">
            <div className="form-group">
              <label htmlFor="startTime">Startzeit</label>
              <input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                disabled={saving}
              />
            </div>
            <div className="form-group">
              <label htmlFor="endTime">Endzeit</label>
              <input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                disabled={saving}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="instructions">Aufgabenbeschreibung</label>
            <textarea
              id="instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Besondere Notizen für diese Schicht…"
              rows={3}
              disabled={saving}
            />
          </div>

          {isEditing && (
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select
                id="status"
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
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Speichern…" : isEditing ? "Änderungen speichern" : "Schicht hinzufügen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
