import { useState, useEffect, type FormEvent } from "react";
import { useProfiles } from "../hooks/useProfiles";
import type { Profile } from "../types/database";

interface EmployeeFormData {
  full_name: string;
  phone: string;
  address: string;
  weekly_hours: number;
  role: Profile["role"];
  email: string;
}

const emptyForm: EmployeeFormData = {
  full_name: "",
  phone: "",
  address: "",
  weekly_hours: 40,
  role: "employee",
  email: "",
};

export default function EmployeesPage() {
  const { profiles, loading, error, getProfiles, updateProfile, deleteProfile } = useProfiles();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<EmployeeFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    getProfiles();
  }, [getProfiles]);

  const openAdd = () => {
    setEditingProfile(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (profile: Profile) => {
    setEditingProfile(profile);
    setForm({
      full_name: profile.full_name,
      phone: profile.phone || "",
      address: profile.address || "",
      weekly_hours: profile.weekly_hours,
      role: profile.role,
      email: "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) {
      setFormError("Name ist erforderlich");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingProfile) {
        await updateProfile(editingProfile.id, {
          full_name: form.full_name.trim(),
          phone: form.phone || null,
          address: form.address || null,
          weekly_hours: form.weekly_hours,
          role: form.role,
        });
      } else {
        // Cannot insert a profile directly — profiles are auto-created
        // when a user signs up via the Supabase auth trigger.
        // Show an error to guide the user to invite instead.
        setFormError(
          "Mitarbeiter müssen sich selbst über die Registrierungsseite anmelden. Sobald sie registriert sind, erscheinen sie automatisch in dieser Liste und du kannst ihnen Schichten zuweisen."
        );
        setSaving(false);
        return;
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProfile(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="master-page">
      {/* Header */}
      <div className="page-actions">
        <button className="btn-primary" onClick={openAdd}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="2" x2="8" y2="14" />
            <line x1="2" y1="8" x2="14" y2="8" />
          </svg>
          Neuer Mitarbeiter
        </button>
      </div>

      {loading && profiles.length === 0 && (
        <div className="status-msg">Laden…</div>
      )}
      {error && <div className="status-msg error">{error}</div>}

      {/* Table */}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Telefon</th>
              <th>Adresse</th>
              <th>Wochenstunden</th>
              <th>Rolle</th>
              <th className="col-actions">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Noch keine Mitarbeiter.{" "}
                  <button className="link-btn" onClick={openAdd}>
                    Ersten Mitarbeiter anlegen →
                  </button>
                </td>
              </tr>
            )}
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="employee-name-cell">
                    <div className="user-avatar-sm">
                      {p.full_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{p.full_name}</span>
                  </div>
                </td>
                <td>{p.phone || "—"}</td>
                <td>{p.address || "—"}</td>
                <td>{p.weekly_hours}h</td>
                <td>
                  <span className={`role-badge ${p.role === "admin" ? "role-badge--admin" : ""}`}>
                    {p.role === "admin" ? "Admin" : "Mitarbeiter"}
                  </span>
                </td>
                <td className="col-actions">
                  <div className="row-actions">
                    <button
                      className="row-action-btn"
                      onClick={() => openEdit(p)}
                      title="Bearbeiten"
                    >
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z" />
                      </svg>
                    </button>
                    {deleteConfirm === p.id ? (
                      <div className="delete-confirm-inline">
                        <button
                          className="row-action-btn row-action-btn--danger"
                          onClick={() => handleDelete(p.id)}
                          title="Löschen bestätigen"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 4L3 14" />
                            <path d="M3 4l10 10" />
                          </svg>
                        </button>
                        <button
                          className="row-action-btn"
                          onClick={() => setDeleteConfirm(null)}
                          title="Abbrechen"
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M4 8h8" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        className="row-action-btn row-action-btn--danger"
                        onClick={() => setDeleteConfirm(p.id)}
                        title="Löschen"
                      >
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 4h12" />
                          <path d="M5 4V2h6v2" />
                          <path d="M3 4l1 10h8l1-10" />
                        </svg>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingProfile ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</h2>
              <button className="modal-close" onClick={() => setModalOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14" />
                  <line x1="14" y1="4" x2="4" y2="14" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              {formError && <div className="modal-error">{formError}</div>}

              <div className="form-group">
                <label htmlFor="fullname">Vollständiger Name *</label>
                <input id="fullname" type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required disabled={saving} />
              </div>

              <div className="modal-row">
                <div className="form-group">
                  <label htmlFor="phone">Telefon</label>
                  <input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={saving} />
                </div>
                <div className="form-group">
                  <label htmlFor="hours">Wochenstunden</label>
                  <input id="hours" type="number" min="0" max="80" value={form.weekly_hours} onChange={(e) => setForm({ ...form, weekly_hours: parseInt(e.target.value) || 0 })} disabled={saving} />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="address">Adresse</label>
                <input id="address" type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={saving} />
              </div>

              <div className="form-group">
                <label>Rolle</label>
                <div className="role-toggle">
                  <button
                    type="button"
                    className={`role-toggle-btn ${form.role === "employee" ? "role-toggle-btn--active" : ""}`}
                    onClick={() => setForm({ ...form, role: "employee" })}
                  >
                    Mitarbeiter
                  </button>
                  <button
                    type="button"
                    className={`role-toggle-btn ${form.role === "admin" ? "role-toggle-btn--active" : ""}`}
                    onClick={() => setForm({ ...form, role: "admin" })}
                  >
                    Admin
                  </button>
                </div>
              </div>

              {!editingProfile && (
                <div className="form-hint">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <circle cx="7" cy="7" r="6" />
                    <line x1="7" y1="4" x2="7" y2="7.5" />
                    <circle cx="7" cy="10" r="0.5" fill="currentColor" />
                  </svg>
                  Profile werden automatisch erstellt, wenn sich ein Benutzer registriert. Der erste Benutzer wird automatisch Admin.
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Abbrechen</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Speichern…" : editingProfile ? "Änderungen speichern" : "Anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
