import { useState, useEffect, useRef, type FormEvent } from "react";
import { useComments } from "../hooks/useComments";
import { useAuth } from "../hooks/useAuth";
import type { Schedule } from "../types/database";
import AddShiftModal from "./AddShiftModal";

interface ShiftDrawerProps {
  schedule: Schedule | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<Omit<Schedule, "id" | "created_at" | "profiles" | "clients">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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

export default function ShiftDrawer({
  schedule,
  onClose,
  onUpdate,
  onDelete,
  isAdmin,
}: ShiftDrawerProps) {
  const { user } = useAuth();
  const { comments, loading: commentsLoading, getComments, addComment } = useComments();
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const [newComment, setNewComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [visible, setVisible] = useState(false);

  // Trigger slide-in animation
  useEffect(() => {
    if (schedule) {
      // Next frame so CSS transition picks it up
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [schedule]);

  // Load comments when schedule changes
  const prevScheduleIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (schedule && schedule.id !== prevScheduleIdRef.current) {
      prevScheduleIdRef.current = schedule.id;
      getComments(schedule.id);
    }
  }, [schedule, getComments]);

  // Auto-scroll to bottom on new comments
  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (schedule) window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [schedule, onClose]);

  if (!schedule) return null;

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await addComment(schedule.id, newComment.trim());
      setNewComment("");
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(schedule.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setVisible(false);
    // Wait for animation to finish before unmounting
    setTimeout(onClose, 220);
  };

  const formatTime = (t: string) => {
    return t.slice(0, 5);
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

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${visible ? "drawer-backdrop--visible" : ""}`}
        onClick={handleClose}
      />

      {/* Drawer panel */}
      <aside className={`drawer ${visible ? "drawer--open" : ""}`}>
        {/* Header */}
        <div className="drawer-header">
          <h2>Schichtdetails</h2>
          <button className="drawer-close-btn" onClick={handleClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="4" x2="14" y2="14" />
              <line x1="14" y1="4" x2="4" y2="14" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="drawer-body">
          {/* Client badge */}
          <div className="drawer-client-badge" style={{ backgroundColor: schedule.clients?.color || "#E67E22" }}>
            {schedule.clients?.name || "Unbekannter Kunde"}
          </div>

          {/* Info grid */}
          <div className="drawer-info-grid">
            <div className="drawer-info-item">
              <div className="drawer-info-avatar">
                {schedule.profiles?.full_name?.charAt(0).toUpperCase() || "?"}
              </div>
              <div>
                <div className="drawer-info-label">Mitarbeiter</div>
                <div className="drawer-info-value">
                  {schedule.profiles?.full_name || "Nicht zugewiesen"}
                </div>
              </div>
            </div>
            <div className="drawer-info-item">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <rect x="2" y="3" width="14" height="13" rx="2" />
                <line x1="2" y1="7" x2="16" y2="7" />
                <line x1="5" y1="1" x2="5" y2="4" />
                <line x1="13" y1="1" x2="13" y2="4" />
              </svg>
              <div>
                <div className="drawer-info-label">Datum</div>
                <div className="drawer-info-value">{formatDate(schedule.shift_date)}</div>
              </div>
            </div>
            <div className="drawer-info-item">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="9" cy="9" r="7" />
                <line x1="9" y1="5" x2="9" y2="9" />
                <line x1="9" y1="9" x2="12" y2="11" />
              </svg>
              <div>
                <div className="drawer-info-label">Uhrzeit</div>
                <div className="drawer-info-value">
                  {formatTime(schedule.start_time)} – {formatTime(schedule.end_time)}
                </div>
              </div>
            </div>
          </div>

          {/* Status badge */}
          <div className="drawer-status-row">
            <span
              className="drawer-status-badge"
              style={{
                color: STATUS_COLORS[schedule.status],
                backgroundColor: STATUS_BG[schedule.status],
                borderColor: STATUS_COLORS[schedule.status],
              }}
            >
              {schedule.status === "scheduled" && "Geplant"}
              {schedule.status === "confirmed" && "Bestätigt"}
              {schedule.status === "completed" && "Abgeschlossen"}
              {schedule.status === "cancelled" && "Abgesagt"}
            </span>
            {isAdmin && (
              <div className="drawer-admin-actions">
                <button
                  className="drawer-action-btn"
                  onClick={() => setEditModalOpen(true)}
                  title="Schicht bearbeiten"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                  </svg>
                </button>
                <button
                  className="drawer-action-btn drawer-action-btn--danger"
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Schicht löschen"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4h12" />
                    <path d="M5 4V2h6v2" />
                    <path d="M3 4l1 10h8l1-10" />
                    <line x1="6" y1="7" x2="6" y2="11" />
                    <line x1="10" y1="7" x2="10" y2="11" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Delete confirm */}
          {showDeleteConfirm && (
            <div className="drawer-delete-confirm">
              <p>Diese Schicht endgültig löschen?</p>
              <div className="drawer-delete-confirm__actions">
                <button className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                  Abbrechen
                </button>
                <button className="btn-danger-solid" onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Löschen…" : "Löschen"}
                </button>
              </div>
            </div>
          )}

          {/* Instructions */}
          {schedule.instructions && (
            <div className="drawer-instructions-card">
              <div className="drawer-instructions-label">Aufgabenbeschreibung</div>
              <div className="drawer-instructions-text">{schedule.instructions}</div>
            </div>
          )}

          {/* Divider */}
          <div className="drawer-divider" />

          {/* Comment thread */}
          <div className="drawer-comments-header">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 10c0 .6-.4 1-1 1H5l-3 3V3c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v7z" />
            </svg>
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
              const initials = c.profiles?.full_name
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
                  {!own && (
                    <div className="drawer-chat-avatar">{initials}</div>
                  )}
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
        </div>

        {/* Sticky comment input */}
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
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="9" x2="16" y2="9" />
              <path d="M10 3l6 6-6 6" />
            </svg>
          </button>
        </form>
      </aside>

      {/* Edit Modal */}
      {editModalOpen && (
        <AddShiftModal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSave={async () => {}}
          onUpdate={onUpdate}
          clientId={schedule.client_id}
          clientName={schedule.clients?.name || ""}
          date={schedule.shift_date}
          editSchedule={schedule}
        />
      )}
    </>
  );
}
